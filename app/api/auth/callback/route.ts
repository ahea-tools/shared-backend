import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, isServiceRoleClientConfiguredSafely } from '@/lib/supabase/server';
import { setBackendSessionOnResponse } from '@/lib/auth/session';
import { validateReturnTo } from '@/lib/auth/return-to';

const SUPABASE_OTP_TYPES = new Set(['signup', 'magiclink', 'recovery', 'invite', 'email_change', 'email']);

function resolveOtpType(type: string | null): 'magiclink' | 'email' {
  if (type === 'magiclink') return 'magiclink';
  return 'email';
}

function hasRequiredSupabaseAdminEnv() {
  return Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function GET(req: NextRequest) {
  const returnTo = validateReturnTo(req.nextUrl.searchParams.get('return_to'));
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const code = req.nextUrl.searchParams.get('code');
  const type = req.nextUrl.searchParams.get('type');

  console.info('[auth/callback] callback reached', {
    hasReturnTo: Boolean(returnTo),
    format: tokenHash ? 'token_hash' : code ? 'code' : 'unsupported',
    supabaseType: type && SUPABASE_OTP_TYPES.has(type) ? type : 'unknown',
    hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
  });

  if (!hasRequiredSupabaseAdminEnv()) {
    console.error('[auth/callback] missing required Supabase admin env vars', {
      required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    });
    return NextResponse.json(
      { status: 'error', reason: 'server_misconfigured', message: 'Missing required auth configuration.' },
      { status: 500 }
    );
  }

  let supabaseAdmin;
  try {
    supabaseAdmin = getSupabaseAdmin();
  } catch (error) {
    console.error('[auth/callback] invalid Supabase admin configuration', {
      message: error instanceof Error ? error.message : 'invalid configuration',
      required: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    });
    return NextResponse.json(
      { status: 'error', reason: 'server_misconfigured', message: 'Missing required auth configuration.' },
      { status: 500 }
    );
  }

  let verifiedUserId: string | null = null;
  let verifiedEmail: string | null = null;

  if (tokenHash) {
    const { data, error } = await supabaseAdmin.auth.verifyOtp({
      token_hash: tokenHash,
      type: resolveOtpType(type)
    });

    if (error || !data.user?.email) {
      console.error('[auth/callback] verifyOtp failed', {
        code: error?.code ?? 'unknown',
        status: error?.status ?? 'unknown',
        message: error?.message ?? 'verification failed',
        hadUser: Boolean(data.user),
        hadEmail: Boolean(data.user?.email)
      });
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }

    console.info('[auth/callback] supabase verification succeeded', { hadUser: true, hadEmail: true, mode: 'token_hash' });
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else if (code) {
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);

    if (error || !data.user?.email) {
      console.error('[auth/callback] exchangeCodeForSession failed', {
        code: error?.code ?? 'unknown',
        status: error?.status ?? 'unknown',
        message: error?.message ?? 'code exchange failed',
        hadUser: Boolean(data.user),
        hadEmail: Boolean(data.user?.email)
      });
      return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
    }

    console.info('[auth/callback] supabase verification succeeded', { hadUser: true, hadEmail: true, mode: 'code' });
    verifiedUserId = data.user.id;
    verifiedEmail = data.user.email;
  } else {
    return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Missing callback credentials.' }, { status: 400 });
  }

  console.info('[auth/callback] profile write attempt', {
    usingServiceRoleClient: isServiceRoleClientConfiguredSafely(),
    table: 'profiles',
    hasUserId: Boolean(verifiedUserId),
    hasEmail: Boolean(verifiedEmail)
  });

  const { error: upsertError } = await supabaseAdmin
    .from('profiles')
    .upsert({ id: verifiedUserId, email: verifiedEmail, email_verified: true, updated_at: new Date().toISOString() }, { onConflict: 'id', ignoreDuplicates: false });

  if (upsertError) {
    console.error('[auth/callback] profile upsert failed', {
      code: upsertError.code ?? 'unknown',
      message: upsertError.message ?? 'profile upsert failed',
      details: upsertError.details ?? 'none',
      hint: upsertError.hint ?? 'none'
    });
    return NextResponse.json({ status: 'error', reason: 'server_error', message: 'Could not persist verified user.' }, { status: 500 });
  }
  console.info('[auth/callback] profile upsert succeeded');

  const response = returnTo
    ? NextResponse.redirect(returnTo)
    : NextResponse.json({ status: 'success', message: 'Email verified and session established.' });

  setBackendSessionOnResponse(response, verifiedUserId, verifiedEmail);
  console.info('[auth/callback] session cookie attached', {
    cookieAttached: response.cookies.has('ahea_session'),
    redirectOrigin: returnTo ? new URL(returnTo).origin : null,
    redirectPath: returnTo ? new URL(returnTo).pathname : null
  });

  return response;
}
