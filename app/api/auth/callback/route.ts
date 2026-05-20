import { NextRequest, NextResponse } from 'next/server';
import { detectConfiguredSupabaseRole, getSupabaseAdmin } from '@/lib/supabase/server';
import { setBackendSessionOnResponse } from '@/lib/auth/session';
import { getToolReturnUrl } from '@/lib/config/tools';
import { parseAuthState } from '@/lib/auth/state';

function resolveOtpType(type: string | null): 'magiclink' | 'email' {
  if (type === 'magiclink') return 'magiclink';
  return 'email';
}

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const code = req.nextUrl.searchParams.get('code');
  const type = req.nextUrl.searchParams.get('type');
  const state = parseAuthState(req.nextUrl.searchParams.get('state'));

  if (!state) {
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  const returnUrl = getToolReturnUrl(state.toolId);
  if (!returnUrl) {
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (detectConfiguredSupabaseRole() !== 'service_role') {
    return NextResponse.json({ status: 'error', reason: 'server_misconfigured', message: 'Missing required auth configuration.' }, { status: 500 });
  }

  let verifiedUserId: string | null = null;
  let verifiedEmail: string | null = null;

  if (tokenHash) {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({ token_hash: tokenHash, type: resolveOtpType(type) });
    if (error || !data.user?.email) {
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else if (code) {
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) {
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else {
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  await supabaseAdmin
    .from('profiles')
    .upsert({ id: verifiedUserId, email: verifiedEmail, email_verified: true, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: false });

  const response = NextResponse.redirect(returnUrl);
  setBackendSessionOnResponse(response, verifiedUserId!, verifiedEmail!);
  return response;
}
