import crypto from 'node:crypto';

const AUTHORIZE_URL = 'https://login.squarespace.com/api/1/login/oauth/provider/authorize';
const TOKENS_URL = 'https://login.squarespace.com/api/1/login/oauth/provider/tokens';

type ExchangeResult = { ok: true; data: any } | { ok: false; status: number; message: string; squarespaceMessage?: string };

export function buildSquarespaceAuthorizeUrl() {
  const clientId = process.env.SQUARESPACE_OAUTH_CLIENT_ID;
  const redirectUri = process.env.SQUARESPACE_OAUTH_REDIRECT_URI || 'https://api.americanhealthequity.org/api/oauth/squarespace/callback';
  const scope = process.env.SQUARESPACE_OAUTH_SCOPES || 'website.orders.read,website.transactions.read';
  if (!clientId || !redirectUri) return { ok: false as const, message: 'OAuth client configuration is incomplete.' };
  const nonce = crypto.randomUUID();
  const payload = `${nonce}.${Date.now()}`;
  const sig = crypto.createHmac('sha256', process.env.BACKEND_COOKIE_SECRET || '').update(payload).digest('hex');
  const state = Buffer.from(`${payload}.${sig}`).toString('base64url');
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('scope', scope);
  url.searchParams.set('state', state);
  url.searchParams.set('access_type', 'offline');
  return { ok: true as const, url: url.toString(), state };
}

export function verifySquarespaceOAuthState(state: string | null): boolean {
  if (!state) return false;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [nonce, ts, sig] = decoded.split('.');
    if (!nonce || !ts || !sig) return false;
    const payload = `${nonce}.${ts}`;
    const expected = crypto.createHmac('sha256', process.env.BACKEND_COOKIE_SECRET || '').update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

export async function exchangeSquarespaceAuthorizationCode(code: string): Promise<ExchangeResult> {
  const clientId = process.env.SQUARESPACE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SQUARESPACE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.SQUARESPACE_OAUTH_REDIRECT_URI || 'https://api.americanhealthequity.org/api/oauth/squarespace/callback';
  if (!clientId || !clientSecret) return { ok: false, status: 500, message: 'OAuth client credentials are missing.' };
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  const res = await fetch(TOKENS_URL, { method: 'POST', headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'AHEA Shared Backend' }, body });
  if (!res.ok) {
    let squarespaceMessage = '';
    try { squarespaceMessage = JSON.stringify(await res.json()); } catch {}
    return { ok: false, status: res.status, message: 'OAuth token exchange failed.', squarespaceMessage };
  }
  return { ok: true, data: await res.json() };
}

export function getSquarespaceAccessToken(): { ok: true; token: string } | { ok: false; message: string } {
  const token = process.env.SQUARESPACE_OAUTH_ACCESS_TOKEN;
  const expiresAt = process.env.SQUARESPACE_OAUTH_ACCESS_TOKEN_EXPIRES_AT;
  if (!token) return { ok: false, message: 'OAuth access token missing. Run OAuth setup route and update Vercel.' };
  if (expiresAt && new Date(expiresAt) <= new Date()) {
    return { ok: false, message: 'OAuth access token appears expired. Update token (and rotated refresh token) in Vercel.' };
  }
  return { ok: true, token };
}

export function refreshSquarespaceAccessTokenIfNeeded() {
  return { ok: false as const, message: 'Automatic refresh is disabled in this phase to avoid losing rotated single-use refresh tokens. Rerun OAuth setup and update Vercel manually.' };
}
