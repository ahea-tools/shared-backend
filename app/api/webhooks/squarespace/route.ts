import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/config/env';
import { verifySquarespaceWebhook } from '@/lib/squarespace/verify-webhook';
import { parseSquarespaceEvent } from '@/lib/squarespace/parse-event';
import { getSupabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const env = getEnv();
  const rawBody = await req.text();
  if (env.NODE_ENV === 'production' && !env.SQUARESPACE_WEBHOOK_SECRET) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Webhook secret required in production.' }, { status: 500 });
  const signature = req.headers.get('x-squarespace-signature');
  if (env.SQUARESPACE_WEBHOOK_SECRET && !verifySquarespaceWebhook(rawBody, signature, env.SQUARESPACE_WEBHOOK_SECRET)) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid signature.' }, { status: 401 });
  const payload = JSON.parse(rawBody || '{}');
  const parsed = parseSquarespaceEvent(payload, req.headers);
  const supa = getSupabaseAdmin();
  const insert = await supa.from('webhook_events').insert({ provider: 'squarespace', event_id: parsed.eventId, event_type: parsed.eventType, payload, processed_status: 'pending' });
  if (insert.error && insert.error.code === '23505') return NextResponse.json({ status: 'success', duplicated: true });
  if (!parsed.relevant) {
    await supa.from('webhook_events').update({ processed_status: 'ignored', processed_at: new Date().toISOString() }).eq('provider', 'squarespace').eq('event_id', parsed.eventId);
    return NextResponse.json({ status: 'success', ignored: true, reason: parsed.ignoredReason });
  }
  await supa.from('membership_entitlements').upsert({
    email: parsed.email,
    provider: 'squarespace',
    provider_order_id: parsed.providerOrderId ?? null,
    provider_subscription_id: parsed.providerSubscriptionId ?? null,
    provider_customer_id: parsed.providerCustomerId ?? null,
    provider_product_id: parsed.providerProductId ?? null,
    provider_variant_id: parsed.providerVariantId ?? null,
    billing_interval: parsed.billingInterval ?? 'unknown',
    status: parsed.status ?? 'unknown',
    access_status: 'paid',
    current_period_start: parsed.currentPeriodStart ?? null,
    current_period_end: parsed.currentPeriodEnd ?? null,
    cancel_at_period_end: parsed.cancelAtPeriodEnd ?? false,
    source_event_id: parsed.eventId,
    last_synced_at: new Date().toISOString()
  });
  await supa.from('webhook_events').update({ processed_status: 'processed', processed_at: new Date().toISOString() }).eq('provider', 'squarespace').eq('event_id', parsed.eventId);
  return NextResponse.json({ status: 'success', processed: true });
}
