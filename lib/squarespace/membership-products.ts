import { getEnv } from '@/lib/config/env';

const parseList = (v: string) => new Set(v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const parseMatchers = (v: string) => v.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const normalizePrice = (v: unknown) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
};

export function getMembershipAllowlist() {
  const env = getEnv();
  return {
    monthly: parseList(env.SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS),
    annual: parseList(env.SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS),
    monthlyMatchers: parseMatchers(env.SQUARESPACE_MEMBERSHIP_MONTHLY_MATCHERS || ''),
    annualMatchers: parseMatchers(env.SQUARESPACE_MEMBERSHIP_ANNUAL_MATCHERS || ''),
    sharedProductIds: parseList(env.SQUARESPACE_MEMBERSHIP_SHARED_PRODUCT_IDS || ''),
    monthlyPrices: new Set((env.SQUARESPACE_MEMBERSHIP_MONTHLY_PRICE_VALUES || '').split(',').map((x) => normalizePrice(x)).filter(Boolean) as string[]),
    annualPrices: new Set((env.SQUARESPACE_MEMBERSHIP_ANNUAL_PRICE_VALUES || '').split(',').map((x) => normalizePrice(x)).filter(Boolean) as string[]),
    priceCurrency: (env.SQUARESPACE_MEMBERSHIP_PRICE_CURRENCY || 'USD').trim().toUpperCase()
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

function resolveBySharedProductPrice(line: any): { interval: 'monthly' | 'annual' | null; pricePathUsed: string | null; currencyUsed: string | null } {
  const allow = getMembershipAllowlist();
  const productId = String(line.productId ?? line.product_id ?? '').toLowerCase();
  const variantId = String(line.variantId ?? line.variant_id ?? '').toLowerCase();
  const guarded = allow.sharedProductIds.has(productId) || allow.sharedProductIds.has(variantId);
  if (!guarded) return { interval: null, pricePathUsed: null, currencyUsed: null };
  const candidates: Array<[string, any, any]> = [
    ['unitPricePaid.value', line?.unitPricePaid?.value, line?.unitPricePaid?.currency],
    ['unitPrice.value', line?.unitPrice?.value, line?.unitPrice?.currency],
    ['price.value', line?.price?.value, line?.price?.currency],
    ['amount.value', line?.amount?.value, line?.amount?.currency]
  ];
  for (const [path, value, currency] of candidates) {
    const normalized = normalizePrice(value);
    if (!normalized) continue;
    const currencyUsed = currency ? String(currency).toUpperCase() : null;
    if (currencyUsed && currencyUsed !== allow.priceCurrency) continue;
    if (allow.monthlyPrices.has(normalized)) return { interval: 'monthly', pricePathUsed: path, currencyUsed };
    if (allow.annualPrices.has(normalized)) return { interval: 'annual', pricePathUsed: path, currencyUsed };
  }
  return { interval: null, pricePathUsed: null, currencyUsed: null };
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

    const priceFallback = resolveBySharedProductPrice(line);
    if (priceFallback.interval) return { productId, variantId, billingInterval: priceFallback.interval, matchSource: 'shared_product_price' as const, pricePathUsed: priceFallback.pricePathUsed, currencyUsed: priceFallback.currencyUsed };
  }
  return null;
}
