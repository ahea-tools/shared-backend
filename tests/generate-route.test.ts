import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { runGenerationMock, checkRateLimitMock, getBackendSessionMock, getBackendSessionDetailsMock, maybeSingleMock, updateEqMock, logGenerationEventMock } = vi.hoisted(() => ({
  runGenerationMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getBackendSessionMock: vi.fn(),
  getBackendSessionDetailsMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  updateEqMock: vi.fn(),
  logGenerationEventMock: vi.fn()
}));

vi.mock('@/lib/openai/generate', () => ({ runGeneration: runGenerationMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', getBackendSession: getBackendSessionMock, getBackendSessionDetails: getBackendSessionDetailsMock }));
vi.mock('@/lib/usage/events', () => ({ logGenerationEvent: logGenerationEventMock }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }), update: () => ({ eq: updateEqMock }) }) }) }));

import { POST } from '@/app/api/generate/route';

const validInput = { outputType: 'resume_summary', currentLanguage: 'I lead community health programs and evaluation work across partners with measurable planning and delivery outcomes.', currentWork: 'public_health_programs', desiredDirection: 'leadership_role', emphasis: ['leadership_decision_making'], professionalContext: 'balanced_broadly_accessible' };
const validOutput = { careerPositioningSummary: 'summary', transferableValueMap: [{ experience: 'a', transferableValue: 'b', whereItApplies: 'c' }], experienceReframe: [{ currentFraming: 'a', strongerPositioning: 'b', whyItWorks: 'c' }], roleAndOpportunityFit: [{ potentialDirection: 'a', whyItFits: 'b', howToPositionExperience: 'c', gapOrCaution: 'd' }], talkingPoints: { shortVersion: 'a', thirtySecondVersion: 'b', interviewReadyVersion: 'c' }, suggestedNextStep: ['x'] };

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
  updateEqMock.mockResolvedValue({ error: null });
  logGenerationEventMock.mockResolvedValue(undefined);
});

const makeReq = (body: unknown) => new NextRequest('http://localhost/api/generate', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });

describe('generate route career-positioning', () => {
  it('valid request returns 200 with output wrapper and no forbidden wrappers', async () => {
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(runGenerationMock).toHaveBeenCalledTimes(1);
    expect(body.output).toEqual(validOutput);
    expect(body.data).toBeUndefined();
    expect(body.result).toBeUndefined();
    expect(body.generation).toBeUndefined();
    expect(body.content).toBeUndefined();
  });

  it('openai request failure returns safe non-200', async () => {
    runGenerationMock.mockRejectedValueOnce(new Error('openai down'));
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(500);
  });

  it('openai parse failure returns safe non-200', async () => {
    runGenerationMock.mockResolvedValueOnce({ outputText: 'not-json' });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(502);
  });

  it('structured output failure returns safe non-200', async () => {
    runGenerationMock.mockResolvedValueOnce({ outputText: JSON.stringify({ careerPositioningSummary: 'x' }) });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(502);
  });

  it('usage logging failure returns safe non-200', async () => {
    updateEqMock.mockResolvedValueOnce({ error: { message: 'db write failed' } });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body.reason).toBe('generation_failed');
  });

  it('generation event logging failure returns safe non-200', async () => {
    logGenerationEventMock.mockRejectedValueOnce(new Error('insert failed'));
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(500);
  it('usage logging failure returns safe error', async () => {
    updateEqMock.mockResolvedValueOnce({ error: { message: 'db write failed' } });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.reason).toBe('generation_failed');
  });
});
