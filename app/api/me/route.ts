import { NextRequest, NextResponse } from 'next/server';
import { FREE_GENERATIONS_LIMIT, allowedPaywallState, authPaywallState, type AccessStatus } from '@/lib/responses/api-responses';
import { isAllowedOrigin, preflightResponse, withCors } from '@/lib/security/cors';
import { BACKEND_SESSION_COOKIE_NAME, getBackendSessionDetails } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { getEffectiveAccessStatus } from '@/lib/usage/access';

export async function GET(req: NextRequest) {
  const requestOrigin = req.headers.get('origin');
  const originAllowed = isAllowedOrigin(requestOrigin);
  const hasSessionCookie = Boolean(req.cookies.get(BACKEND_SESSION_COOKIE_NAME)?.value);
  const origin = req.nextUrl.origin;

  const diagnostics = {
    routeVersion: 'usage-count-debug-v2',
    requestOrigin,
    originAllowed,
    hasSessionCookie,
    sessionCookieValid: false,
    sessionFailureReason: 'unknown' as 'missing_cookie' | 'bad_signature' | 'invalid_format' | 'expired' | 'unknown',
    userIdPresent: false,
    profileLoaded: false,
    profileVerified: false,
    usageLoaded: false,
    entitlementLoaded: false,
    accessEvaluationSucceeded: false,
    meReadsUsageSource: 'profiles.generations_used',
    failureStep: null as string | null,
    sanitizedErrorName: null as string | null,
    sanitizedErrorMessage: null as string | null
  };

  try {
    const sessionDetails = await getBackendSessionDetails();
    const session = sessionDetails.session;
    diagnostics.sessionCookieValid = Boolean(session?.userId);
    diagnostics.userIdPresent = Boolean(session?.userId);
    diagnostics.sessionFailureReason = (sessionDetails.failureReason as any) ?? 'unknown';

    let emailVerified = false;
    let generationsUsed = 0;
    let accessStatus: AccessStatus = 'free';
    let rawAccessStatus: AccessStatus = 'free';
    let accessExpiresAt: string | null = null;

    if (session?.userId) {
      const { data: profile } = await getSupabaseAdmin()
        .from('profiles')
        .select('email_verified,generations_used,access_status,access_expires_at')
        .eq('id', session.userId)
        .maybeSingle();
      diagnostics.profileLoaded = Boolean(profile);
      if (profile) {
        emailVerified = Boolean(profile.email_verified);
        generationsUsed = Number(profile.generations_used || 0);
        rawAccessStatus = (profile.access_status || 'free') as AccessStatus;
        accessExpiresAt = profile.access_expires_at ?? null;
        accessStatus = getEffectiveAccessStatus({ access_status: rawAccessStatus, access_expires_at: accessExpiresAt });
        diagnostics.profileVerified = emailVerified;
        diagnostics.usageLoaded = true;
        diagnostics.entitlementLoaded = true;
        diagnostics.accessEvaluationSucceeded = true;
      } else {
        diagnostics.failureStep = 'profile_not_found';
      }
    } else {
      diagnostics.failureStep = 'missing_or_invalid_session';
    }

    const remainingFreeGenerations = Math.max(0, FREE_GENERATIONS_LIMIT - generationsUsed);
    const isAuthenticated = Boolean(session?.userId);
    const isVerified = Boolean(isAuthenticated && emailVerified);

    console.info('[api/me] diagnostics', diagnostics);

    return withCors(req, NextResponse.json({
      status: 'success',
      authenticated: isAuthenticated,
      isAuthenticated,
      verified: isVerified,
      isVerified,
      generationsUsed,
      freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
      remainingFreeGenerations,
      freeGenerationsRemaining: remainingFreeGenerations,
      accessStatus,
      accessState: accessStatus,
      rawAccessStatus,
      accessExpiresAt,
      message: isVerified ? 'Authenticated.' : 'Authentication required.',
      paywallUrl: isVerified ? null : `${origin}/api/auth/start`,
      usage: {
        generationsUsed,
        freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
        remainingFreeGenerations,
        accessStatus
      },
      paywall: isVerified ? allowedPaywallState() : authPaywallState(origin)
    }));
  } catch (error) {
    diagnostics.failureStep = diagnostics.failureStep ?? 'unknown';
    diagnostics.sanitizedErrorName = error instanceof Error ? error.name : 'UnknownError';
    diagnostics.sanitizedErrorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.info('[api/me] diagnostics', diagnostics);
    return withCors(req, NextResponse.json({
      status: 'error',
      authenticated: false,
      isAuthenticated: false,
      verified: false,
      isVerified: false,
      generationsUsed: 0,
      freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
      remainingFreeGenerations: FREE_GENERATIONS_LIMIT,
      accessStatus: 'error',
      message: 'Unable to load account status.'
    }, { status: 500 }));
  }
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req);
}
