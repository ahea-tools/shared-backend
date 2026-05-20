import { NextRequest, NextResponse } from 'next/server';
import { authStartSchema } from '@/lib/validation/schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashCode } from '@/lib/auth/cookies';
import { getEnv } from '@/lib/config/env';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { preflightResponse, withCors } from '@/lib/security/cors';
import { getToolReturnUrl } from '@/lib/config/tools';
import { createAuthState } from '@/lib/auth/state';

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const parsed = authStartSchema.safeParse(payload);
  if (!parsed.success) {
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid sign-in payload.' }, { status: 400 }));
  }

  const email = parsed.data.email.toLowerCase();
  const toolId = parsed.data.toolId;
  const returnUrl = getToolReturnUrl(toolId);

  if (!returnUrl) {
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid tool.' }, { status: 400 }));
  }

  const key = `rate:auth:start:${hashCode(`${email}:${toolId}`, getEnv().BACKEND_COOKIE_SECRET)}`;
  const rate = await checkRateLimit(key, 5, 300);

  if (rate.limited) {
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'rate_limited', message: 'Too many verification attempts. Please try again shortly.' }, { status: 429 }));
  }

  const callbackUrl = new URL(getEnv().AUTH_CALLBACK_URL);
  callbackUrl.searchParams.set('state', createAuthState(toolId, hashCode(email, getEnv().BACKEND_COOKIE_SECRET)));

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

  return withCors(req, NextResponse.json({ status: 'ok', message: 'Check your email for a secure sign-in link.' }));
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req, '/api/auth/start');
}
