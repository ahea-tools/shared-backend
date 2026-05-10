import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { setBackendSession } from '@/lib/auth/session';
import { validateReturnTo } from '@/lib/auth/return-to';

const SUPABASE_OTP_TYPES = new Set(['signup', 'magiclink', 'recovery', 'invite', 'email_change', 'email']);

function resolveOtpType(type: string | null): 'magiclink' | 'email' {
  if (type === 'magiclink') return 'magiclink';
  return 'email';
}

export async function GET(req: NextRequest) {
  const returnTo = validateReturnTo(req.nextUrl.searchParams.get('return_to'));
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const code = req.nextUrl.searchParams.get('code');
  const type = req.nextUrl.searchParams.get('type');

  console.info('[auth/callback] callback payload format', {
    hasReturnTo: Boolean(returnTo),
    format: tokenHash ? 'token_hash' : code ? 'code' : 'unsupported',
    supabaseType: type && SUPABASE_OTP_TYPES.has(type) ? type : 'unknown'
  });

  let verifiedUserId: string | null = null;
  let verifiedEmail: string | null = null;

  if (tokenHash) {
    const { data, error } = await getSupabaseAdmin().auth.verifyOtp({
      token_hash: tokenHash,
      type: resolveOtpType(type)
    });

    if (error || !data.user?.email) {
      console.error('[auth/callback] verifyOtp failed', {
        code: error?.code ?? 'unknown',
        status: error?.status ?? 'unknown',
        message: error?.message ?? 'verification failed'
      });
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }

    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else if (code) {
    const { data, error } = await getSupabaseAdmin().auth.exchangeCodeForSession(code);

    if (error || !data.user?.email) {
      console.error('[auth/callback] exchangeCodeForSession failed', {
        code: error?.code ?? 'unknown',
        status: error?.status ?? 'unknown',
        message: error?.message ?? 'code exchange failed'
      });
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }

    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else {
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Missing callback credentials.' }, { status: 400 });
  }

  await getSupabaseAdmin().from('profiles').upsert({ id: verifiedUserId, email: verifiedEmail, email_verified: true }, { onConflict: 'id', ignoreDuplicates: false });
  await setBackendSession(verifiedUserId, verifiedEmail);

  if (returnTo) return NextResponse.redirect(returnTo);
  return NextResponse.json({ status: 'success', message: 'Email verified and session established.' });
}
