import { NextRequest, NextResponse } from 'next/server';
import { buildSquarespaceAuthorizeUrl } from '@/lib/squarespace/oauth';

export async function GET(req: NextRequest) {
  if (process.env.ADMIN_SETUP_ENABLED !== 'true') return NextResponse.json({ success: false, message: 'Setup disabled.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const adminSecret = req.nextUrl.searchParams.get('admin_secret');
  if (!adminSecret || adminSecret !== process.env.SQUARESPACE_SYNC_ADMIN_SECRET) {
    return NextResponse.json({ success: false, message: 'Invalid admin secret.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const authorize = buildSquarespaceAuthorizeUrl();
  if (!authorize.ok) return NextResponse.json({ success: false, message: authorize.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.redirect(authorize.url, { headers: { 'Cache-Control': 'no-store' } });
}
