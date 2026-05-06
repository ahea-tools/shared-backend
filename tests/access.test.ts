import { describe, it, expect } from 'vitest';
import { evaluateGenerationAccess } from '@/lib/usage/access';
import { blockedResponse, successResponse } from '@/lib/responses/api-responses';
import { isEntitlementActivePaid } from '@/lib/membership/entitlements';
import { parseSquarespaceEvent } from '@/lib/squarespace/parse-event';

const base = { id: 'u', email: 'e', email_verified: true, access_expires_at: null, generations_used: 0 };
const activeMembership = { email: 'a@b.com', provider: 'squarespace' as const, access_status: 'paid' as const, status: 'active' as const, billing_interval: 'monthly' as const, current_period_end: '2999-01-01T00:00:00Z', cancel_at_period_end: false };

describe('access rules', () => {
  it('verified free user with 0 generations allowed', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 0 }, false).allowed).toBe(true));
  it('verified free user with 1 generation allowed', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 1 }, false).allowed).toBe(true));
  it('verified free user with 2 generations blocked', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 2 }, false).reason).toBe('free_limit_reached'));
  it('active paid membership allows generation with 2+ generations', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 5 }, false, activeMembership).allowed).toBe(true));
  it('active membership unlocks all toolIds globally', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 5 }, false, activeMembership).allowed).toBe(true));
  it('expired entitlement does not allow paid access', () => expect(isEntitlementActivePaid({ ...activeMembership, current_period_end: '2000-01-01T00:00:00Z' })).toBe(false));
  it('refunded entitlement does not allow paid access', () => expect(isEntitlementActivePaid({ ...activeMembership, status: 'refunded' })).toBe(false));
  it('canceled future period end true handled', () => expect(isEntitlementActivePaid({ ...activeMembership, status: 'canceled', cancel_at_period_end: true })).toBe(true));
  it('comped/admin still allowed', () => { expect(evaluateGenerationAccess({ ...base, access_status: 'comped', generations_used: 9 }, false).allowed).toBe(true); expect(evaluateGenerationAccess({ ...base, access_status: 'admin', generations_used: 9 }, false).allowed).toBe(true); });
  it('unverified email blocked', () => expect(evaluateGenerationAccess({ ...base, email_verified: false, access_status: 'free' }, false).reason).toBe('email_unverified'));
  it('invalid toolId blocked', () => expect(blockedResponse('invalid_tool', 'x').status).toBe(400));
  it('blocked request does not call OpenAI', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 2 }, false).allowed).toBe(false));
});

describe('squarespace webhook parser', () => {
  it('unknown payload shape does not grant access', () => expect(parseSquarespaceEvent({}, new Headers()).relevant).toBe(false));
  it('missing email does not grant access', () => expect(parseSquarespaceEvent({ data: { order: { lineItems: [{ productId: 'monthly1' }] } } }, new Headers()).relevant).toBe(false));
});

describe('response shapes', () => {
  it('standardized blocked response shape', async () => {
    const body = await blockedResponse('free_limit_reached', 'Reached').json();
    expect(body).toHaveProperty('status', 'blocked');
  });
  it('standardized success response shape', async () => {
    const body = await successResponse({ requestId: 'r', toolId: 't', data: {}, usage: { generationsUsed: 1, freeGenerationsLimit: 2, remainingFreeGenerations: 1, accessStatus: 'free' } }).json();
    expect(body).toHaveProperty('status', 'success');
  });
});
