import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { runGenerationMock, checkRateLimitMock, getBackendSessionDetailsMock, maybeSingleMock, updateEqMock, logGenerationEventMock, reserveMemberMock, finalizeMemberMock, releaseMemberMock } = vi.hoisted(() => ({
  runGenerationMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getBackendSessionDetailsMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  updateEqMock: vi.fn(),
  logGenerationEventMock: vi.fn(), reserveMemberMock: vi.fn(), finalizeMemberMock: vi.fn(), releaseMemberMock: vi.fn()
}));

vi.mock('@/lib/openai/generate', () => ({ runGeneration: runGenerationMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', getBackendSessionDetails: getBackendSessionDetailsMock }));
vi.mock('@/lib/usage/events', () => ({ logGenerationEvent: logGenerationEventMock }));
vi.mock('@/lib/usage/member-monthly', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/usage/member-monthly')>()), reserveMemberMonthlyGeneration: reserveMemberMock, finalizeMemberMonthlyGeneration: finalizeMemberMock, releaseMemberMonthlyGeneration: releaseMemberMock }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: () => ({ eq: updateEqMock })
    })
  })
}));

import { POST } from '@/app/api/generate/route';

const validInput = { outputType: 'resume_summary', currentLanguage: 'I lead community health programs and evaluation work across partners with measurable planning and delivery outcomes.', currentWork: 'public_health_programs', desiredDirection: 'leadership_role', emphasis: ['leadership_decision_making'], professionalContext: 'balanced_broadly_accessible' };
const validOutput = {
  careerPositioningSummary: 'summary',
  transferableValueMap: [{ experience: 'a', transferableValue: 'b', whereItApplies: 'c' }],
  experienceReframe: [{ currentFraming: 'a', strongerPositioning: 'b', whyItWorks: 'c' }],
  roleAndOpportunityFit: [{ potentialDirection: 'a', whyItFits: 'b', howToPositionExperience: 'c', gapOrCaution: 'd' }],
  talkingPoints: { shortVersion: 'a', thirtySecondVersion: 'b', interviewReadyVersion: 'c' },
  suggestedNextStep: ['x']
};

beforeEach(() => {
  vi.clearAllMocks();
  getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
  maybeSingleMock.mockResolvedValue({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 0 } });
  checkRateLimitMock.mockResolvedValue({ limited: false });
  runGenerationMock.mockResolvedValue({ outputText: JSON.stringify(validOutput) });
  updateEqMock.mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: 'u1' }], error: null }) });
  logGenerationEventMock.mockResolvedValue(undefined);
  const monthlyUsage = { generationsUsed: 100, generationsLimit: 100, remainingGenerations: 0, periodStart: '2026-07-01T05:00:00.000Z', periodEnd: '2026-08-01T05:00:00.000Z', resetsAt: '2026-08-01T05:00:00.000Z' };
  reserveMemberMock.mockResolvedValue({ reserved: true, usage: { ...monthlyUsage, generationsUsed: 100, remainingGenerations: 0 } });
  finalizeMemberMock.mockResolvedValue(monthlyUsage);
  releaseMemberMock.mockResolvedValue(undefined);
});

const makeReq = (body: unknown) => new NextRequest('http://localhost/api/generate', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('generate route career-positioning', () => {
  it('successful generation increments usage from 0 to 1', async () => {
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(updateEqMock).toHaveBeenCalledWith('id', 'u1');
    expect(body.usage.generationsUsed).toBe(1);
    expect(body.usage.remainingFreeGenerations).toBe(1);
  });

  it('second successful generation increments to 2', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 1 } });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.usage.generationsUsed).toBe(2);
    expect(body.usage.remainingFreeGenerations).toBe(0);
  });

  it('third generation is blocked before OpenAI', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 2 } });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(403);
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it('failed generation does not increment usage', async () => {
    runGenerationMock.mockRejectedValueOnce(new Error('openai down'));
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(500);
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it('invalid structured output does not increment usage', async () => {
    runGenerationMock.mockResolvedValueOnce({ outputText: JSON.stringify({ careerPositioningSummary: 'x' }) });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(502);
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it('blocked request does not increment usage', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: false, access_status: 'free', access_expires_at: null, generations_used: 0 } });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(403);
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it('usage update failure returns safe error', async () => {
    updateEqMock.mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ data: [{ id: 'u1' }], error: { code: 'db', message: 'write failed' } }) });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.reason).toBe('generation_failed');
  });

  it('zero-row usage update returns safe error', async () => {
    updateEqMock.mockReturnValueOnce({ select: vi.fn().mockResolvedValue({ data: [], error: null }) });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(500);
  });

  it('usage is global by profile, not tool', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 1 } });
    runGenerationMock.mockResolvedValueOnce({ outputText: JSON.stringify({
      strategicRewrite: 'rewritten',
      whatChangedAndWhy: ['clearer'],
      intentPreservationCheck: 'kept intent',
      termsToReconsider: [{ originalWording: 'x', whyReconsider: 'y', suggestedFraming: 'z' }],
      strongerAlternativePhrases: ['alt'],
      messageReadinessScore: { rating: 'Strong', clarity: 'a', audienceFit: 'b', concreteOutcomes: 'c', substancePreserved: 'd' }
    }) });
    const res = await POST(makeReq({ toolId: 'strategic-messaging', input: { message: 'x', audience: 'funders', mode: 'standard' } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.usage.generationsUsed).toBe(2);
  });
});


describe('member monthly allowance integration', () => {
  it('allows an active paid member to complete generation 100 and returns finalized usage', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'paid', access_expires_at: null, generations_used: 2 } });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(reserveMemberMock).toHaveBeenCalledOnce();
    expect(finalizeMemberMock).toHaveBeenCalledOnce();
    expect(body.memberMonthlyUsage).toMatchObject({ generationsUsed: 100, remainingGenerations: 0 });
    expect(updateEqMock).not.toHaveBeenCalled();
  });

  it('blocks the next active member request before OpenAI with neutral member state', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'comped', access_expires_at: null, generations_used: 2 } });
    reserveMemberMock.mockResolvedValueOnce({ reserved: false, usage: { generationsUsed: 100, generationsLimit: 100, remainingGenerations: 0, periodStart: '2026-07-01T05:00:00.000Z', periodEnd: '2026-08-01T05:00:00.000Z', resetsAt: '2026-08-01T05:00:00.000Z' } });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body).toMatchObject({ reason: 'member_monthly_limit_reached', memberMonthlyUsage: { generationsUsed: 100, generationsLimit: 100, remainingGenerations: 0 }, usage: { accessStatus: 'comped' }, paywall: { show: false, ctaLabel: null, ctaUrl: null } });
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it('releases a paid member reservation on provider failure and exempts administrators', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'paid', access_expires_at: null, generations_used: 2 } });
    runGenerationMock.mockRejectedValueOnce(new Error('provider down'));
    expect((await POST(makeReq({ toolId: 'career-positioning', input: validInput }))).status).toBe(500);
    expect(releaseMemberMock).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1' }, failureReason: null });
    maybeSingleMock.mockResolvedValue({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'admin', access_expires_at: null, generations_used: 2 } });
    checkRateLimitMock.mockResolvedValue({ limited: false });
    runGenerationMock.mockResolvedValue({ outputText: JSON.stringify(validOutput) });
    logGenerationEventMock.mockResolvedValue(undefined);
    const body = await (await POST(makeReq({ toolId: 'career-positioning', input: validInput }))).json();
    expect(body.memberMonthlyUsage).toBeNull();
    expect(reserveMemberMock).not.toHaveBeenCalled();
  });
});
