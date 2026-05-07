import crypto from 'node:crypto';
import { findMembershipLineItem } from '@/lib/squarespace/membership-products';

export type ParsedSquarespaceEvent = {
  eventId: string; eventType: string; relevant: boolean; ignoredReason?: string; email?: string;
  providerOrderId?: string; providerSubscriptionId?: string; providerCustomerId?: string;
  providerProductId?: string; providerVariantId?: string;
  billingInterval?: 'monthly' | 'annual' | 'unknown';
  status?: 'active' | 'past_due' | 'canceled' | 'expired' | 'refunded' | 'unknown';
  currentPeriodStart?: string; currentPeriodEnd?: string; cancelAtPeriodEnd?: boolean; matchSource?: 'id' | 'matcher';
};

export function parseSquarespaceEvent(payload: any, headers: Headers): ParsedSquarespaceEvent {
  const eventId = String(payload?.id ?? headers.get('x-squarespace-event-id') ?? crypto.randomUUID());
  const eventType = String(payload?.type ?? headers.get('x-squarespace-event-type') ?? 'unknown');
  const order = payload?.data?.order ?? payload?.order ?? payload?.data ?? {};
  const lines = order?.lineItems ?? order?.line_items ?? [];
  const matched = findMembershipLineItem(lines);
  const email = (order?.customerEmail ?? order?.email ?? payload?.customer?.email ?? '').toLowerCase().trim();
  if (!email) return { eventId, eventType, relevant: false, ignoredReason: 'missing_email' };
  if (!matched) return { eventId, eventType, relevant: false, ignoredReason: 'no_membership_match', email };
  return {
    eventId, eventType, relevant: true, email,
    providerOrderId: order?.id ? String(order.id) : undefined,
    providerSubscriptionId: order?.subscriptionId ? String(order.subscriptionId) : undefined,
    providerCustomerId: order?.customerId ? String(order.customerId) : undefined,
    providerProductId: matched.productId, providerVariantId: matched.variantId,
    billingInterval: matched.billingInterval,
    matchSource: matched.matchSource,
    status: payload?.refund ? 'refunded' : (order?.status === 'canceled' ? 'canceled' : 'active'),
    currentPeriodStart: order?.periodStart,
    currentPeriodEnd: order?.periodEnd,
    cancelAtPeriodEnd: Boolean(order?.cancelAtPeriodEnd)
  };
}
