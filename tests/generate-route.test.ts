import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { runGenerationMock, checkRateLimitMock, getBackendSessionMock, getBackendSessionDetailsMock, maybeSingleMock, updateEqMock } = vi.hoisted(() => ({
  runGenerationMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  getBackendSessionMock: vi.fn(),
  getBackendSessionDetailsMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  updateEqMock: vi.fn()
}));

vi.mock('@/lib/openai/generate', () => ({ runGeneration: runGenerationMock }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: checkRateLimitMock }));
vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', getBackendSession: getBackendSessionMock, getBackendSessionDetails: getBackendSessionDetailsMock }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: () => ({ eq: updateEqMock })
    })
  })
}));

import { POST } from '@/app/api/generate/route';

const validInput = {
  outputType: 'resume_summary',
  currentLanguage: 'I lead community health programs and evaluation work across partners with measurable planning and delivery outcomes.',
  currentWork: 'public_health_programs',
  desiredDirection: 'leadership_role',
  emphasis: ['leadership_decision_making'],
  professionalContext: 'balanced_broadly_accessible'
};

beforeEach(() => {
  vi.clearAllMocks();
  getBackendSessionMock.mockResolvedValue({ userId: 'u1', email: 'u@example.com' });
  getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
  maybeSingleMock.mockResolvedValue({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 0 } });
  checkRateLimitMock.mockResolvedValue({ limited: false });
  runGenerationMock.mockResolvedValue({ outputText: JSON.stringify({
    careerPositioningSummary: 'summary',
    transferableValueMap: [{ experience: 'a', transferableValue: 'b', whereItApplies: 'c' },{ experience: 'a2', transferableValue: 'b2', whereItApplies: 'c2' },{ experience: 'a3', transferableValue: 'b3', whereItApplies: 'c3' }],
    experienceReframe: [{ currentFraming: 'a', strongerPositioning: 'b', whyItWorks: 'c' },{ currentFraming: 'a2', strongerPositioning: 'b2', whyItWorks: 'c2' },{ currentFraming: 'a3', strongerPositioning: 'b3', whyItWorks: 'c3' }],
    roleAndOpportunityFit: [{ potentialDirection: 'a', whyItFits: 'b', howToPositionExperience: 'c', gapOrCaution: 'd' },{ potentialDirection: 'a2', whyItFits: 'b2', howToPositionExperience: 'c2', gapOrCaution: 'd2' },{ potentialDirection: 'a3', whyItFits: 'b3', howToPositionExperience: 'c3', gapOrCaution: 'd3' }],
    talkingPoints: { shortVersion: 'a', thirtySecondVersion: 'b', interviewReadyVersion: 'c' },
    suggestedNextStep: ['x']
  }) });
});

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/generate', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
}

describe('generate route career-positioning', () => {
  it('accepts registered toolId and runs one generation', async () => {
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(200);
    expect(runGenerationMock).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid toolId', async () => {
    const res = await POST(makeReq({ toolId: 'nope', input: validInput }));
    expect(res.status).toBe(400);
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it('rejects short currentLanguage before OpenAI', async () => {
    const res = await POST(makeReq({ toolId: 'career-positioning', input: { ...validInput, currentLanguage: 'too short' } }));
    expect(res.status).toBe(400);
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it('rejects emphasis with zero or more than 3 selections', async () => {
    const zero = await POST(makeReq({ toolId: 'career-positioning', input: { ...validInput, emphasis: [] } }));
    const many = await POST(makeReq({ toolId: 'career-positioning', input: { ...validInput, emphasis: ['leadership_decision_making','transferable_skills','program_project_results','community_partnership_trust'] } }));
    expect(zero.status).toBe(400);
    expect(many.status).toBe(400);
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it('blocked and rate-limited users do not call OpenAI', async () => {
    maybeSingleMock.mockResolvedValueOnce({ data: { id: 'u1', email: 'u@example.com', email_verified: true, access_status: 'free', access_expires_at: null, generations_used: 2 } });
    const blocked = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    checkRateLimitMock.mockResolvedValueOnce({ limited: true });
    const rateLimited = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(blocked.status).toBe(403);
    expect(rateLimited.status).toBe(403);
    expect(runGenerationMock).not.toHaveBeenCalled();
  });

  it('invalid structured output fails validation', async () => {
    runGenerationMock.mockResolvedValueOnce({ outputText: JSON.stringify({ careerPositioningSummary: 'x' }) });
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(500);
  });

  it('increments usage for allowed free users', async () => {
    const res = await POST(makeReq({ toolId: 'career-positioning', input: validInput }));
    expect(res.status).toBe(200);
    expect(updateEqMock).toHaveBeenCalledTimes(1);
  });
});
