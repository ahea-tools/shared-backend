import { getEnv } from '@/lib/config/env';

export function isOriginAllowed(origin: string | null, toolAllowedOrigins?: string[]): boolean {
  const env = getEnv();
  if (!origin) return env.NODE_ENV !== 'production';
  if (env.NODE_ENV !== 'production' && origin.includes('localhost')) return true;
  const globalAllowed = env.ALLOWED_ORIGINS.split(',').map((v) => v.trim()).filter(Boolean);
  const merged = new Set([...(toolAllowedOrigins ?? []), ...globalAllowed]);
  return merged.has(origin);
}
