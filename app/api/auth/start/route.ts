import { NextRequest, NextResponse } from 'next/server';
import { emailSchema } from '@/lib/validation/schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashCode } from '@/lib/auth/cookies';
import { getEnv } from '@/lib/config/env';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { preflightResponse, withCors } from '@/lib/security/cors';
import { validateReturnTo } from '@/lib/auth/return-to';

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const parsed = emailSchema.safeParse(payload);
  if (!parsed.success) {
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid email payload.' }, { status: 400 }));
  }

  const email = parsed.data.email.toLowerCase();
  const rawReturnTo = typeof payload.return_to === 'string' ? payload.return_to : typeof payload.returnTo === 'string' ? payload.returnTo : null;
  const returnTo = validateReturnTo(rawReturnTo);

  console.info('[auth/start] return_to validation result', {
    isValid: Boolean(returnTo),
    requestedOrigin: rawReturnTo ? (() => {
      try {
        return new URL(rawReturnTo).origin;
      } catch {
        return 'invalid';
      }
    })() : null
  });

  const key = `rate:auth:start:${hashCode(email, getEnv().BACKEND_COOKIE_SECRET)}`;
  const rate = await checkRateLimit(key, 5, 300);

  if (rate.limited) {
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'rate_limited', message: 'Too many verification attempts. Please try again shortly.' }, { status: 429 }));
  }

  const callbackUrl = new URL(getEnv().AUTH_CALLBACK_URL);
  if (returnTo) {
    callbackUrl.searchParams.set('return_to', returnTo);
  }

  console.info('[auth/start] using Supabase redirectTo', {
    origin: callbackUrl.origin,
    pathname: callbackUrl.pathname,
    hasReturnTo: callbackUrl.searchParams.has('return_to')
  });

  const { error } = await getSupabaseAdmin().auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: callbackUrl.toString()
    }
  });

  if (error) {
    console.error('[auth/start] Supabase signInWithOtp failed', {
      code: error.code ?? 'unknown',
      status: error.status ?? 'unknown',
      message: error.message
    });
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Unable to start verification flow.' }, { status: 400 }));
  }

  return withCors(req, NextResponse.json({ status: 'success', message: 'If eligible, a verification email has been sent.' }));
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req, '/api/auth/start');
}
