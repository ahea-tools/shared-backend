import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { blockedResponse, FREE_GENERATIONS_LIMIT, successResponse } from '@/lib/responses/api-responses';
import { careerPositioningInputSchema, careerPositioningOutputSchema, evidenceInPracticeInputSchema, evidenceInPracticeOutputSchema, generateSchema, strategicMessagingInputSchema, strategicMessagingOutputSchema } from '@/lib/validation/schemas';
import { getTool } from '@/lib/config/tools';
import { runGeneration } from '@/lib/openai/generate';
import { preflightResponse, withCors } from '@/lib/security/cors';
import { BACKEND_SESSION_COOKIE_NAME, getBackendSessionDetails } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { evaluateGenerationAccess, getEffectiveAccessStatus, type Profile } from '@/lib/usage/access';
import { logGenerationEvent } from '@/lib/usage/events';
import { retrievePubMedArticles, type PubMedArticle } from '@/lib/pubmed';

const CAREER_TOP_LEVEL_KEYS = ['careerPositioningSummary', 'transferableValueMap', 'experienceReframe', 'roleAndOpportunityFit', 'talkingPoints', 'suggestedNextStep'];
const STRATEGIC_AUDIENCE_MAP: Record<string, string> = { 'leadership / board': 'leadership-board', funders: 'funders', policymakers: 'policymakers', 'community partners': 'community-partners', 'internal team': 'internal-team', 'general public': 'general-public' };
const EVIDENCE_MIN_USABLE_ABSTRACTS = 3;
const STRATEGIC_MODE_MAP: Record<string, string> = { standard: 'standard', 'plain-language': 'plain-language', 'careful / neutral': 'careful-neutral', 'highly constrained': 'highly-constrained', 'more direct': 'more-direct' };
type JsonParseAttempt = 'direct_json' | 'fenced_json' | 'balanced_object' | 'already_object' | 'failed';
type SafeJsonParseResult = {
  success: boolean;
  parsed: unknown;
  parseAttemptUsed: JsonParseAttempt;
  parseErrorName: string | null;
  parseErrorMessage: string | null;
};


const buildInsufficientEvidenceOutput = (sources: PubMedArticle[]) => ({
  evidenceSnapshot: 'The backend found too few usable PubMed abstracts to produce a reliable Evidence in Practice synthesis for this request.',
  keyTakeaways: ['The available abstracts were too limited to support confident practice-oriented takeaways.'],
  whatAppearsMostEffective: ['Insufficient evidence was available from the retrieved abstracts to identify what appears most effective.'],
  contextAndApplicability: ['No reliable applicability assessment can be made from the limited retrieved abstracts.'],
  equityConsiderations: ['The retrieved abstracts were too limited to assess equity implications responsibly.'],
  practiceConsiderations: ['Consider refining the topic, population, or setting to retrieve more directly relevant literature.'],
  evidenceGapsAndUnansweredQuestions: ['More directly relevant studies with usable abstracts are needed before drawing action-oriented conclusions.'],
  sourcesReviewed: sources.map(({ title, year, journal, pmid, pubmedUrl }) => ({ title, year, journal, pmid, pubmedUrl }))
});

type EvidenceSourceIntegrityResult = {
  output: { sourcesReviewed: Array<{ title: string; year: string | number; journal: string; pmid: string; pubmedUrl: string }> } | null;
  diagnostics: {
    modelReferencedPmids: string[];
    selectedBackendPmids: string[];
    unknownReferencedPmids: string[];
    duplicateReferencedPmids: string[];
    canonicalizedSourceCount: number;
    sourceIntegrityPassed: boolean;
  };
};

const normalizePmid = (pmid: unknown) => typeof pmid === 'string' || typeof pmid === 'number' ? String(pmid).trim() : '';

