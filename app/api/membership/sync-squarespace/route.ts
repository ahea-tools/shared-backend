import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEnv } from '@/lib/config/env';

const schema = z.object({ email: z.string().email(), providerOrderId: z.string().optional(), providerCustomerId: z.string().optional(), providerSubscriptionId: z.string().optional() });

export async function POST(req: NextRequest) {
  const env = getEnv();
  const secret = req.headers.get('x-admin-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!secret || secret !== env.SQUARESPACE_SYNC_ADMIN_SECRET) return NextResponse.json({ status: 'blocked', reason: 'auth_required', message: 'Admin secret required.' }, { status: 401 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid sync request.' }, { status: 400 });
  return NextResponse.json({ status: 'success', synced: false, message: 'Sync scaffold is in place. TODO: fetch Squarespace API records and reconcile entitlements safely.' });
}
