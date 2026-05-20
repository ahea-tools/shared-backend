import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  exchangeCodeForSessionMock: vi.fn(),
  upsertMock: vi.fn(),
  setBackendSessionOnResponseMock: vi.fn(),
  detectRoleMock: vi.fn()
}));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: h.checkRateLimitMock }));
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      signInWithOtp: h.signInWithOtpMock,
      verifyOtp: h.verifyOtpMock,
      exchangeCodeForSession: h.exchangeCodeForSessionMock
    },
    from: () => ({ upsert: h.upsertMock })
  }),
  detectConfiguredSupabaseRole: h.detectRoleMock
}));
vi.mock('@/lib/auth/session', () => ({ BACKEND_SESSION_COOKIE_NAME: 'ahea_session', setBackendSessionOnResponse: h.setBackendSessionOnResponseMock }));

import { POST as startPOST } from '@/app/api/auth/start/route';
import { GET as callbackGET } from '@/app/api/auth/callback/route';

function postReq(body: unknown) {
  return new NextRequest('https://api.americanhealthequity.org/api/auth/start', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json', origin: 'https://career-positioning.americanhealthequity.org' } });
}

describe('auth start + callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BACKEND_COOKIE_SECRET = 'x'.repeat(64);
    process.env.AUTH_CALLBACK_URL = 'https://api.americanhealthequity.org/api/auth/callback';
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk';
    process.env.SUPABASE_JWT_SECRET = 'jwt';
    process.env.UPSTASH_REDIS_REST_URL = 'https://upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'tok';
    process.env.OPENAI_API_KEY = 'k';
    process.env.ALLOWED_ORIGINS = 'https://career-positioning.americanhealthequity.org';

    h.checkRateLimitMock.mockResolvedValue({ limited: false });
    h.signInWithOtpMock.mockResolvedValue({ error: null });
    h.detectRoleMock.mockReturnValue('service_role');
    h.upsertMock.mockResolvedValue({ error: null });
  });

  it('rejects invalid email', async () => {
    const res = await startPOST(postReq({ email: 'bad', toolId: 'career-positioning' }));
    expect(res.status).toBe(400);
  });

  it('rejects unknown toolId', async () => {
    const res = await startPOST(postReq({ email: 'u@example.com', toolId: 'nope' }));
    expect(res.status).toBe(400);
  });

  it('accepts career-positioning and sends calm response', async () => {
    const res = await startPOST(postReq({ email: 'u@example.com', toolId: 'career-positioning' }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(h.signInWithOtpMock).toHaveBeenCalledTimes(1);
  });

  it('callback rejects missing state', async () => {
    const res = await callbackGET(new NextRequest('https://api.americanhealthequity.org/api/auth/callback?token_hash=abc&type=signup'));
    expect(res.status).toBe(400);
  });

  it('callback rejects tampered state', async () => {
    const res = await callbackGET(new NextRequest('https://api.americanhealthequity.org/api/auth/callback?state=bad&token_hash=abc&type=signup'));
    expect(res.status).toBe(400);
  });

  it('callback accepts valid state + token_hash + type=signup', async () => {
    await startPOST(postReq({ email: 'u@example.com', toolId: 'career-positioning' }));
    const redirect = h.signInWithOtpMock.mock.calls[0][0].options.emailRedirectTo as string;
    const state = new URL(redirect).searchParams.get('state');

    h.verifyOtpMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'u@example.com' } }, error: null });

    const res = await callbackGET(new NextRequest(`https://api.americanhealthequity.org/api/auth/callback?state=${encodeURIComponent(state!)}&token_hash=abc&type=signup`));

    expect(res.status).toBe(307);
    expect(h.verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'abc', type: 'signup' });

    expect(h.setBackendSessionOnResponseMock).toHaveBeenCalledWith(expect.anything(), 'u1', 'u@example.com');

  });

  it('callback accepts valid state + token_hash + type=magiclink', async () => {
    await startPOST(postReq({ email: 'u@example.com', toolId: 'career-positioning' }));
    const redirect = h.signInWithOtpMock.mock.calls[0][0].options.emailRedirectTo as string;
    const state = new URL(redirect).searchParams.get('state');

    h.verifyOtpMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'u@example.com' } }, error: null });

    const res = await callbackGET(new NextRequest(`https://api.americanhealthequity.org/api/auth/callback?state=${encodeURIComponent(state!)}&token_hash=abc&type=magiclink`));

    expect(res.status).toBe(307);
    expect(h.verifyOtpMock).toHaveBeenCalledWith({ token_hash: 'abc', type: 'magiclink' });
  });

  it('callback rejects unsupported type', async () => {
    await startPOST(postReq({ email: 'u@example.com', toolId: 'career-positioning' }));
    const redirect = h.signInWithOtpMock.mock.calls[0][0].options.emailRedirectTo as string;
    const state = new URL(redirect).searchParams.get('state');

    const res = await callbackGET(new NextRequest(`https://api.americanhealthequity.org/api/auth/callback?state=${encodeURIComponent(state!)}&token_hash=abc&type=hacked`));

    expect(res.status).toBe(400);
    expect(h.verifyOtpMock).not.toHaveBeenCalled();
  });

  it('callback rejects state-only because it cannot verify identity', async () => {
    await startPOST(postReq({ email: 'u@example.com', toolId: 'career-positioning' }));
    const redirect = h.signInWithOtpMock.mock.calls[0][0].options.emailRedirectTo as string;
    const state = new URL(redirect).searchParams.get('state');

    const res = await callbackGET(new NextRequest(`https://api.americanhealthequity.org/api/auth/callback?state=${encodeURIComponent(state!)}`));

    expect(res.status).toBe(400);
  });

  it('successful callback redirects to approved career URL and never uses arbitrary redirect URL', async () => {
    await startPOST(postReq({ email: 'u@example.com', toolId: 'career-positioning' }));
    const redirect = h.signInWithOtpMock.mock.calls[0][0].options.emailRedirectTo as string;
    const state = new URL(redirect).searchParams.get('state');
    h.verifyOtpMock.mockResolvedValue({ data: { user: { id: 'u1', email: 'u@example.com' } }, error: null });

    const res = await callbackGET(new NextRequest(`https://api.americanhealthequity.org/api/auth/callback?state=${encodeURIComponent(state!)}&token_hash=abc&type=signup&redirect_to=https://evil.example.com`));
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://career-positioning.americanhealthequity.org/');
  });
});
