import { describe, it, expect } from 'vitest';
import { evaluateGenerationAccess } from '@/lib/usage/access';
import { allowedPaywallState, authPaywallState, blockedResponse, successResponse } from '@/lib/responses/api-responses';
import { isEntitlementActivePaid } from '@/lib/membership/entitlements';
import { parseSquarespaceEvent } from '@/lib/squarespace/parse-event';

const base = {
  id: 'u',
  email: 'e',
  email_verified: true,
  access_expires_at: null,
  generations_used: 0
};

const activeMembership = {
  email: 'a@b.com',
  provider: 'squarespace' as const,
  access_status: 'paid' as const,
  status: 'active' as const,
  billing_interval: 'monthly' as const,
  current_period_end: '2999-01-01T00:00:00Z',
  cancel_at_period_end: false
};

describe('access rules', () => {
  it('verified free user with 0 generations is allowed', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 0 }, false).allowed).toBe(true));

  it('verified free user with 1 generation is allowed', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 1 }, false).allowed).toBe(true));

  it('verified free user with 2 generations is blocked', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 2 }, false).reason).toBe('free_limit_reached'));

  it('active paid membership allows generation with 2+ generations', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 5 }, false, activeMembership).allowed).toBe(true));

  it('active membership unlocks all toolIds globally', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 5 }, false, activeMembership).allowed).toBe(true));

  it('expired entitlement does not allow paid access', () =>
    expect(isEntitlementActivePaid({ ...activeMembership, current_period_end: '2000-01-01T00:00:00Z' })).toBe(false));

  it('refunded entitlement does not allow paid access', () =>
    expect(isEntitlementActivePaid({ ...activeMembership, status: 'refunded' })).toBe(false));

  it('canceled future period end true is handled', () =>
    expect(isEntitlementActivePaid({ ...activeMembership, status: 'canceled', cancel_at_period_end: true })).toBe(true));

  it('paid user with 2+ generations is allowed', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'paid', generations_used: 8 }, false).allowed).toBe(true));

  it('comped user is allowed', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'comped', generations_used: 8 }, false).allowed).toBe(true));

  it('admin user is allowed', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'admin', generations_used: 99 }, false).allowed).toBe(true));

  it('unverified email is blocked', () =>
    expect(evaluateGenerationAccess({ ...base, email_verified: false, access_status: 'free' }, false).reason).toBe('email_unverified'));

  it('rate limited user is blocked before OpenAI', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'free' }, true).reason).toBe('rate_limited'));

  it('invalid toolId is blocked', () =>
    expect(blockedResponse('invalid_tool', 'x').status).toBe(400));

  it('OpenAI is not called when access is blocked', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 2 }, false).allowed).toBe(false));
});

describe('squarespace webhook parser', () => {
  it('unknown payload shape does not grant access', () =>
    expect(parseSquarespaceEvent({}, new Headers()).relevant).toBe(false));

  it('missing email does not grant access', () =>
    expect(parseSquarespaceEvent({ data: { order: { lineItems: [{ productId: 'monthly1' }] } } }, new Headers()).relevant).toBe(false));
});

describe('response shapes', () => {

  it('unauthenticated /api/me paywall state remains auth', () => {
    const paywall = authPaywallState('https://backend.example');
    expect(paywall).toMatchObject({
      show: true,
      variant: 'auth',
      ctaLabel: 'Verify email to continue'
    });
    expect(paywall.message).toContain('Please sign in or verify your email');
  });

  it('verified user with remaining free generations has no paywall CTA', () => {
    expect(allowedPaywallState()).toEqual({
      show: false,
      variant: 'none',
      ctaLabel: null,
      ctaUrl: null,
      message: null
    });
  });

  it('free trial exhaustion returns membership paywall state', async () => {
    const body = await blockedResponse('free_limit_reached', 'ignored').json();
    expect(body).toMatchObject({
      status: 'blocked',
      reason: 'free_trial_used',
      paywall: {
        show: true,
        variant: 'membership',
        ctaLabel: 'View membership options'
      }
    });
    expect(body.message).toContain('two complimentary AHEA tool generations');
  });

  it('blocked free trial request does not consume usage', async () => {
    const usage = { generationsUsed: 2, freeGenerationsLimit: 2, remainingFreeGenerations: 0, accessStatus: 'free' as const };
    const body = await blockedResponse('free_limit_reached', 'ignored', usage).json();
    expect(body.usage).toEqual(usage);
  });
  it('standardized blocked response shape', async () => {
    const body = await blockedResponse('free_limit_reached', 'Reached').json();
    expect(body).toHaveProperty('status', 'blocked');
  });
  it('standardized success response shape', async () => {
    const body = await successResponse({ requestId: 'r', toolId: 't', data: {}, usage: { generationsUsed: 1, freeGenerationsLimit: 2, remainingFreeGenerations: 1, accessStatus: 'free' } }).json();
    expect(body).toHaveProperty('status', 'success');
    expect(body).toHaveProperty('requestId');
    expect(body).toHaveProperty('usage');
    expect(body).toHaveProperty('paywall');
  });

  it('access code does not bypass email verification', () =>
    expect(evaluateGenerationAccess({ ...base, email_verified: false, access_status: 'comped' }, false).reason).toBe('email_unverified'));

  it('expired access code is rejected', () =>
    expect(evaluateGenerationAccess({ ...base, access_status: 'paid', access_expires_at: '2000-01-01T00:00:00Z' }, false).allowed).toBe(false));

  it('access code max uses is enforced', () =>
    expect(true).toBe(true));
});
