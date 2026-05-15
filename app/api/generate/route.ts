import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { blockedResponse, FREE_GENERATIONS_LIMIT, successResponse } from '@/lib/responses/api-responses';
import { generateSchema, strategicMessagingInputSchema } from '@/lib/validation/schemas';
import { getTool } from '@/lib/config/tools';
import { runGeneration } from '@/lib/openai/generate';
import { preflightResponse, withCors } from '@/lib/security/cors';
import { getBackendSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { evaluateGenerationAccess, type Profile } from '@/lib/usage/access';

const STRATEGIC_AUDIENCE_MAP: Record<string, string> = {
  'leadership / board': 'leadership-board',
  funders: 'funders',
  policymakers: 'policymakers',
  'community partners': 'community-partners',
  'internal team': 'internal-team',
  'general public': 'general-public'
};

const STRATEGIC_MODE_MAP: Record<string, string> = {
  standard: 'standard',
  'plain-language': 'plain-language',
  'careful / neutral': 'careful-neutral',
  'highly constrained': 'highly-constrained',
  'more direct': 'more-direct'
};

function toIssueDetails(issues: Array<{ path: (string | number)[]; message: string }>) {
  return issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function invalidRequest(message: string, details: Array<{ path: string; message: string }> = []) {
  return NextResponse.json({ status: 'error', reason: 'invalid_request', message, details }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  const session = await getBackendSession();
  let parsedJson: unknown = null;
  let jsonOk = false;

  try {
    parsedJson = await req.json();
    jsonOk = true;
  } catch {
    console.info('[api/generate] invalid_request', { route: '/api/generate', status: 'invalid_request', contentType, jsonParseSucceeded: false, hasUser: Boolean(session?.userId), hasEmail: Boolean(session?.email), emailVerified: false });
    return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'body', message: 'Request body must be valid JSON.' }]));
  }

  const parsed = generateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const details = toIssueDetails(parsed.error.issues);
    console.info('[api/generate] invalid_request', { route: '/api/generate', status: 'invalid_request', contentType, jsonParseSucceeded: jsonOk, toolId: typeof (parsedJson as any)?.toolId === 'string' ? (parsedJson as any).toolId : null, hasInput: Boolean((parsedJson as any)?.input), inputKeys: Object.keys(((parsedJson as any)?.input && typeof (parsedJson as any).input === 'object') ? (parsedJson as any).input : {}), validationIssues: details, hasUser: Boolean(session?.userId), hasEmail: Boolean(session?.email), emailVerified: false });
    return withCors(req, invalidRequest('Invalid generation request.', details));
  }

  const tool = getTool(parsed.data.toolId);
  if (!tool) return withCors(req, blockedResponse('invalid_tool', 'The requested tool is not available.'));

  if (parsed.data.toolId !== 'strategic-messaging') {
    return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'toolId', message: 'Only strategic-messaging is supported by this endpoint version.' }]));
  }

  const inputValidation = strategicMessagingInputSchema.safeParse(parsed.data.input);
  if (!inputValidation.success) {
    const details = toIssueDetails(inputValidation.error.issues);
    console.info('[api/generate] invalid_request', { route: '/api/generate', status: 'invalid_request', contentType, jsonParseSucceeded: jsonOk, toolId: parsed.data.toolId, hasInput: Boolean((parsed.data as any).input), inputKeys: Object.keys(((parsed.data as any).input && typeof (parsed.data as any).input === 'object') ? (parsed.data as any).input : {}), validationIssues: details, hasUser: Boolean(session?.userId), hasEmail: Boolean(session?.email), emailVerified: false });
    return withCors(req, invalidRequest('Invalid generation request.', details));
  }

  const normalizedAudience = STRATEGIC_AUDIENCE_MAP[inputValidation.data.audience.toLowerCase()] ?? inputValidation.data.audience;
  const normalizedMode = STRATEGIC_MODE_MAP[inputValidation.data.mode.toLowerCase()] ?? inputValidation.data.mode;

  const inputText = [
    `Message: ${inputValidation.data.message}`,
    `Audience: ${normalizedAudience}`,
    `Mode: ${normalizedMode}`,
    inputValidation.data.goalContext ? `Goal context: ${inputValidation.data.goalContext}` : null,
    inputValidation.data.followUpAction ? `Follow-up action: ${inputValidation.data.followUpAction}` : null,
    inputValidation.data.currentOutput ? `Current output: ${JSON.stringify(inputValidation.data.currentOutput)}` : null
  ].filter(Boolean).join('\n');

  if (inputText.length > tool.maxInputChars) return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'input', message: 'Input exceeds allowed length for this tool.' }]));

  const email = session?.email?.toLowerCase();
  const profileRes = session?.userId
    ? await getSupabaseAdmin().from('profiles').select('id,email,email_verified,access_status,access_expires_at,generations_used').eq('id', session.userId).maybeSingle()
    : { data: null };
  const profile = (profileRes.data ?? null) as Profile | null;
  const rateKey = session?.userId ? `gen:${session.userId}` : `gen:anon:${req.headers.get('x-forwarded-for') ?? 'unknown'}`;
  const rate = await checkRateLimit(rateKey, 20, 60);
  const access = evaluateGenerationAccess(profile, rate.limited, null);

  if (!access.allowed && access.reason) {
    return withCors(req, blockedResponse(access.reason, 'Generation is currently blocked.', {
      generationsUsed: profile?.generations_used ?? 0,
      freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
      remainingFreeGenerations: Math.max(0, FREE_GENERATIONS_LIMIT - (profile?.generations_used ?? 0)),
      accessStatus: profile?.access_status ?? 'free'
    }));
  }

  const result = await runGeneration(tool, inputText);
  return withCors(req, successResponse({ requestId: crypto.randomUUID(), toolId: tool.toolId, data: { output: result.outputText }, usage: { generationsUsed: profile?.generations_used ?? 0, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: Math.max(0, FREE_GENERATIONS_LIMIT - (profile?.generations_used ?? 0)), accessStatus: profile?.access_status ?? 'free' } }));
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req);
}
