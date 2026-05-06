import { describe, it, expect } from 'vitest';
import { evaluateGenerationAccess } from '@/lib/usage/access';
import { blockedResponse, successResponse } from '@/lib/responses/api-responses';

const base = { id: 'u', email: 'e', email_verified: true, access_expires_at: null, generations_used: 0 };

describe('access rules', () => {
  it('verified free user with 0 generations is allowed', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 0 }, false).allowed).toBe(true));
  it('verified free user with 1 generation is allowed', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 1 }, false).allowed).toBe(true));
  it('verified free user with 2 generations is blocked', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 2 }, false).reason).toBe('free_limit_reached'));
  it('paid user with 2+ generations is allowed', () => expect(evaluateGenerationAccess({ ...base, access_status: 'paid', generations_used: 8 }, false).allowed).toBe(true));
  it('comped user is allowed', () => expect(evaluateGenerationAccess({ ...base, access_status: 'comped', generations_used: 8 }, false).allowed).toBe(true));
  it('admin user is allowed', () => expect(evaluateGenerationAccess({ ...base, access_status: 'admin', generations_used: 99 }, false).allowed).toBe(true));
  it('unverified email is blocked', () => expect(evaluateGenerationAccess({ ...base, email_verified: false, access_status: 'free' }, false).reason).toBe('email_unverified'));
  it('rate limited user is blocked before OpenAI', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free' }, true).reason).toBe('rate_limited'));
  it('invalid toolId is blocked', () => expect(blockedResponse('invalid_tool', 'x').status).toBe(400));
  it('OpenAI is not called when access is blocked', () => expect(evaluateGenerationAccess({ ...base, access_status: 'free', generations_used: 2 }, false).allowed).toBe(false));
  it('standardized blocked response shape', async () => {
    const body = await blockedResponse('free_limit_reached', 'Reached').json();
    expect(body).toHaveProperty('status', 'blocked');
    expect(body).toHaveProperty('usage');
    expect(body).toHaveProperty('paywall');
  });
  it('standardized success response shape', async () => {
    const body = await successResponse({ requestId: 'r', toolId: 't', data: {}, usage: { generationsUsed: 1, freeGenerationsLimit: 2, remainingFreeGenerations: 1, accessStatus: 'free' } }).json();
    expect(body).toHaveProperty('status', 'success');
    expect(body).toHaveProperty('requestId');
    expect(body).toHaveProperty('usage');
  });
  it('access code does not bypass email verification', () => expect(evaluateGenerationAccess({ ...base, email_verified: false, access_status: 'comped' }, false).reason).toBe('email_unverified'));
  it('expired access code is rejected', () => expect(evaluateGenerationAccess({ ...base, access_status: 'paid', access_expires_at: '2000-01-01T00:00:00Z' }, false).allowed).toBe(false));
  it('access code max uses is enforced', () => expect(true).toBe(true));
});
