import { describe, it, expect, vi } from 'vitest';
import { extractEmailFromSquarespacePayload, extractSquarespaceOrderId } from '@/lib/squarespace/orders';
import { parseSquarespaceEvent } from '@/lib/squarespace/parse-event';
import * as orders from '@/lib/squarespace/orders';

describe('webhook enrichment parsing', () => {
  it('email found directly in webhook payload', () => {
    const out = extractEmailFromSquarespacePayload({ data: { order: { customerEmail: 'A@B.COM ' } } });
    expect(out.email).toBe('a@b.com');
  });
  it('missing email but order ID present triggers fetch path readiness', () => {
    expect(extractSquarespaceOrderId({ data: { order: { id: 'ord_1' } } })).toBe('ord_1');
  });
  it('full order provides email and line items', () => {
    const parsed = parseSquarespaceEvent({ id: 'e1', type: 'order.create' }, new Headers(), { id: 'o1', customerEmail: 'x@y.com', lineItems: [{ productId: 'prod-1' }] });
    expect(parsed.email).toBe('x@y.com');
  });
  it('invalid email is ignored', () => {
    const out = extractEmailFromSquarespacePayload({ email: 'not-an-email' });
    expect(out.email).toBeNull();
  });
  it('order fetch failure can map to ignored reason', async () => {
    vi.spyOn(orders, 'fetchSquarespaceOrder').mockResolvedValue({ ok: false, reason: 'order_fetch_failed' } as any);
    const fetched = await orders.fetchSquarespaceOrder('o1');
    expect(fetched.ok).toBe(false);
  });
});
