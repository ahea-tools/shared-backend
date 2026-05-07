import crypto from 'node:crypto';
import { findMembershipLineItem, resolveByMatcher } from '@/lib/squarespace/membership-products';
import { extractEmailFromSquarespacePayload, extractSafeMembershipDescriptors, extractSquarespaceOrderId } from '@/lib/squarespace/orders';

export type ParsedSquarespaceEvent = {
  eventId: string; eventType: string; relevant: boolean; ignoredReason?: string; email?: string;
  providerOrderId?: string; providerSubscriptionId?: string; providerCustomerId?: string;
  providerProductId?: string; providerVariantId?: string;
  billingInterval?: 'monthly' | 'annual' | 'unknown'; status?: 'active' | 'past_due' | 'canceled' | 'expired' | 'refunded' | 'unknown';
  currentPeriodStart?: string; currentPeriodEnd?: string; cancelAtPeriodEnd?: boolean; matchSource?: 'id' | 'matcher';
  emailSourcePath?: string | null; descriptorCount?: number;
};

export function parseSquarespaceEvent(payload: any, headers: Headers, fullOrder?: any): ParsedSquarespaceEvent {
  const eventId = String(payload?.id ?? headers.get('x-squarespace-event-id') ?? crypto.randomUUID());
  const eventType = String(payload?.type ?? payload?.topic ?? headers.get('x-squarespace-event-type') ?? 'unknown');
  const order = fullOrder ?? payload?.data?.order ?? payload?.order ?? payload?.data ?? {};
  const lines = order?.lineItems ?? order?.line_items ?? [];
  const matched = findMembershipLineItem(lines);
  const emailExtract = extractEmailFromSquarespacePayload(fullOrder ?? payload);
  const descriptor = extractSafeMembershipDescriptors({ data: { order } });
  let matcherInterval: 'monthly' | 'annual' | null = null;
  if (!matched) matcherInterval = resolveByMatcher([...descriptor.fields, ...descriptor.skus]);

  if (!emailExtract.email) return { eventId, eventType, relevant: false, ignoredReason: 'missing_email', providerOrderId: extractSquarespaceOrderId(payload) ?? undefined, emailSourcePath: emailExtract.sourcePath, descriptorCount: descriptor.fields.length };
  if (!matched && !matcherInterval) return { eventId, eventType, relevant: false, ignoredReason: 'no_membership_match', email: emailExtract.email, providerOrderId: extractSquarespaceOrderId(payload) ?? undefined, emailSourcePath: emailExtract.sourcePath, descriptorCount: descriptor.fields.length };

  return {
    eventId, eventType, relevant: true, email: emailExtract.email,
    providerOrderId: order?.id ? String(order.id) : extractSquarespaceOrderId(payload) ?? undefined,
    providerSubscriptionId: order?.subscriptionId ? String(order.subscriptionId) : undefined,
    providerCustomerId: order?.customerId ? String(order.customerId) : undefined,
    providerProductId: matched?.productId,
    providerVariantId: matched?.variantId,
    billingInterval: matched?.billingInterval ?? matcherInterval ?? 'unknown',
    matchSource: matched?.matchSource ?? (matcherInterval ? 'matcher' : undefined),
    status: payload?.refund ? 'refunded' : (order?.status === 'canceled' ? 'canceled' : 'active'),
    currentPeriodStart: order?.periodStart,
    currentPeriodEnd: order?.periodEnd,
    cancelAtPeriodEnd: Boolean(order?.cancelAtPeriodEnd),
    emailSourcePath: emailExtract.sourcePath,
    descriptorCount: descriptor.fields.length
  };
}
