import { NextRequest, NextResponse } from 'next/server';
import { exchangeSquarespaceAuthorizationCode, verifySquarespaceOAuthState } from '@/lib/squarespace/oauth';

function html(content: string) { return new NextResponse(`<!doctype html><html><body><pre>${content}</pre></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }); }

export async function GET(req: NextRequest) {
  if (process.env.ADMIN_SETUP_ENABLED !== 'true') return NextResponse.json({ success: false, message: 'Setup disabled.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const error = req.nextUrl.searchParams.get('error');
  if (error === 'access_denied') return html('OAuth access was denied. Retry /api/oauth/squarespace/start with admin_secret.');
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  if (!code || !verifySquarespaceOAuthState(state)) return NextResponse.json({ success: false, message: 'Invalid OAuth callback state or code.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  const exchanged = await exchangeSquarespaceAuthorizationCode(code);
  if (!exchanged.ok) return NextResponse.json({ success: false, message: exchanged.message, squarespaceStatus: exchanged.status, squarespaceMessage: exchanged.squarespaceMessage }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  const expiresAt = exchanged.data?.expires_in ? new Date(Date.now() + Number(exchanged.data.expires_in) * 1000).toISOString() : '';
  return html([
    `SQUARESPACE_OAUTH_ACCESS_TOKEN=${exchanged.data?.access_token ?? ''}`,
    `SQUARESPACE_OAUTH_REFRESH_TOKEN=${exchanged.data?.refresh_token ?? ''}`,
    `SQUARESPACE_OAUTH_ACCESS_TOKEN_EXPIRES_AT=${expiresAt}`,
    '',
    'Copy these values into Vercel immediately.',
    'Access tokens expire after 30 minutes.',
    'Refresh tokens are single-use, rotate on use, and expire after 7 days.',
    'Do not share, log, or commit these values.',
    'After copying into Vercel, redeploy and create webhook immediately.',
    'Disable ADMIN_SETUP_ENABLED after setup.'
  ].join('\n'));
}
