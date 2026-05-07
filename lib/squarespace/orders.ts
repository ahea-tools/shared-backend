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
