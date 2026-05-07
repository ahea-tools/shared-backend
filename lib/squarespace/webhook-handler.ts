import type { ParsedSquarespaceEvent } from '@/lib/squarespace/parse-event';

export type SupabaseLike = {
  from: (table: string) => {
    insert: (payload: any) => Promise<{ error: any }>;
    upsert: (payload: any) => Promise<{ error: any }>;
    update: (payload: any) => { eq: (col: string, value: any) => { eq: (col: string, value: any) => Promise<{ error: any }> } };
  };
};

export async function persistWebhookEvent(supa: SupabaseLike, parsed: ParsedSquarespaceEvent, payload: unknown) {
  const status = parsed.relevant ? 'processed' : 'ignored';
  const reason = parsed.relevant ? null : (parsed.ignoredReason ?? 'unsupported_event_type');
  const res = await supa.from('webhook_events').insert({ provider: 'squarespace', event_id: parsed.eventId, event_type: parsed.eventType, payload, processed_status: status, processed_at: new Date().toISOString(), error: reason });
  return res;
}

export async function persistMembershipEntitlement(supa: SupabaseLike, parsed: ParsedSquarespaceEvent) {
  if (!parsed.relevant) return { error: null };
  return supa.from('membership_entitlements').upsert({
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
}
