import { describe, it, expect, vi } from 'vitest';
import { buildSquarespaceAuthorizeUrl, verifySquarespaceOAuthState, getSquarespaceAccessToken } from '@/lib/squarespace/oauth';
import { findMembershipLineItem } from '@/lib/squarespace/membership-products';

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
