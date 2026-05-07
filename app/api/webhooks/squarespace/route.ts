import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/config/env';
import { verifySquarespaceWebhook } from '@/lib/squarespace/verify-webhook';
import { parseSquarespaceEvent } from '@/lib/squarespace/parse-event';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { persistMembershipEntitlement, persistWebhookEvent } from '@/lib/squarespace/webhook-handler';
import { extractEmailFromSquarespacePayload, extractSafeMembershipDescriptors, extractSquarespaceOrderId, fetchSquarespaceOrder } from '@/lib/squarespace/orders';

export async function POST(req: NextRequest) {
  const env = getEnv();
  console.info('webhook received', { provider: 'squarespace' });
  console.info('supabase target host', { host: new URL(env.SUPABASE_URL).hostname });

  const rawBody = await req.text();
  const signature = req.headers.get('Squarespace-Signature') ?? req.headers.get('x-squarespace-signature');
  const verification = verifySquarespaceWebhook(rawBody, signature, env.SQUARESPACE_WEBHOOK_SECRET ?? '');
  if (!verification.ok) return NextResponse.json({ status: 'blocked', reason: 'invalid_request', message: 'Invalid signature.' }, { status: 401 });
  console.info('signature verification passed');

  const payload = JSON.parse(rawBody || '{}');
  const orderId = extractSquarespaceOrderId(payload);
  const emailExtract = extractEmailFromSquarespacePayload(payload);
  console.info('order id extracted', { hasOrderId: Boolean(orderId) });
  console.info('email found', { found: Boolean(emailExtract.email), emailSourcePath: emailExtract.sourcePath });

  let fullOrder: any = null;
  let orderFetchAttempted = false;
  let orderFetchSuccess = false;
  if (!emailExtract.email && orderId) {
    orderFetchAttempted = true;
    const fetched = await fetchSquarespaceOrder(orderId);
    orderFetchSuccess = fetched.ok;
    if (fetched.ok) fullOrder = fetched.order;
    console.info('order fetch result', { orderFetchAttempted, orderFetchSuccess, authMode: fetched.ok ? fetched.authMode : null });
  }

  let parsed = parseSquarespaceEvent(payload, req.headers, fullOrder);
  if (!parsed.email && orderFetchAttempted && !orderFetchSuccess) parsed = { ...parsed, ignoredReason: 'missing_email_order_fetch_failed' };
  const descriptor = extractSafeMembershipDescriptors(fullOrder ? { data: { order: fullOrder } } : payload);
  console.info('descriptor count', { count: descriptor.fields.length });
  console.info('membership match result', { relevant: parsed.relevant, matchSource: parsed.matchSource ?? null, ignoredReason: parsed.ignoredReason ?? null });
  console.info('parsed event', { eventId: parsed.eventId, eventType: parsed.eventType });
  const safeMetadata = {
    eventId: parsed.eventId,
    eventType: parsed.eventType,
    providerOrderId: parsed.providerOrderId ?? null,
    emailFound: Boolean(parsed.email),
    emailSourcePath: parsed.emailSourcePath ?? null,
    orderFetchAttempted,
    orderFetchSuccess,
    processedStatus: parsed.relevant ? 'processed' : 'ignored',
    ignoredReason: parsed.ignoredReason ?? null,
    descriptorFields: descriptor.fields,
    productIds: descriptor.productIds,
    variantIds: descriptor.variantIds,
    skus: descriptor.skus,
    lineItemNames: descriptor.fields.filter((f) => f),
    planNames: descriptor.fields.filter((f) => /plan/i.test(f)),
    membershipAreaNames: descriptor.fields.filter((f) => /membership/i.test(f)),
    matchSource: parsed.matchSource ?? null,
    billingInterval: parsed.billingInterval ?? null
  };

  const supa = getSupabaseAdmin();
  console.info('webhook_events insert attempted');
  const eventInsert = await persistWebhookEvent(supa as any, parsed, payload, safeMetadata);
  if (eventInsert.error) {
    console.error('webhook_events insert failure', { code: eventInsert.error.code, message: eventInsert.error.message });
    return NextResponse.json({ status: 'error', message: 'Failed to persist webhook event.' }, { status: 500 });
  }
  console.info('webhook_events insert success');

  if (!parsed.relevant || !parsed.email) return NextResponse.json({ status: 'success', ignored: true, reason: parsed.ignoredReason });

  console.info('entitlement upsert attempted');
  const entitlement = await persistMembershipEntitlement(supa as any, parsed);
  if (entitlement.error) {
    console.error('entitlement upsert failure', { code: entitlement.error.code, message: entitlement.error.message });
    return NextResponse.json({ status: 'error', message: 'Failed to persist membership entitlement.' }, { status: 500 });
  }
  console.info('entitlement upsert success');
  return NextResponse.json({ status: 'success', processed: true });
}
