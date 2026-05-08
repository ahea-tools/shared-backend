import { getSquarespaceAccessToken } from '@/lib/squarespace/oauth';

export function extractSquarespaceOrderId(payload: any): string | null {
  const id = payload?.data?.order?.id ?? payload?.data?.orderId ?? payload?.data?.id ?? payload?.order?.id ?? null;
  return id ? String(id) : null;
}

function looksLikeEmail(v: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

export function extractEmailFromSquarespacePayload(payload: any): { email: string | null; sourcePath: string | null } {
  const paths: Array<[string, any]> = [
    ['payload.data.order.customerEmail', payload?.data?.order?.customerEmail],
    ['payload.data.order.email', payload?.data?.order?.email],
    ['payload.data.order.customer.email', payload?.data?.order?.customer?.email],
    ['payload.data.order.billingAddress.email', payload?.data?.order?.billingAddress?.email],
    ['payload.data.order.shippingAddress.email', payload?.data?.order?.shippingAddress?.email],
    ['payload.data.customer.email', payload?.data?.customer?.email],
    ['payload.data.profile.email', payload?.data?.profile?.email],
    ['payload.customerEmail', payload?.customerEmail],
    ['payload.email', payload?.email],
    ['fullOrder.customerEmail', payload?.customerEmail],
    ['fullOrder.email', payload?.email],
    ['fullOrder.customer.email', payload?.customer?.email],
    ['fullOrder.billingAddress.email', payload?.billingAddress?.email],
    ['fullOrder.shippingAddress.email', payload?.shippingAddress?.email]
  ];
  for (const [path, val] of paths) {
    if (!val) continue;
    const email = String(val).trim().toLowerCase();
    if (looksLikeEmail(email)) return { email, sourcePath: path };
  }
  return { email: null, sourcePath: null };
}

export function extractSafeMembershipDescriptors(payload: any) {
  const lineItems = payload?.data?.order?.lineItems ?? payload?.lineItems ?? payload?.line_items ?? [];
  const fields: string[] = [];
  const productIds: string[] = [];
  const variantIds: string[] = [];
  const skus: string[] = [];
  for (const line of lineItems) {
    const productId = String(line?.productId ?? line?.product_id ?? '').trim();
    const variantId = String(line?.variantId ?? line?.variant_id ?? '').trim();
    const sku = String(line?.sku ?? '').trim();
    if (productId) productIds.push(productId.toLowerCase());
    if (variantId) variantIds.push(variantId.toLowerCase());
    if (sku) skus.push(sku.toLowerCase());
    for (const candidate of [line?.title, line?.name, line?.variantName, line?.variant_name, line?.planName, line?.plan_name, line?.membershipAreaName, line?.membership_area_name, line?.subscriptionPlanName, line?.subscription_plan_name]) {
      if (candidate) fields.push(String(candidate));
    }
  }
  return { fields, productIds: [...new Set(productIds)], variantIds: [...new Set(variantIds)], skus: [...new Set(skus)] };
}

export async function fetchSquarespaceOrder(orderId: string): Promise<{ ok: true; order: any; authMode: 'api_key' | 'oauth' } | { ok: false; reason: string }> {
  const endpoints = [`https://api.squarespace.com/1.0/commerce/orders/${encodeURIComponent(orderId)}`, `https://api.squarespace.com/1.0/commerce/orders/${encodeURIComponent(orderId)}/`];
  const apiKey = process.env.SQUARESPACE_API_KEY;
  if (apiKey) {
    for (const url of endpoints) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'User-Agent': 'AHEA Shared Backend' } });
      if (res.ok) return { ok: true, order: await res.json(), authMode: 'api_key' };
    }
  }
  const oauth = getSquarespaceAccessToken();
  if (oauth.ok) {
    for (const url of endpoints) {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${oauth.token}`, Accept: 'application/json', 'User-Agent': 'AHEA Shared Backend' } });
      if (res.ok) return { ok: true, order: await res.json(), authMode: 'oauth' };
    }
  }
  return { ok: false, reason: 'order_fetch_failed' };
}


function truncate(v: string) { return v.length > 120 ? v.slice(0, 120) : v; }

export function extractSafeDiagnosticMetadata(payload: any, fullOrder: any = null) {
  const sources: Array<{ root: string; obj: any }> = [{ root: 'payload', obj: payload }];
  if (fullOrder) sources.push({ root: 'fullOrder', obj: fullOrder });
  const safeDescriptorPaths: Array<{ path: string; value: string }> = [];
  const safeIdentifierPaths: Array<{ path: string; value: string }> = [];
  const subscriptionFields: Array<{ path: string; value: string }> = [];
  const billingCadenceFields: Array<{ path: string; value: string }> = [];
  const variantOptionFields: Array<{ path: string; value: string }> = [];
  const pricingOptionFields: Array<{ path: string; value: string }> = [];
  const lineItemShapeKeys = new Set<string>();
  const fullOrderShapeKeys = new Set<string>();
  const identifiers = new Set<string>();

  const allowRegex = /(product|variant|sku|line.?item|plan|pricing.?option|subscription|membership.?area|billing.?interval|billing.?period|recurrence|cadence|frequency|option)/i;
  const denyRegex = /(email|address|phone|card|payment|transaction|customer)/i;

  function walk(v: any, path: string) {
    if (v == null) return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (typeof v === 'object') {
      Object.keys(v).forEach((k) => {
        if (/line.?items?/i.test(path)) lineItemShapeKeys.add(k);
        if (path.startsWith('fullOrder')) fullOrderShapeKeys.add(k);
        walk(v[k], `${path}.${k}`);
      });
      return;
    }
    const val = truncate(String(v));
    if (!allowRegex.test(path) || denyRegex.test(path)) return;
    if (/id$/i.test(path) || /(productId|variantId|sku|pricingOptionId)/i.test(path)) {
      safeIdentifierPaths.push({ path, value: val });
      identifiers.add(val.toLowerCase());
    } else {
      safeDescriptorPaths.push({ path, value: val });
    }
    if (/subscription|membership.?area/i.test(path)) subscriptionFields.push({ path, value: val });
    if (/billing.?interval|billing.?period|recurrence|cadence|frequency|month|year|annual/i.test(path)) billingCadenceFields.push({ path, value: val });
    if (/variant.*option|option.*value|option.*name/i.test(path)) variantOptionFields.push({ path, value: val });
    if (/pricing.?option/i.test(path)) pricingOptionFields.push({ path, value: val });
  }

  for (const src of sources) walk(src.obj, src.root);

  return {
    safeDescriptorPaths,
    safeIdentifierPaths,
    subscriptionFields,
    billingCadenceFields,
    variantOptionFields,
    pricingOptionFields,
    lineItemShapeKeys: [...lineItemShapeKeys],
    fullOrderShapeKeys: [...fullOrderShapeKeys],
    productIdsNotDistinct: identifiers.size <= 1
  };
}
