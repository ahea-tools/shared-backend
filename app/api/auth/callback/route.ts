import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { setBackendSession } from '@/lib/auth/session';

function safeReturnTo(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get('token_hash');
  const type = req.nextUrl.searchParams.get('type') === 'magiclink' ? 'magiclink' : 'email';
  const returnTo = safeReturnTo(req.nextUrl.searchParams.get('return_to'));
  if (!tokenHash) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Missing token.' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin().auth.verifyOtp({ token_hash: tokenHash, type });
  if (error || !data.user?.email) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });

  await getSupabaseAdmin().from('profiles').upsert({ id: data.user.id, email: data.user.email, email_verified: true }, { onConflict: 'id', ignoreDuplicates: false });
  await setBackendSession(data.user.id, data.user.email);

  if (returnTo) return NextResponse.redirect(returnTo);
  return NextResponse.json({ status: 'success', message: 'Email verified and session established.' });
}
