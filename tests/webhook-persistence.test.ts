import { describe, it, expect, vi } from 'vitest';
import { persistWebhookEvent, persistMembershipEntitlement } from '@/lib/squarespace/webhook-handler';
import { verifySquarespaceWebhook } from '@/lib/squarespace/verify-webhook';
import crypto from 'node:crypto';

function mockSupa(failInsert = false, failUpsert = false) {
  const insert = vi.fn(async () => ({ error: failInsert ? { code: 'x', message: 'insert failed' } : null }));
  const upsert = vi.fn(async () => ({ error: failUpsert ? { code: 'y', message: 'upsert failed' } : null }));
  return { from: vi.fn(() => ({ insert, upsert, update: vi.fn() })), insert, upsert } as any;
}

const unrelated = { eventId: 'e1', eventType: 'order.update', relevant: false, ignoredReason: 'no_membership_match' } as any;
const missingEmail = { eventId: 'e2', eventType: 'order.update', relevant: false, ignoredReason: 'missing_email' } as any;
const matched = { eventId: 'e3', eventType: 'order.create', relevant: true, email: 'a@b.com', billingInterval: 'monthly', status: 'active' } as any;

describe('webhook persistence', () => {
  it('verified unrelated webhook creates webhook_events ignored', async () => {
    const s = mockSupa();
    await persistWebhookEvent(s, unrelated, {}, { descriptorFields: ['Monthly Plan'], emailSourcePath: 'payload.data.order.email', emailFound: false });
    expect(s.insert).toHaveBeenCalled();
    expect(s.insert.mock.calls[0][0].processed_status).toBe('ignored');
    expect(s.insert.mock.calls[0][0].metadata.descriptorFields).toContain('Monthly Plan');
  });
  it('verified missing-email webhook creates ignored row', async () => {
    const s = mockSupa();
    await persistWebhookEvent(s, missingEmail, {}, { descriptorFields: ['Annual Access'], emailFound: false });
    expect(s.insert.mock.calls[0][0].error).toBe('missing_email');
  });
  it('verified membership webhook creates webhook_events row', async () => {
    const s = mockSupa();
    await persistWebhookEvent(s, matched, {}, { descriptorFields: ['Monthly Plan'], productIds: ['p1'], emailFound: true, emailSourcePath: 'payload.data.order.customerEmail' });
    expect(s.insert.mock.calls[0][0].processed_status).toBe('processed');
    expect(s.insert.mock.calls[0][0].metadata.descriptorFields).toContain('Monthly Plan');
    expect(JSON.stringify(s.insert.mock.calls[0][0].metadata)).not.toContain('a@b.com');
  });
  it('verified membership webhook attempts entitlement upsert', async () => {
    const s = mockSupa();
    await persistMembershipEntitlement(s, matched);
    expect(s.upsert).toHaveBeenCalled();
  });
  it('supabase insert failure is surfaced', async () => {
    const s = mockSupa(true, false);
    const res = await persistWebhookEvent(s, matched, {});
    expect(res.error).toBeTruthy();
  });
  it('invalid signature does not create entitlement', async () => {
    const body = '{}';
    const sig = crypto.createHmac('sha256', Buffer.from('aabb', 'hex')).update(body).digest('hex');
    expect(verifySquarespaceWebhook(body, sig, 'ccdd').ok).toBe(false);
  });
});