const canonicalizeEvidenceSourcesReviewed = <T extends { sourcesReviewed: Array<{ title: string; year: string | number; journal: string; pmid: string; pubmedUrl: string }> }>(output: T, sources: PubMedArticle[]): EvidenceSourceIntegrityResult => {
  const byPmid = new Map(sources.map((source) => [normalizePmid(source.pmid), source]));
  const modelReferencedPmids = output.sourcesReviewed.map((source) => normalizePmid(source.pmid));
  const selectedBackendPmids = sources.map((source) => normalizePmid(source.pmid));
  const seen = new Set<string>();
  const duplicateSet = new Set<string>();
  const unknownSet = new Set<string>();
  const canonicalSources: Array<{ title: string; year: string | number; journal: string; pmid: string; pubmedUrl: string }> = [];

  for (const pmid of modelReferencedPmids) {
    if (!/^\d+$/.test(pmid) || !byPmid.has(pmid)) {
      unknownSet.add(pmid);
      continue;
    }
    if (seen.has(pmid)) {
      duplicateSet.add(pmid);
      continue;
    }
    seen.add(pmid);
    const { title, year, journal, pmid: authoritativePmid, pubmedUrl } = byPmid.get(pmid)!;
    canonicalSources.push({ title, year, journal, pmid: authoritativePmid, pubmedUrl });
  }

  const diagnostics = {
    modelReferencedPmids,
    selectedBackendPmids,
    unknownReferencedPmids: [...unknownSet],
    duplicateReferencedPmids: [...duplicateSet],
    canonicalizedSourceCount: canonicalSources.length,
    sourceIntegrityPassed: unknownSet.size === 0 && canonicalSources.length > 0
  };

  if (!diagnostics.sourceIntegrityPassed) return { output: null, diagnostics };
  return { output: { ...output, sourcesReviewed: canonicalSources }, diagnostics };
};

const sanitizeErrorMessage = (value: unknown) => {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : 'Unknown parse error';
  return message.slice(0, 200);
};

const extractFirstBalancedTopLevelObject = (input: string): string | null => {
  const start = input.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (inString) {
      if (escaping) escaping = false;
      else if (char === '\\') escaping = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
      if (depth < 0) return null;
    }
  }
  return null;
};

const safeParseJsonOutput = (input: unknown): SafeJsonParseResult => {
  if (input && typeof input === 'object') return { success: true, parsed: input, parseAttemptUsed: 'already_object', parseErrorName: null, parseErrorMessage: null };
  if (typeof input !== 'string') return { success: false, parsed: null, parseAttemptUsed: 'failed', parseErrorName: 'TypeError', parseErrorMessage: 'Output was not a JSON object or string.' };

  const trimmed = input.trim();
  try {
    return { success: true, parsed: JSON.parse(trimmed), parseAttemptUsed: 'direct_json', parseErrorName: null, parseErrorMessage: null };
  } catch (error) {
    return { success: false, parsed: null, parseAttemptUsed: 'failed', parseErrorName: error instanceof Error ? error.name : 'ParseError', parseErrorMessage: sanitizeErrorMessage(error) };
  }
};
const toIssueDetails = (issues: Array<{ path: (string | number)[]; message: string }>) => issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
const invalidRequest = (message: string, details: Array<{ path: string; message: string }> = []) => NextResponse.json({ status: 'error', reason: 'invalid_request', message, details }, { status: 400 });
const generationDiagnosticsLabel = (isEvidenceTool: boolean) => isEvidenceTool ? '[api/generate] evidence_in_practice_diagnostics' : '[api/generate] career_positioning_diagnostics';
const safeGenerationError = (message = 'Generation failed. Please try again.', status = 500) => NextResponse.json({ status: 'error', reason: 'generation_failed', message }, { status });

