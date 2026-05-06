import { Redis } from '@upstash/redis';
import { getEnv } from '@/lib/config/env';

const redis = () => Redis.fromEnv();
export async function checkRateLimit(key: string, limit: number, windowSeconds: number) {
  const r = redis();
  const count = await r.incr(key);
  if (count === 1) await r.expire(key, windowSeconds);
  return { limited: count > limit, count };
}
