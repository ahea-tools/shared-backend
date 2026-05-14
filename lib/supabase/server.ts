import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/config/env';

function isLikelyJwt(value: string): boolean {
  return value.split('.').length === 3;
}

function decodeJwtPayloadClaim(token: string, claim: string): string | null {
  try {
    const [, payload] = token.split('.');
    if (!payload) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
    const value = parsed[claim];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function assertSupabaseServiceRoleConfig() {
  const env = getEnv();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = env.SUPABASE_ANON_KEY;

  if (!serviceRoleKey || serviceRoleKey.length < 32 || !isLikelyJwt(serviceRoleKey)) {
    throw new Error('Missing or invalid SUPABASE_SERVICE_ROLE_KEY configuration.');
  }

  if (anonKey && serviceRoleKey === anonKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must not equal SUPABASE_ANON_KEY.');
  }
}

export function detectConfiguredSupabaseRole(): 'service_role' | 'authenticated' | 'anon' | 'unknown' {
  const env = getEnv();
  const role = decodeJwtPayloadClaim(env.SUPABASE_SERVICE_ROLE_KEY, 'role');
  if (role === 'service_role' || role === 'authenticated' || role === 'anon') return role;
  return 'unknown';
}

export function isServiceRoleClientConfiguredSafely() {
  const env = getEnv();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 32 || !isLikelyJwt(serviceRoleKey)) return false;
  if (env.SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY === serviceRoleKey) return false;
  return detectConfiguredSupabaseRole() === 'service_role';
}

export function getSupabaseAdmin() {
  assertSupabaseServiceRoleConfig();
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    }
  });
}
