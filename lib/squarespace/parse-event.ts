import crypto from 'node:crypto';
import { resolveBillingInterval } from '@/lib/squarespace/membership-products';

export type ParsedSquarespaceEvent = {
  eventId: string;
  eventType: string;
  relevant: boolean;
  ignoredReason?: string;
  email?: string;
  providerOrderId?: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerProductId?: string;
  providerVariantId?: string;
  billingInterval?: 'monthly' | 'annual' | 'unknown';
  status?: 'active' | 'past_due' | 'canceled' | 'expired' | 'refunded' | 'unknown';
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
};

export function parseSquarespaceEvent(payload: any, headers: Headers): ParsedSquarespaceEvent {
  const eventId = String(payload?.id ?? headers.get('x-squarespace-event-id') ?? crypto.randomUUID());
  const eventType = String(payload?.type ?? headers.get('x-squarespace-event-type') ?? 'unknown');
  const order = payload?.data?.order ?? payload?.order ?? payload?.data ?? {};
  const line = order?.lineItems?.[0] ?? order?.line_items?.[0] ?? {};
  const email = (order?.customerEmail ?? order?.email ?? payload?.customer?.email ?? '').toLowerCase().trim();
  const productId = String(line?.productId ?? line?.product_id ?? '').toLowerCase() || undefined;
  const variantId = String(line?.variantId ?? line?.variant_id ?? '').toLowerCase() || undefined;
  const interval = resolveBillingInterval(productId, variantId);
  if (!email) return { eventId, eventType, relevant: false, ignoredReason: 'missing_email' };
  if (!interval) return { eventId, eventType, relevant: false, ignoredReason: 'non_membership_product', email };
  return {
    eventId, eventType, relevant: true, email,
    providerOrderId: order?.id ? String(order.id) : undefined,
    providerSubscriptionId: order?.subscriptionId ? String(order.subscriptionId) : undefined,
    providerCustomerId: order?.customerId ? String(order.customerId) : undefined,
    providerProductId: productId, providerVariantId: variantId,
    billingInterval: interval,
    status: payload?.refund ? 'refunded' : (order?.status === 'canceled' ? 'canceled' : 'active'),
    currentPeriodStart: order?.periodStart,
    currentPeriodEnd: order?.periodEnd,
    cancelAtPeriodEnd: Boolean(order?.cancelAtPeriodEnd)
  };
}
