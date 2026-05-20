import { describe, expect, it } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { preflightResponse, withCors } from '@/lib/security/cors';

describe('CORS credentialed requests', () => {
  it('allows configured career positioning origin with credentials', () => {
    process.env.ALLOWED_ORIGINS = 'https://career-positioning.americanhealthequity.org';
    const req = new NextRequest('https://api.americanhealthequity.org/api/me', { headers: { origin: 'https://career-positioning.americanhealthequity.org' } });
    const res = withCors(req, NextResponse.json({ ok: true }));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://career-positioning.americanhealthequity.org');
    expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
  });

  it('rejects arbitrary preflight origins', () => {
    process.env.ALLOWED_ORIGINS = 'https://career-positioning.americanhealthequity.org';
    const req = new NextRequest('https://api.americanhealthequity.org/api/generate', { method: 'OPTIONS', headers: { origin: 'https://evil.example.com' } });
    const res = preflightResponse(req);
    expect(res.status).toBe(403);
  });
});
