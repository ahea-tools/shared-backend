import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ getBackendSessionDetailsMock: vi.fn(), maybeSingleMock: vi.fn(), getMemberUsageMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', getBackendSessionDetails: h.getBackendSessionDetailsMock }));
vi.mock('@/lib/usage/member-monthly', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/usage/member-monthly')>()), getMemberMonthlyGenerationUsage: h.getMemberUsageMock }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.maybeSingleMock }) }) }) }) }));
import { GET } from '@/app/api/me/route';

describe('/api/me session recognition', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.ALLOWED_ORIGINS = 'https://career-positioning.americanhealthequity.org'; });

  it('returns expected usage fields after first generation', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
    h.maybeSingleMock.mockResolvedValue({ data: { email_verified: true, generations_used: 1, access_status: 'free' } });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me', { headers: { origin: 'https://career-positioning.americanhealthequity.org' } }))).json();
    expect(body.authenticated).toBe(true);
    expect(body.verified).toBe(true);
    expect(body.generationsUsed).toBe(1);
    expect(body.remainingFreeGenerations).toBe(1);
  });

  it('returns expected usage fields after second generation', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
    h.maybeSingleMock.mockResolvedValue({ data: { email_verified: true, generations_used: 2, access_status: 'free' } });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me'))).json();
    expect(body.generationsUsed).toBe(2);
    expect(body.remainingFreeGenerations).toBe(0);
  });


  it('expired paid access is reported as free effective access with raw status preserved', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
    h.maybeSingleMock.mockResolvedValue({ data: { email_verified: true, generations_used: 1, access_status: 'paid', access_expires_at: '2000-01-01T00:00:00Z' } });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me'))).json();
    expect(body.accessStatus).toBe('free');
    expect(body.usage.accessStatus).toBe('free');
    expect(body.rawAccessStatus).toBe('paid');
    expect(body.remainingFreeGenerations).toBe(1);
  });

  it('missing cookie returns unauthenticated safe response', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: null, failureReason: 'missing_cookie' });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me'))).json();
    expect(body.isAuthenticated).toBe(false);
    expect(body.accessStatus).toBe('free');
  });
  it('returns accurate monthly usage and availability for active paid members', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1' }, failureReason: null });
    h.maybeSingleMock.mockResolvedValue({ data: { email_verified: true, generations_used: 2, access_status: 'paid', access_expires_at: null } });
    h.getMemberUsageMock.mockResolvedValue({ generationsUsed: 99, generationsLimit: 100, remainingGenerations: 1, periodStart: '2026-07-01T05:00:00.000Z', periodEnd: '2026-08-01T05:00:00.000Z', resetsAt: '2026-08-01T05:00:00.000Z' });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me'))).json();
    expect(body.memberMonthlyUsage).toMatchObject({ generationsUsed: 99, remainingGenerations: 1 });
    expect(body.generationAvailable).toBe(true);
    expect(body.generationBlockReason).toBeNull();
  });

  it('returns null member usage for administrators', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1' }, failureReason: null });
    h.maybeSingleMock.mockResolvedValue({ data: { email_verified: true, generations_used: 2, access_status: 'admin', access_expires_at: null } });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me'))).json();
    expect(body.memberMonthlyUsage).toBeNull();
    expect(h.getMemberUsageMock).not.toHaveBeenCalled();
  });

});
