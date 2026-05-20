import { NextRequest, NextResponse } from 'next/server';
import { detectConfiguredSupabaseRole, getSupabaseAdmin } from '@/lib/supabase/server';
import { setBackendSessionOnResponse } from '@/lib/auth/session';
import { getToolReturnUrl } from '@/lib/config/tools';
import { parseAuthState } from '@/lib/auth/state';

const SAFE_OTP_TYPES = ['signup', 'magiclink', 'email'] as const;
type SafeOtpType = (typeof SAFE_OTP_TYPES)[number];

function asSafeOtpType(type: string | null): SafeOtpType | null {
  if (!type) return null;
  if ((SAFE_OTP_TYPES as readonly string[]).includes(type)) {
    return type as SafeOtpType;
  }
  return null;
}

function logAuthCallback(details: {
  req: NextRequest;
  hasState: boolean;
  stateVerificationPassed: boolean;
  hasToken: boolean;
  hasTokenHash: boolean;
  hasType: boolean;
  safeType: SafeOtpType | null;
  hasCode: boolean;
  failureStep?: string;
}) {
  console.info('[auth/callback]', {
    queryParamNames: [...details.req.nextUrl.searchParams.keys()],
    hasState: details.hasState,
    stateVerificationPassed: details.stateVerificationPassed,
    hasToken: details.hasToken,
    hasTokenHash: details.hasTokenHash,
    hasType: details.hasType,
    ...(details.safeType ? { type: details.safeType } : {}),
    hasCode: details.hasCode,
    ...(details.failureStep ? { failureStep: details.failureStep } : {})
  });
}

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const token = req.nextUrl.searchParams.get('token');
  const code = req.nextUrl.searchParams.get('code');
  const type = req.nextUrl.searchParams.get('type');
  const safeType = asSafeOtpType(type);

  const rawState = req.nextUrl.searchParams.get('state');
  const state = parseAuthState(rawState);

  const hasState = Boolean(rawState);
  const stateVerificationPassed = Boolean(state);
  const hasToken = Boolean(token);
  const hasTokenHash = Boolean(tokenHash);
  const hasType = Boolean(type);
  const hasCode = Boolean(code);

  if (!state) {
    logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode, failureStep: 'invalid_state' });
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  const returnUrl = getToolReturnUrl(state.toolId);
  if (!returnUrl) {
    logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode, failureStep: 'invalid_tool' });
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (detectConfiguredSupabaseRole() !== 'service_role') {
    logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode, failureStep: 'server_misconfigured' });
    return NextResponse.json({ status: 'error', reason: 'server_misconfigured', message: 'Missing required auth configuration.' }, { status: 500 });
  }

  let verifiedUserId: string | null = null;
  let verifiedEmail: string | null = null;

  if (tokenHash) {
    if (!safeType) {
      logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode, failureStep: 'unsupported_type' });
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.verifyOtp({ token_hash: tokenHash, type: safeType });
    if (error || !data.user?.email) {
      logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode, failureStep: 'verify_otp_failed' });
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else if (code) {
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);
    if (error || !data.user?.email) {
      logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode, failureStep: 'exchange_code_failed' });
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else {
    logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode, failureStep: 'missing_verification_artifact' });
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  }

  await supabaseAdmin
    .from('profiles')
    .upsert({ id: verifiedUserId, email: verifiedEmail, email_verified: true, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: false });

  logAuthCallback({ req, hasState, stateVerificationPassed, hasToken, hasTokenHash, hasType, safeType, hasCode });

  const response = NextResponse.redirect(returnUrl);
  setBackendSessionOnResponse(response, verifiedUserId!, verifiedEmail!);
  return response;
}
