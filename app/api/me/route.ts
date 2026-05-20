import { NextRequest, NextResponse } from 'next/server';
import { FREE_GENERATIONS_LIMIT, allowedPaywallState, authPaywallState } from '@/lib/responses/api-responses';
import { isAllowedOrigin, preflightResponse, withCors } from '@/lib/security/cors';
import { BACKEND_SESSION_COOKIE_NAME, getBackendSessionDetails } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const sessionDetails = await getBackendSessionDetails();
  const session = sessionDetails.session;
  const hasSessionCookie = Boolean(req.cookies.get(BACKEND_SESSION_COOKIE_NAME)?.value);
  const requestOrigin = req.headers.get('origin');
  const originAllowed = isAllowedOrigin(requestOrigin);
  const origin = req.nextUrl.origin;

  let email: string | null = null;
  let emailVerified = false;
  let generationsUsed = 0;
  let accessStatus = 'free';

  let failureReason: 'missing_cookie' | 'bad_signature' | 'expired' | 'user_not_found' | 'unverified' | null = null;

  if (session?.userId) {
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('email,email_verified,generations_used,access_status')
      .eq('id', session.userId)
      .maybeSingle();
    if (profile) {
      console.info('[api/me] profile hydration succeeded', { hasEmail: Boolean(profile.email), emailVerified: Boolean(profile.email_verified) });
      email = profile.email;
      emailVerified = Boolean(profile.email_verified);
      generationsUsed = Number(profile.generations_used || 0);
      accessStatus = profile.access_status || 'free';
      if (!emailVerified) failureReason = 'unverified';
    } else {
      console.info('[api/me] profile hydration skipped_or_missing', { hasSessionUserId: Boolean(session?.userId) });
      failureReason = 'user_not_found';
    }
  } else {
    failureReason = sessionDetails.failureReason === 'invalid_format' ? 'bad_signature' : sessionDetails.failureReason;
  }

  const remainingFreeGenerations = Math.max(0, FREE_GENERATIONS_LIMIT - generationsUsed);

  const isAuthenticated = Boolean(session?.userId);

  if (!isAuthenticated || !emailVerified) {
    console.info('[api/me] unauthenticated', {
      hasSessionCookie,
      sessionCookieValid: Boolean(session?.userId),
      failureReason: failureReason ?? 'missing_cookie',
      requestOrigin,
      originAllowed
    });
  }

  return withCors(req, NextResponse.json({
    status: 'success',
    authenticated: isAuthenticated,
    isAuthenticated,
    verified: emailVerified,
    isVerified: emailVerified,
    user: {
      email,
      emailVerified
    },
    usage: {
      generationsUsed,
      freeGenerationsLimit: FREE_GENERATIONS_LIMIT,
      remainingFreeGenerations,
      accessStatus
    },
    membership: {
      hasActiveMembership: accessStatus === 'paid' || accessStatus === 'comped' || accessStatus === 'admin',
      membershipStatus: 'unknown',
      billingInterval: 'unknown',
      currentPeriodEnd: null
    },
    paywall: emailVerified ? allowedPaywallState() : authPaywallState(origin),
    auth: {
      startEndpoint: `${origin}/api/auth/start`,
      verifyEndpoint: `${origin}/api/auth/verify`,
      callbackEndpoint: `${origin}/api/auth/callback`
    }
  }));
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req);
}
