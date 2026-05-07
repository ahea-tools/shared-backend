import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/config/env';
import { verifySquarespaceWebhook } from '@/lib/squarespace/verify-webhook';
import { parseSquarespaceEvent } from '@/lib/squarespace/parse-event';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { persistMembershipEntitlement, persistWebhookEvent } from '@/lib/squarespace/webhook-handler';

export async function POST(req: NextRequest) {
  const env = getEnv();
  console.info('webhook received', { provider: 'squarespace' });
  console.info('supabase target host', { host: new URL(env.SUPABASE_URL).hostname });

  const rawBody = await req.text();
  if (env.NODE_ENV === 'production' && !env.SQUARESPACE_WEBHOOK_SECRET) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Webhook secret required in production.' }, { status: 500 });
  const signature = req.headers.get('Squarespace-Signature') ?? req.headers.get('x-squarespace-signature');
  const verification = verifySquarespaceWebhook(rawBody, signature, env.SQUARESPACE_WEBHOOK_SECRET ?? '');
  console.info('signature verification result', { ok: verification.ok, reason: verification.ok ? 'ok' : verification.reason });
  if (!verification.ok) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid signature.' }, { status: 401 });

  const payload = JSON.parse(rawBody || '{}');
  const parsed = parseSquarespaceEvent(payload, req.headers);
  console.info('parsed webhook event', { eventId: parsed.eventId, eventType: parsed.eventType });
  console.info('membership match result', { relevant: parsed.relevant, ignoredReason: parsed.ignoredReason ?? null, matchSource: parsed.matchSource ?? null });

  const supa = getSupabaseAdmin();
  console.info('webhook_events insert attempted', { eventId: parsed.eventId });
  const eventInsert = await persistWebhookEvent(supa as any, parsed, payload);
  if (eventInsert.error) {
    console.error('webhook_events insert failure', { code: eventInsert.error.code, message: eventInsert.error.message });
    return NextResponse.json({ status: 'error', message: 'Failed to persist webhook event.' }, { status: 500 });
  }
  console.info('webhook_events insert success', { eventId: parsed.eventId });

  if (!parsed.relevant) {
    return NextResponse.json({ status: 'success', ignored: true, reason: parsed.ignoredReason });
  }

  console.info('entitlement upsert attempted', { eventId: parsed.eventId });
  const entitlement = await persistMembershipEntitlement(supa as any, parsed);
  if (entitlement.error) {
    console.error('entitlement upsert failure', { code: entitlement.error.code, message: entitlement.error.message });
    return NextResponse.json({ status: 'error', message: 'Failed to persist membership entitlement.' }, { status: 500 });
  }
  console.info('entitlement upsert success', { eventId: parsed.eventId });

  return NextResponse.json({ status: 'success', processed: true });
}
