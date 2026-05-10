import { NextRequest, NextResponse } from 'next/server';
import { emailSchema } from '@/lib/validation/schemas';
import { checkRateLimit } from '@/lib/rate-limit';
import { hashCode } from '@/lib/auth/cookies';
import { getEnv } from '@/lib/config/env';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { preflightResponse, withCors } from '@/lib/security/cors';

export async function POST(req: NextRequest) {
  const parsed = emailSchema.safeParse(await req.json());
  if (!parsed.success) {
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid email payload.' }, { status: 400 }));
  }

  const email = parsed.data.email.toLowerCase();
  const key = `rate:auth:start:${hashCode(email, getEnv().BACKEND_COOKIE_SECRET)}`;
  const rate = await checkRateLimit(key, 5, 300);

  if (rate.limited) {
    return withCors(req, NextResponse.json({ status: 'blocked', reason: 'rate_limited', message: 'Too many verification attempts. Please try again shortly.' }, { status: 429 }));
  }

  await getSupabaseAdmin().auth.signInWithOtp({ email });
  return withCors(req, NextResponse.json({ status: 'success', message: 'If eligible, a verification email has been sent.' }));
}

export async function OPTIONS(req: NextRequest) {
  return preflightResponse(req, '/api/auth/start');
}
