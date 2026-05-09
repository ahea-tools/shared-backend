import { cookies } from 'next/headers';
import { getEnv } from '@/lib/config/env';
import { signSessionValue, verifySessionValue } from '@/lib/auth/cookies';

const SESSION_COOKIE = 'ahea_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export async function setBackendSession(userId: string, email: string) {
  const payload = JSON.stringify({ userId, email: email.toLowerCase(), iat: Date.now() });
  const signed = signSessionValue(Buffer.from(payload).toString('base64url'), getEnv().BACKEND_COOKIE_SECRET);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, signed, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS
  });
}

export async function clearBackendSession() {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

export async function getBackendSession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  const verified = verifySessionValue(raw, getEnv().BACKEND_COOKIE_SECRET);
  if (!verified) return null;
  try {
    return JSON.parse(Buffer.from(verified, 'base64url').toString('utf8')) as { userId: string; email: string; iat: number };
  } catch {
    return null;
  }
}
