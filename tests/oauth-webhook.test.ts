import { describe, it, expect, vi } from 'vitest';
import crypto from 'node:crypto';
import { buildSquarespaceAuthorizeUrl, verifySquarespaceOAuthState, getSquarespaceAccessToken } from '@/lib/squarespace/oauth';
import { findMembershipLineItem } from '@/lib/squarespace/membership-products';
import { verifySquarespaceWebhook } from '@/lib/squarespace/verify-webhook';

vi.stubEnv('BACKEND_COOKIE_SECRET', 'x'.repeat(32));

describe('oauth helpers', () => {
  it('builds authorize URL', () => {
    vi.stubEnv('SQUARESPACE_OAUTH_CLIENT_ID', 'cid');
    vi.stubEnv('SQUARESPACE_OAUTH_REDIRECT_URI', 'https://api.americanhealthequity.org/api/oauth/squarespace/callback');
    vi.stubEnv('SQUARESPACE_OAUTH_SCOPES', 'website.orders.read,website.transactions.read');
    const out = buildSquarespaceAuthorizeUrl();
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.url).toContain('login.squarespace.com/api/1/login/oauth/provider/authorize');
      expect(verifySquarespaceOAuthState(out.state)).toBe(true);
    }
  });
  it('invalid state rejected', () => expect(verifySquarespaceOAuthState('bad')).toBe(false));
  it('get token fails safely if missing', () => { vi.stubEnv('SQUARESPACE_OAUTH_ACCESS_TOKEN', ''); expect(getSquarespaceAccessToken().ok).toBe(false); });
});

describe('membership matcher', () => {
  it('prefers id match', () => {
    vi.stubEnv('SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS', 'prod-1');
    vi.stubEnv('SQUARESPACE_MEMBERSHIP_MONTHLY_MATCHERS', 'monthly pass');
    const out = findMembershipLineItem([{ productId: 'prod-1', name: 'anything' }]);
    expect(out?.matchSource).toBe('id');
  });
  it('matcher fallback does not match arbitrary payload', () => {
    vi.stubEnv('SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS', '');
    vi.stubEnv('SQUARESPACE_MEMBERSHIP_MONTHLY_MATCHERS', 'explicit monthly matcher');
    const out = findMembershipLineItem([{ name: 'random thing' }]);
    expect(out).toBeNull();
  });
});

describe('webhook signature verification', () => {
  const secretHex = 'aabbccddeeff00112233445566778899';
  const body = '{"hello":"world"}';
  const validSig = crypto.createHmac('sha256', Buffer.from(secretHex, 'hex')).update(body).digest('hex');

  it('valid signature succeeds when secret is hex-decoded', () => {
    expect(verifySquarespaceWebhook(body, validSig, secretHex).ok).toBe(true);
  });
  it('using same secret as utf8 would fail', () => {
    const utf8Sig = crypto.createHmac('sha256', secretHex).update(body).digest('hex');
    expect(utf8Sig).not.toBe(validSig);
  });
  it('invalid signature fails', () => {
    const res = verifySquarespaceWebhook(body, '00', secretHex);
    expect(res.ok).toBe(false);
  });
  it('missing signature fails', () => {
    const res = verifySquarespaceWebhook(body, null, secretHex);
    expect(res.ok).toBe(false);
  });
  it('header name can be read case-insensitively by route via Headers API', () => {
    const h = new Headers({ 'Squarespace-Signature': validSig });
    expect(h.get('squarespace-signature')).toBe(validSig);
  });
  it('raw body mutation causes failure', () => {
    const res = verifySquarespaceWebhook(body + ' ', validSig, secretHex);
    expect(res.ok).toBe(false);
  });
});
