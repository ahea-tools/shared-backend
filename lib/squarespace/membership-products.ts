import { getEnv } from '@/lib/config/env';

const parseList = (v: string) => new Set(v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
export function getMembershipAllowlist() {
  const env = getEnv();
  return { monthly: parseList(env.SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS), annual: parseList(env.SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS) };
}

export function resolveBillingInterval(productId?: string | null, variantId?: string | null): 'monthly' | 'annual' | null {
  const allow = getMembershipAllowlist();
  const ids = [productId, variantId].filter(Boolean).map((x) => x!.toLowerCase());
  if (ids.some((id) => allow.monthly.has(id))) return 'monthly';
  if (ids.some((id) => allow.annual.has(id))) return 'annual';
  return null;
}

export function findMembershipLineItem(lineItems: Array<{ productId?: string; product_id?: string; variantId?: string; variant_id?: string }> = []) {
  for (const line of lineItems) {
    const productId = String(line.productId ?? line.product_id ?? '').toLowerCase() || undefined;
    const variantId = String(line.variantId ?? line.variant_id ?? '').toLowerCase() || undefined;
    const interval = resolveBillingInterval(productId, variantId);
    if (interval) return { productId, variantId, billingInterval: interval };
  }
  return null;
}
