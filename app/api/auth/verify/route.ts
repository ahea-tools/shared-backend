import { NextRequest, NextResponse } from 'next/server';
import { verifySchema } from '@/lib/validation/schemas';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const parsed = verifySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid verification payload.' }, { status: 400 });
  const { token, type } = parsed.data;
  const { data, error } = await getSupabaseAdmin().auth.verifyOtp({ token_hash: token, type: type === 'magiclink' ? 'magiclink' : 'email' });
  if (error || !data.user?.email) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Verification failed.' }, { status: 400 });
  await getSupabaseAdmin().from('profiles').upsert({ id: data.user.id, email: data.user.email, email_verified: true }, { onConflict: 'id', ignoreDuplicates: false });
  return NextResponse.json({ status: 'success', message: 'Email verified.' });
}
