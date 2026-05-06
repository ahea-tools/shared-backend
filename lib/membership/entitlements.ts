export type MembershipEntitlement = {
  email: string;
  provider: 'squarespace';
  access_status: 'paid' | 'comped' | 'admin';
  status: 'active' | 'past_due' | 'canceled' | 'expired' | 'refunded' | 'unknown';
  billing_interval: 'monthly' | 'annual' | 'unknown';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export function isEntitlementActivePaid(entitlement: MembershipEntitlement | null, now = new Date()): boolean {
  if (!entitlement || entitlement.provider !== 'squarespace' || entitlement.access_status !== 'paid') return false;
  const periodEnd = entitlement.current_period_end ? new Date(entitlement.current_period_end) : null;
  if (entitlement.status === 'refunded' || entitlement.status === 'expired' || entitlement.status === 'past_due' || entitlement.status === 'unknown') return false;
  if (entitlement.status === 'active') return !periodEnd || periodEnd > now;
  if (entitlement.status === 'canceled') return entitlement.cancel_at_period_end && !!periodEnd && periodEnd > now;
  return false;
}
