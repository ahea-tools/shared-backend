import { signSessionValue, verifySessionValue } from '@/lib/auth/cookies';
import { getEnv } from '@/lib/config/env';

const AUTH_STATE_TTL_MS = 1000 * 60 * 15;

type AuthState = {
  toolId: string;
  emailHash: string;
  iat: number;
};

export function createAuthState(toolId: string, emailHash: string) {
  const payload: AuthState = { toolId, emailHash, iat: Date.now() };
  return signSessionValue(Buffer.from(JSON.stringify(payload)).toString('base64url'), getEnv().BACKEND_COOKIE_SECRET);
}

export function parseAuthState(state: string | null) {
  if (!state) return null;
  const verified = verifySessionValue(state, getEnv().BACKEND_COOKIE_SECRET);
  if (!verified) return null;

  try {
    const parsed = JSON.parse(Buffer.from(verified, 'base64url').toString('utf8')) as AuthState;
    if (!parsed.toolId || !parsed.emailHash || !parsed.iat) return null;
    if (Date.now() - parsed.iat > AUTH_STATE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
