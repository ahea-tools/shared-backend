import { NextRequest, NextResponse } from 'next/server';
import { redeemAccessCodeSchema } from '@/lib/validation/schemas';
import { hashCode } from '@/lib/auth/cookies';
import { getEnv } from '@/lib/config/env';

export async function POST(req: NextRequest) {
  const parsed = redeemAccessCodeSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid access code request.' }, { status: 400 });
  const codeHash = hashCode(parsed.data.code, getEnv().BACKEND_COOKIE_SECRET);
  return NextResponse.json({ status: 'success', message: 'Access code redemption endpoint configured.', codeHashPreview: `${codeHash.slice(0, 6)}...` });
}
