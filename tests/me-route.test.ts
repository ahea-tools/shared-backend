import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ getBackendSessionDetailsMock: vi.fn(), maybeSingleMock: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', getBackendSessionDetails: h.getBackendSessionDetailsMock }));
vi.mock('@/lib/supabase/server', () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.maybeSingleMock }) }) }) }) }));
import { GET } from '@/app/api/me/route';

describe('/api/me session recognition', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.ALLOWED_ORIGINS = 'https://career-positioning.americanhealthequity.org'; });

  it('valid verified session returns usage/access values', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
    h.maybeSingleMock.mockResolvedValue({ data: { email_verified: true, generations_used: 1, access_status: 'free' } });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me', { headers: { origin: 'https://career-positioning.americanhealthequity.org' } }))).json();
    expect(body.isAuthenticated).toBe(true); expect(body.isVerified).toBe(true); expect(body.generationsUsed).toBe(1);
  });

  it('missing cookie returns unauthenticated safe response', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: null, failureReason: 'missing_cookie' });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me'))).json();
    expect(body.isAuthenticated).toBe(false);
    expect(body.accessStatus).toBe('free');
  });

  it('invalid cookie returns unauthenticated safe response', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: null, failureReason: 'bad_signature' });
    const body = await (await GET(new NextRequest('https://api.americanhealthequity.org/api/me'))).json();
    expect(body.isAuthenticated).toBe(false);
  });

  it('access evaluator failure is handled safely', async () => {
    h.getBackendSessionDetailsMock.mockRejectedValue(new Error('session boom'));
    const res = await GET(new NextRequest('https://api.americanhealthequity.org/api/me'));
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.accessStatus).toBe('error');
  });
});
