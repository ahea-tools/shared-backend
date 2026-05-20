import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  getBackendSessionDetailsMock: vi.fn(),
  maybeSingleMock: vi.fn()
}));

vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', getBackendSessionDetails: h.getBackendSessionDetailsMock }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: h.maybeSingleMock }) }) }) })
}));

import { GET } from '@/app/api/me/route';

describe('/api/me session recognition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ALLOWED_ORIGINS = 'https://career-positioning.americanhealthequity.org';
  });

  it('recognizes callback session cookie payload', async () => {
    h.getBackendSessionDetailsMock.mockResolvedValue({ session: { userId: 'u1', email: 'u@example.com', iat: Date.now() }, failureReason: null });
    h.maybeSingleMock.mockResolvedValue({ data: { email: 'u@example.com', email_verified: true, generations_used: 0, access_status: 'free' } });

    const req = new NextRequest('https://api.americanhealthequity.org/api/me', { headers: { origin: 'https://career-positioning.americanhealthequity.org' } });
    const res = await GET(req);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.verified).toBe(true);
  });
});
