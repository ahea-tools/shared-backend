import { getEnv } from '@/lib/config/env';

const parseList = (v: string) => new Set(v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const parseMatchers = (v: string) => v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

export function getMembershipAllowlist() {
  const env = getEnv();
  return {
    monthly: parseList(env.SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS),
    annual: parseList(env.SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS),
    monthlyMatchers: parseMatchers(env.SQUARESPACE_MEMBERSHIP_MONTHLY_MATCHERS || ''),
    annualMatchers: parseMatchers(env.SQUARESPACE_MEMBERSHIP_ANNUAL_MATCHERS || '')
  };
}

export function resolveBillingInterval(productId?: string | null, variantId?: string | null): 'monthly' | 'annual' | null {
  const allow = getMembershipAllowlist();
  const ids = [productId, variantId].filter(Boolean).map((x) => x!.toLowerCase());
  if (ids.some((id) => allow.monthly.has(id))) return 'monthly';
  if (ids.some((id) => allow.annual.has(id))) return 'annual';
  return null;
}

export function resolveByMatcher(fields: string[]): 'monthly' | 'annual' | null {
  const allow = getMembershipAllowlist();
  const text = fields.join(' ').toLowerCase();
  if (allow.monthlyMatchers.some((m) => text.includes(m))) return 'monthly';
  if (allow.annualMatchers.some((m) => text.includes(m))) return 'annual';
  return null;
}

export function findMembershipLineItem(lineItems: Array<any> = []) {
  for (const line of lineItems) {
    const productId = String(line.productId ?? line.product_id ?? '').toLowerCase() || undefined;
    const variantId = String(line.variantId ?? line.variant_id ?? '').toLowerCase() || undefined;
    const idInterval = resolveBillingInterval(productId, variantId);
    if (idInterval) return { productId, variantId, billingInterval: idInterval, matchSource: 'id' as const };

    const fallback = resolveByMatcher([
      String(line.name ?? line.title ?? ''),
      String(line.variantName ?? line.variant_name ?? ''),
      String(line.sku ?? ''),
      String(line.planName ?? line.plan_name ?? ''),
      String(line.membershipAreaName ?? line.membership_area_name ?? '')
    ]);
    if (fallback) return { productId, variantId, billingInterval: fallback, matchSource: 'matcher' as const };
  }
  return null;
}