export async function POST(req: NextRequest) {
  const sessionDetails = await getBackendSessionDetails();
  const session = sessionDetails.session;
  const hasSessionCookie = Boolean(req.cookies.get(BACKEND_SESSION_COOKIE_NAME)?.value);
  let parsedJson: unknown = null;

  const diagnostics = {
    routeVersion: 'usage-count-debug-v2', toolId: null as string | null, failureStep: null as string | null,
    userIdPresent: Boolean(session?.userId), profileIdMatchesSession: false, currentGenerationsUsed: null as number | null,
    nextGenerationsUsed: null as number | null, usageSourceOfTruth: 'profiles.generations_used', meReadsUsageSource: 'profiles.generations_used',
    accessEvaluatorReadsUsageSource: 'profiles.generations_used', updateAttempted: false, updateSucceeded: false,
    updateAffectedRows: null as number | null, updateErrorCode: null as string | null, updateErrorMessage: null as string | null,
    generationEventLogged: false,
    requestParsed: false, inputValidationPassed: false, sessionPresent: hasSessionCookie, sessionValid: Boolean(session?.userId), profileLoaded: false,
    accessDecision: 'error' as 'allowed'|'blocked'|'error', rateLimitPassed: false, openaiCallStarted: false, openaiCallSucceeded: false,
    openaiResponseHasOutput: false, openaiParsedOutputType: null as string | null, structuredOutputValidationPassed: false,
    missingTopLevelKeys: [] as string[], unexpectedTopLevelKeys: [] as string[], validationIssuePaths: [] as string[],
    usageLoggingStarted: false, usageLoggingSucceeded: false, generationEventLoggingStarted: false, generationEventLoggingSucceeded: false,
    sanitizedErrorName: null as string | null, sanitizedErrorMessage: null as string | null
  };

  try { parsedJson = await req.json(); diagnostics.requestParsed = true; } catch { diagnostics.failureStep = 'request_parse_failed'; console.info('[api/generate] career_positioning_diagnostics', diagnostics); return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'body', message: 'Request body must be valid JSON.' }])); }

  const parsed = generateSchema.safeParse(parsedJson);
  diagnostics.toolId = typeof (parsedJson as any)?.toolId === 'string' ? (parsedJson as any).toolId : null;
  if (!parsed.success) { diagnostics.failureStep = 'input_validation_failed'; if (diagnostics.toolId === 'career-positioning') console.info('[api/generate] career_positioning_diagnostics', diagnostics); return withCors(req, invalidRequest('Invalid generation request.', toIssueDetails(parsed.error.issues))); }

  const tool = getTool(parsed.data.toolId);
  if (!tool) return withCors(req, blockedResponse('invalid_tool', 'The requested tool is not available.'));

  let inputText = ''; const isCareerTool = parsed.data.toolId === 'career-positioning'; const isEvidenceTool = parsed.data.toolId === 'evidence-in-practice'; let evidenceSources: PubMedArticle[] = [];
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
      '8. Return only one JSON object that exactly matches the required schema.',
      '9. Do not include markdown, code fences, prose, commentary, or wrapper keys.',
      '10. Do not omit required keys and do not rename keys.',
      `outputType: ${inputValidation.data.outputType}`,
      `professionalContext: ${inputValidation.data.professionalContext}`,
      `currentWork: ${inputValidation.data.currentWork}`,
      `desiredDirection: ${inputValidation.data.desiredDirection}`,
      `emphasis: ${inputValidation.data.emphasis.join(', ')}`,
      `currentLanguage: ${inputValidation.data.currentLanguage}`,
      inputValidation.data.additionalContext ? `additionalContext: ${inputValidation.data.additionalContext}` : null
    ].filter(Boolean).join('\n');
  } else if (isEvidenceTool) {
    const inputValidation = evidenceInPracticeInputSchema.safeParse(parsed.data.input);
    if (!inputValidation.success) {
      diagnostics.failureStep = 'input_validation_failed';
      return withCors(req, invalidRequest('Invalid generation request.', toIssueDetails(inputValidation.error.issues)));
    }
    diagnostics.inputValidationPassed = true;
    inputText = [
      'Evidence in Practice request. Synthesize only the backend-retrieved PubMed abstracts below.',
      `topic: ${inputValidation.data.topic}`,
      inputValidation.data.population ? `population: ${inputValidation.data.population}` : null,
      inputValidation.data.setting ? `setting: ${inputValidation.data.setting}` : null
    ].filter(Boolean).join('\n');
  } else {
    const inputValidation = strategicMessagingInputSchema.safeParse(parsed.data.input);
    if (!inputValidation.success) {
      const details = toIssueDetails(inputValidation.error.issues);
      return withCors(req, invalidRequest('Invalid generation request.', details));
    }

    const normalizedAudience = STRATEGIC_AUDIENCE_MAP[inputValidation.data.audience.toLowerCase()] ?? inputValidation.data.audience;
    const normalizedMode = STRATEGIC_MODE_MAP[inputValidation.data.mode.toLowerCase()] ?? inputValidation.data.mode;
    inputText = [`Message: ${inputValidation.data.message}`, `Audience: ${normalizedAudience}`, `Mode: ${normalizedMode}`].join('\n');
  }
  if (inputText.length > tool.maxInputChars) return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'input', message: 'Input exceeds allowed length for this tool.' }]))

  if (inputText.length > tool.maxInputChars) return withCors(req, invalidRequest('Invalid generation request.', [{ path: 'input', message: 'Input exceeds allowed length for this tool.' }]));

  const profileRes = session?.userId
    ? await getSupabaseAdmin().from('profiles').select('id,email,email_verified,access_status,access_expires_at,generations_used').eq('id', session.userId).maybeSingle()
    : { data: null };
  const profile = (profileRes.data ?? null) as Profile | null;
  diagnostics.profileLoaded = Boolean(profile);
  diagnostics.profileIdMatchesSession = Boolean(profile?.id && session?.userId && profile.id === session.userId);
  diagnostics.currentGenerationsUsed = profile?.generations_used ?? null;
  const rate = await checkRateLimit(session?.userId ? `gen:${session.userId}` : `gen:anon:${req.headers.get('x-forwarded-for') ?? 'unknown'}`, 20, 60);
  diagnostics.rateLimitPassed = !rate.limited;
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
      accessStatus: getEffectiveAccessStatus(profile)
    }));
  }
  if (isCareerTool) diagnostics.accessDecision = 'allowed';

  if (isEvidenceTool) {
    diagnostics.accessDecision = 'allowed';
    try {
      const validatedEvidenceInput = evidenceInPracticeInputSchema.parse(parsed.data.input);
      const pubmed = await retrievePubMedArticles(validatedEvidenceInput);
      (diagnostics as any).pubmedESearchCandidateCount = pubmed.candidateCount;
      (diagnostics as any).pubmedUsableAbstractCount = pubmed.usableCount;
      (diagnostics as any).selectedSourceCount = pubmed.selected.length;
      evidenceSources = pubmed.selected;
      if (pubmed.usableCount < EVIDENCE_MIN_USABLE_ABSTRACTS) {
        const insufficient = buildInsufficientEvidenceOutput(pubmed.selected);
        const valid = evidenceInPracticeOutputSchema.safeParse(insufficient);
        if (!valid.success) return withCors(req, safeGenerationError('Generation failed. Please try again.', 502));
        await logGenerationEvent({ tool_id: tool.toolId, user_id: session?.userId ?? null, status: 'insufficient_evidence' });
        return withCors(req, NextResponse.json({ status: 'insufficient_evidence', requestId: crypto.randomUUID(), toolId: tool.toolId, output: valid.data, usage: { generationsUsed: profile?.generations_used ?? 0, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: Math.max(0, FREE_GENERATIONS_LIMIT - (profile?.generations_used ?? 0)), accessStatus: getEffectiveAccessStatus(profile) }, paywall: { show: false, variant: 'none', ctaLabel: null, ctaUrl: null, message: null } }));
      }
      const sourcePayload = pubmed.selected.map(({ pmid, title, journal, year, pubmedUrl, abstract }) => ({ pmid, title, journal, year, pubmedUrl, abstract }));
      inputText = `${inputText}

Retrieved PubMed abstracts (use only these):
${JSON.stringify(sourcePayload)}`;
    } catch (error) {
      diagnostics.failureStep = 'pubmed_retrieval_failed';
      diagnostics.sanitizedErrorName = error instanceof Error ? error.name : 'UnknownError';
      diagnostics.sanitizedErrorMessage = error instanceof Error ? sanitizeErrorMessage(error.message) : 'Unknown error';
      console.info('[api/generate] evidence_in_practice_diagnostics', diagnostics);
      return withCors(req, safeGenerationError('Evidence retrieval failed. Please try again.', 502));
    }
  }

  try {
    if (isCareerTool || isEvidenceTool) diagnostics.openaiCallStarted = true;
    const result = await runGeneration(tool, inputText);
    if (isCareerTool || isEvidenceTool) diagnostics.openaiCallSucceeded = true;
    diagnostics.openaiResponseHasOutput = typeof result.outputText === 'string' && result.outputText.trim().length > 0;
    const parseDiagnostics = {
      outputTextLength: typeof result.outputText === 'string' ? result.outputText.length : null,
      outputTextTrimmedLength: typeof result.outputText === 'string' ? result.outputText.trim().length : null,
      startsWithBrace: typeof result.outputText === 'string' ? result.outputText.trimStart().startsWith('{') : false,
      startsWithBracket: typeof result.outputText === 'string' ? result.outputText.trimStart().startsWith('[') : false,
      startsWithFence: typeof result.outputText === 'string' ? result.outputText.trimStart().startsWith('```') : false,
      containsJsonFence: typeof result.outputText === 'string' ? /```(?:json)?/i.test(result.outputText) : false,
      parseAttemptUsed: 'failed' as JsonParseAttempt,
      parseSucceeded: false,
      parsedOutputType: null as string | null,
      parseErrorName: null as string | null,
      parseErrorMessage: null as string | null,
      parseErrorAtEnd: false,
      endsWithBrace: typeof result.outputText === 'string' ? result.outputText.trimEnd().endsWith('}') : false,
      endsWithBracket: typeof result.outputText === 'string' ? result.outputText.trimEnd().endsWith(']') : false,
      likelyTruncatedJson: false,
      maxOutputTokensConfigured: tool.maxOutputTokens,
      finishReason: result.metadata?.finishReason ?? null,
      incompleteReason: result.metadata?.incompleteReason ?? null,
      outputTokens: result.metadata?.outputTokens ?? null
    };
    const parsedOutput = safeParseJsonOutput(result.outputText);
    parseDiagnostics.parseAttemptUsed = parsedOutput.parseAttemptUsed;
    parseDiagnostics.parseSucceeded = parsedOutput.success;
    parseDiagnostics.parseErrorName = parsedOutput.parseErrorName;
    parseDiagnostics.parseErrorMessage = parsedOutput.parseErrorMessage;

    const parseErrorPosition = (() => {
      const message = parsedOutput.parseErrorMessage;
      if (!message) return null;
      const match = message.match(/position\s+(\d+)/i);
      return match ? Number.parseInt(match[1], 10) : null;
    })();
    const trimmedLength = typeof result.outputText === 'string' ? result.outputText.trim().length : 0;
    parseDiagnostics.parseErrorAtEnd = typeof parseErrorPosition === 'number' && Number.isFinite(parseErrorPosition)
      ? Math.abs(trimmedLength - parseErrorPosition) <= 20
      : false;
    parseDiagnostics.likelyTruncatedJson = Boolean(
      !parsedOutput.success
      && parseDiagnostics.startsWithBrace
      && !parseDiagnostics.endsWithBrace
      && parseDiagnostics.parseErrorAtEnd
    );
    let candidateOutput: unknown = parsedOutput.parsed;
    if (!parsedOutput.success && isCareerTool) {
      diagnostics.failureStep = 'openai_response_parse_failed';
      console.info('[api/generate] career_positioning_parse_diagnostics', parseDiagnostics);
      console.info(generationDiagnosticsLabel(isEvidenceTool), diagnostics);
      return withCors(req, safeGenerationError('Generation failed. Please try again.', 502));
    }
    diagnostics.openaiParsedOutputType = Array.isArray(candidateOutput) ? 'array' : typeof candidateOutput;
    parseDiagnostics.parsedOutputType = diagnostics.openaiParsedOutputType;
    if (isCareerTool) console.info('[api/generate] career_positioning_parse_diagnostics', parseDiagnostics);
    const keys = candidateOutput && typeof candidateOutput === 'object' ? Object.keys(candidateOutput as Record<string, unknown>) : [];
    diagnostics.missingTopLevelKeys = CAREER_TOP_LEVEL_KEYS.filter((k) => !keys.includes(k));
    diagnostics.unexpectedTopLevelKeys = keys.filter((k) => !CAREER_TOP_LEVEL_KEYS.includes(k));

    const validatedOutput = isEvidenceTool ? evidenceInPracticeOutputSchema.safeParse(candidateOutput) : isCareerTool ? careerPositioningOutputSchema.safeParse(candidateOutput) : strategicMessagingOutputSchema.safeParse(candidateOutput);
    if (!validatedOutput.success) {
      diagnostics.failureStep = 'structured_output_validation_failed';
      diagnostics.validationIssuePaths = validatedOutput.error.issues.map((i) => i.path.join('.'));
      console.info(generationDiagnosticsLabel(isEvidenceTool), diagnostics);
      return withCors(req, safeGenerationError('Generation failed. Please try again.', 502));
    }
    diagnostics.structuredOutputValidationPassed = true;
    let responseOutput = validatedOutput.data;
    if (isEvidenceTool) {
      const canonicalized = canonicalizeEvidenceSourcesReviewed(validatedOutput.data as any, evidenceSources);
      Object.assign(diagnostics, canonicalized.diagnostics);
      if (!canonicalized.output) {
        diagnostics.failureStep = 'source_integrity_validation_failed';
        console.info('[api/generate] evidence_in_practice_diagnostics', diagnostics);
        return withCors(req, safeGenerationError('Generation failed. Please try again.', 502));
      }
      responseOutput = canonicalized.output as typeof validatedOutput.data;
    }

    let nextGenerationsUsed = profile?.generations_used ?? 0;
    if (access.consumesFreeGeneration && session?.userId) {
      diagnostics.usageLoggingStarted = true;
      nextGenerationsUsed += 1;
      diagnostics.nextGenerationsUsed = nextGenerationsUsed;
      diagnostics.updateAttempted = true;
      const updateRes = await getSupabaseAdmin().from('profiles').update({ generations_used: nextGenerationsUsed }).eq('id', session.userId).select('id');
      diagnostics.updateErrorCode = (updateRes as any)?.error?.code ?? null;
      diagnostics.updateErrorMessage = (updateRes as any)?.error?.message ? sanitizeErrorMessage((updateRes as any).error.message) : null;
      diagnostics.updateAffectedRows = Array.isArray((updateRes as any)?.data) ? (updateRes as any).data.length : null;
      if ((updateRes as any)?.error || diagnostics.updateAffectedRows === 0) {
        diagnostics.failureStep = 'usage_logging_failed';
        diagnostics.sanitizedErrorName = 'SupabaseUpdateError';
        diagnostics.sanitizedErrorMessage = 'Failed to persist generations_used.';
        console.info(generationDiagnosticsLabel(isEvidenceTool), diagnostics);
        return withCors(req, safeGenerationError());
      }
      diagnostics.updateSucceeded = true;
      diagnostics.usageLoggingSucceeded = true;
    }

    diagnostics.generationEventLoggingStarted = true;
    try {
      await logGenerationEvent({ tool_id: tool.toolId, user_id: session?.userId ?? null, status: 'success' });
      diagnostics.generationEventLoggingSucceeded = true;
      diagnostics.generationEventLogged = true;
    } catch (error) {
      diagnostics.failureStep = 'generation_event_logging_failed';
      diagnostics.sanitizedErrorName = error instanceof Error ? error.name : 'UnknownError';
      diagnostics.sanitizedErrorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.info(generationDiagnosticsLabel(isEvidenceTool), diagnostics);
      return withCors(req, safeGenerationError());
    }

    console.info(isEvidenceTool ? '[api/generate] evidence_in_practice_diagnostics' : '[api/generate] career_positioning_diagnostics', diagnostics);
    return withCors(req, successResponse({ requestId: crypto.randomUUID(), toolId: tool.toolId, data: responseOutput, usage: { generationsUsed: nextGenerationsUsed, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: Math.max(0, FREE_GENERATIONS_LIMIT - nextGenerationsUsed), accessStatus: getEffectiveAccessStatus(profile) } }));
  } catch (error) {
    diagnostics.failureStep = diagnostics.openaiCallStarted && !diagnostics.openaiCallSucceeded ? 'openai_request_failed' : 'unknown_unhandled_exception';
    diagnostics.sanitizedErrorName = error instanceof Error ? error.name : 'UnknownError';
    diagnostics.sanitizedErrorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.info(isEvidenceTool ? '[api/generate] evidence_in_practice_diagnostics' : '[api/generate] career_positioning_diagnostics', diagnostics);
    return withCors(req, safeGenerationError());
  }
}

export async function OPTIONS(req: NextRequest) { return preflightResponse(req); }
