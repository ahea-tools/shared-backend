import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { blockedResponse, FREE_GENERATIONS_LIMIT, successResponse } from '@/lib/responses/api-responses';
import { careerPositioningInputSchema, careerPositioningOutputSchema, generateSchema, strategicMessagingInputSchema, strategicMessagingOutputSchema } from '@/lib/validation/schemas';
import { getTool } from '@/lib/config/tools';
import { runGeneration } from '@/lib/openai/generate';
import { preflightResponse, withCors } from '@/lib/security/cors';
import { BACKEND_SESSION_COOKIE_NAME, getBackendSessionDetails } from '@/lib/auth/session';
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

function safeGenerationError(message = 'Generation failed. Please try again.', status = 500) {
  return NextResponse.json({ status: 'error', reason: 'generation_failed', message }, { status });
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: 'UnknownError', message: 'Unknown error' };
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? '';
  const sessionDetails = await getBackendSessionDetails();
  const session = sessionDetails.session;
  const hasSessionCookie = Boolean(req.cookies.get(BACKEND_SESSION_COOKIE_NAME)?.value);
  let parsedJson: unknown = null;
  let jsonOk = false;

  const diagnostics = {
    routeVersion: 'generate-career-positioning-debug-v1',
    toolId: null as string | null,
    requestParsed: false,
    inputValidationPassed: false,
    sessionPresent: Boolean(hasSessionCookie),
    sessionValid: Boolean(session?.userId),
    accessDecision: 'error' as 'allowed' | 'blocked' | 'error',
    openaiCallStarted: false,
    openaiCallSucceeded: false,
    structuredOutputValidationPassed: false,
    successWrapperKey: 'output',
    failureStep: null as string | null,
    sanitizedErrorName: null as string | null,
    sanitizedErrorMessage: null as string | null
  };

  try {
    parsedJson = await req.json();
    jsonOk = true;
    diagnostics.requestParsed = true;
  } catch {
    diagnostics.failureStep = 'request_parse_failed';
    console.info('[api/generate] career_positioning_diagnostics', diagnostics);
    console.info('[api/generate] invalid_request', { route: '/api/generate', status: 'invalid_request', contentType, jsonParseSucceeded: false, hasUser: Boolean(session?.userId), hasEmail: Boolean(session?.email), emailVerified: false });
    return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'body', message: 'Request body must be valid JSON.' }]));
  }

  const parsed = generateSchema.safeParse(parsedJson);
  diagnostics.toolId = typeof (parsedJson as any)?.toolId === 'string' ? (parsedJson as any).toolId : null;
  if (!parsed.success) {
    diagnostics.failureStep = 'input_validation_failed';
    const details = toIssueDetails(parsed.error.issues);
    if (diagnostics.toolId === 'career-positioning') console.info('[api/generate] career_positioning_diagnostics', diagnostics);
    console.info('[api/generate] invalid_request', { route: '/api/generate', status: 'invalid_request', contentType, jsonParseSucceeded: jsonOk, toolId: diagnostics.toolId, hasInput: Boolean((parsedJson as any)?.input), inputKeys: Object.keys(((parsedJson as any)?.input && typeof (parsedJson as any).input === 'object') ? (parsedJson as any).input : {}), validationIssues: details, hasUser: Boolean(session?.userId), hasEmail: Boolean(session?.email), emailVerified: false });
    return withCors(req, invalidRequest('Invalid generation request.', details));
  }

  const tool = getTool(parsed.data.toolId);
  if (!tool) {
    console.info('[api/generate] forbidden', { failureReason: 'invalid_toolId', hasSessionCookie, sessionCookieValid: Boolean(session?.userId), toolId: parsed.data.toolId });
    return withCors(req, blockedResponse('invalid_tool', 'The requested tool is not available.'));
  }

  let inputText = '';
  const isCareerTool = parsed.data.toolId === 'career-positioning';

  if (isCareerTool) {
    const inputValidation = careerPositioningInputSchema.safeParse(parsed.data.input);
    if (!inputValidation.success) {
      diagnostics.failureStep = 'input_validation_failed';
      const details = toIssueDetails(inputValidation.error.issues);
      console.info('[api/generate] career_positioning_diagnostics', diagnostics);
      return withCors(req, invalidRequest('Invalid generation request.', details));
    }
    diagnostics.inputValidationPassed = true;
    inputText = [
      'Generation rules:',
      '1. Do not invent facts, credentials, job titles, outcomes, metrics, or claims not provided by the user.',
      '2. Preserve user intent and substance while strengthening clarity and transferability.',
      '3. Avoid generic resume cliches and empty language.',
      '4. Keep output focused on career positioning and professional value, not strategic messaging.',
      '5. Do not use the phrase politically sensitive in user-facing output.',
      '6. Keep tone supportive, practical, and immediately usable.',
      '7. Do not promise interviews, jobs, promotions, contracts, or funding outcomes.',
      `outputType: ${inputValidation.data.outputType}`,
      `professionalContext: ${inputValidation.data.professionalContext}`,
      `currentWork: ${inputValidation.data.currentWork}`,
      `desiredDirection: ${inputValidation.data.desiredDirection}`,
      `emphasis: ${inputValidation.data.emphasis.join(', ')}`,
      `currentLanguage: ${inputValidation.data.currentLanguage}`,
      inputValidation.data.additionalContext ? `additionalContext: ${inputValidation.data.additionalContext}` : null
    ].filter(Boolean).join('\n');
  } else {
    const inputValidation = strategicMessagingInputSchema.safeParse(parsed.data.input);
    if (!inputValidation.success) {
      const details = toIssueDetails(inputValidation.error.issues);
      return withCors(req, invalidRequest('Invalid generation request.', details));
    }

    const normalizedAudience = STRATEGIC_AUDIENCE_MAP[inputValidation.data.audience.toLowerCase()] ?? inputValidation.data.audience;
    const normalizedMode = STRATEGIC_MODE_MAP[inputValidation.data.mode.toLowerCase()] ?? inputValidation.data.mode;

    inputText = [
      `Message: ${inputValidation.data.message}`,
      `Audience: ${normalizedAudience}`,
      `Mode: ${normalizedMode}`,
      inputValidation.data.goalContext ? `Goal context: ${inputValidation.data.goalContext}` : null,
      inputValidation.data.followUpAction ? `Follow-up action: ${inputValidation.data.followUpAction}` : null,
      inputValidation.data.currentOutput ? `Current output: ${JSON.stringify(inputValidation.data.currentOutput)}` : null
    ].filter(Boolean).join('\n');
  }

  if (inputText.length > tool.maxInputChars) return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'input', message: 'Input exceeds allowed length for this tool.' }]));

  const profileRes = session?.userId
    ? await getSupabaseAdmin().from('profiles').select('id,email,email_verified,access_status,access_expires_at,generations_used').eq('id', session.userId).maybeSingle()
    : { data: null };
  const profile = (profileRes.data ?? null) as Profile | null;
  const rateKey = session?.userId ? `gen:${session.userId}` : `gen:anon:${req.headers.get('x-forwarded-for') ?? 'unknown'}`;
  const rate = await checkRateLimit(rateKey, 20, 60);
  const access = evaluateGenerationAccess(profile, rate.limited, null);

  if (!access.allowed && access.reason) {
    if (isCareerTool) {
      diagnostics.accessDecision = 'blocked';
      diagnostics.failureStep = access.reason === 'rate_limited' ? 'rate_limit_failed' : 'missing_or_invalid_session';
      console.info('[api/generate] career_positioning_diagnostics', diagnostics);
    }
    return withCors(req, blockedResponse(access.reason, 'Generation is currently blocked.', {
      generationsUsed: profile?.generations_used ?? 0,
      freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
      remainingFreeGenerations: Math.max(0, FREE_GENERATIONS_LIMIT - (profile?.generations_used ?? 0)),
      accessStatus: profile?.access_status ?? 'free'
    }));
  }
  if (isCareerTool) diagnostics.accessDecision = 'allowed';

  try {
    if (isCareerTool) diagnostics.openaiCallStarted = true;
    const result = await runGeneration(tool, inputText);
    if (isCareerTool) diagnostics.openaiCallSucceeded = true;
    let candidateOutput: unknown = result.outputText;

    if (typeof candidateOutput === 'string') {
      try {
        candidateOutput = JSON.parse(candidateOutput);
      } catch {
        if (isCareerTool) {
          diagnostics.failureStep = 'openai_response_parse_failed';
          console.info('[api/generate] career_positioning_diagnostics', diagnostics);
          return withCors(req, safeGenerationError('Generation failed. Please try again.', 502));
        }
      }
    }

    const validatedOutput = isCareerTool
      ? careerPositioningOutputSchema.safeParse(candidateOutput)
      : strategicMessagingOutputSchema.safeParse(candidateOutput);

    if (!validatedOutput.success) {
      if (isCareerTool) {
        diagnostics.failureStep = 'structured_output_validation_failed';
        console.info('[api/generate] career_positioning_diagnostics', diagnostics);
      }
      return withCors(req, safeGenerationError('Generation failed. Please try again.', 502));
    }
    if (isCareerTool) diagnostics.structuredOutputValidationPassed = true;

    let nextGenerationsUsed = profile?.generations_used ?? 0;
    if (access.consumesFreeGeneration && session?.userId) {
      nextGenerationsUsed += 1;
      const updateRes = await getSupabaseAdmin()
        .from('profiles')
        .update({ generations_used: nextGenerationsUsed })
        .eq('id', session.userId);
      if ((updateRes as any)?.error) {
        if (isCareerTool) {
          diagnostics.failureStep = 'usage_logging_failed';
          diagnostics.sanitizedErrorName = 'SupabaseUpdateError';
          diagnostics.sanitizedErrorMessage = 'Failed to persist generations_used.';
          console.info('[api/generate] career_positioning_diagnostics', diagnostics);
        }
        return withCors(req, safeGenerationError('Generation failed. Please try again.', 500));
      }
    }

    if (isCareerTool) console.info('[api/generate] career_positioning_diagnostics', diagnostics);
    return withCors(req, successResponse({
      requestId: crypto.randomUUID(),
      toolId: tool.toolId,
      data: validatedOutput.data,
      usage: {
        generationsUsed: nextGenerationsUsed,
        freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
        remainingFreeGenerations: Math.max(0, FREE_GENERATIONS_LIMIT - nextGenerationsUsed),
        accessStatus: profile?.access_status ?? 'free'
      }
    }));
  } catch (error) {
    if (isCareerTool) {
      const safe = sanitizeError(error);
      diagnostics.failureStep = diagnostics.openaiCallStarted && !diagnostics.openaiCallSucceeded ? 'openai_request_failed' : 'unknown_unhandled_exception';
      diagnostics.sanitizedErrorName = safe.name;
      diagnostics.sanitizedErrorMessage = safe.message;
      console.info('[api/generate] career_positioning_diagnostics', diagnostics);
    }
    return withCors(req, safeGenerationError());
  }
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req);
}
