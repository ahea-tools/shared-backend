import { NextRequest, NextResponse } from 'next/server';
import { detectConfiguredSupabaseRole, getSupabaseAdmin } from '@/lib/supabase/server';
import { BACKEND_SESSION_COOKIE_NAME, setBackendSessionOnResponse } from '@/lib/auth/session';
import { getToolReturnUrl } from '@/lib/config/tools';
import { parseAuthState } from '@/lib/auth/state';

const SAFE_OTP_TYPES = ['signup', 'magiclink', 'email'] as const;
type SafeOtpType = (typeof SAFE_OTP_TYPES)[number];

function asSafeOtpType(type: string | null): SafeOtpType | null {
  if (!type) return null;
  return (SAFE_OTP_TYPES as readonly string[]).includes(type) ? (type as SafeOtpType) : null;
}

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const code = req.nextUrl.searchParams.get('code');
  const type = req.nextUrl.searchParams.get('type');
  const safeType = asSafeOtpType(type);
  const rawState = req.nextUrl.searchParams.get('state');
  const state = parseAuthState(rawState);

  const diagnostics = {
    routeVersion: 'auth-callback-debug-v4',
    failureStep: null as string | null,
    queryParamNames: [...req.nextUrl.searchParams.keys()],
    hasState: Boolean(rawState),
    stateVerificationPassed: Boolean(state),
    stateFailureReason: !rawState ? 'missing_state' : state ? null : 'invalid_or_expired_state',
    hasTokenHash: Boolean(tokenHash),
    hasType: Boolean(type),
    ...(safeType ? { safeType } : {}),
    hasCode: Boolean(code),
    verifyOtpAttempted: false,
    verifyOtpSucceeded: false,
    codeExchangeAttempted: false,
    codeExchangeSucceeded: false,
    sessionCookieSet: false,
    resolvedToolId: state?.toolId ?? null,
    redirectTargetOrigin: null as string | null
  };

  if (!state) {
    diagnostics.failureStep = 'invalid_state';
    console.info('[auth/callback] diagnostics', diagnostics);
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  const returnUrl = getToolReturnUrl(state.toolId);
  if (!returnUrl) {
    diagnostics.failureStep = 'tool_redirect_resolution_failure';
    console.info('[auth/callback] diagnostics', diagnostics);
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  diagnostics.redirectTargetOrigin = new URL(returnUrl).origin;

  const supabaseAdmin = getSupabaseAdmin();
  if (detectConfiguredSupabaseRole() !== 'service_role') {
    diagnostics.failureStep = 'server_misconfigured';
    console.info('[auth/callback] diagnostics', diagnostics);
    return NextResponse.json({ status: 'error', reason: 'server_misconfigured', message: 'Missing required auth configuration.' }, { status: 500 });
  }

  let verifiedUserId: string | null = null;
  let verifiedEmail: string | null = null;

  if (tokenHash) {
    if (!safeType) {
      diagnostics.failureStep = 'unsupported_type';
      console.info('[auth/callback] diagnostics', diagnostics);
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }
    diagnostics.verifyOtpAttempted = true;
    const { data, error } = await supabaseAdmin.auth.verifyOtp({ token_hash: tokenHash, type: safeType });
    if (error || !data.user?.email) {
      diagnostics.failureStep = 'verify_otp_failed';
      console.info('[auth/callback] diagnostics', diagnostics);
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }
    diagnostics.verifyOtpSucceeded = true;
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else if (code) {
    diagnostics.codeExchangeAttempted = true;
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) {
      diagnostics.failureStep = 'code_exchange_failed';
      console.info('[auth/callback] diagnostics', diagnostics);
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }
    diagnostics.codeExchangeSucceeded = true;
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else {
    diagnostics.failureStep = 'missing_token_hash_or_code';
    console.info('[auth/callback] diagnostics', diagnostics);
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  await supabaseAdmin
    .from('profiles')
    .upsert({ id: verifiedUserId, email: verifiedEmail, email_verified: true, generations_used: 0, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: false });

  const response = NextResponse.redirect(returnUrl);
  setBackendSessionOnResponse(response, verifiedUserId!, verifiedEmail!);
  diagnostics.sessionCookieSet = response.cookies.has(BACKEND_SESSION_COOKIE_NAME);
  console.info('[auth/callback] diagnostics', diagnostics);
  return response;
}
