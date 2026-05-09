import { NextRequest, NextResponse } from 'next/server';
import { FREE_GENERATIONS_LIMIT } from '@/lib/responses/api-responses';
import { preflightResponse, withCors } from '@/lib/security/cors';
import { getBackendSession } from '@/lib/auth/session';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const session = await getBackendSession();
  const origin = req.nextUrl.origin;

  let email: string | null = null;
  let emailVerified = false;
  let generationsUsed = 0;
  let accessStatus = 'free';

  if (session?.userId) {
    const { data: profile } = await getSupabaseAdmin()
      .from('profiles')
      .select('email,email_verified,generations_used,access_status')
      .eq('id', session.userId)
      .maybeSingle();
    if (profile) {
      email = profile.email;
      emailVerified = Boolean(profile.email_verified);
      generationsUsed = Number(profile.generations_used || 0);
      accessStatus = profile.access_status || 'free';
    }
  }

  const remainingFreeGenerations = Math.max(0, FREE_GENERATIONS_LIMIT - generationsUsed);

  return withCors(req, NextResponse.json({
    status: 'success',
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
    paywall: {
      show: !emailVerified,
      variant: emailVerified ? 'none' : 'auth',
      ctaLabel: 'Verify email to continue',
      ctaUrl: `${origin}/api/auth/start`
    },
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
