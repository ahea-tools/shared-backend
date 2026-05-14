import { createClient } from '@supabase/supabase-js';
import { getEnv } from '@/lib/config/env';

function isLikelyJwt(value: string): boolean {
  return value.split('.').length === 3;
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

export function isServiceRoleClientConfiguredSafely() {
  const env = getEnv();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey.length < 32 || !isLikelyJwt(serviceRoleKey)) return false;
  if (env.SUPABASE_ANON_KEY && env.SUPABASE_ANON_KEY === serviceRoleKey) return false;
  return true;
}

export function getSupabaseAdmin() {
  assertSupabaseServiceRoleConfig();
  const env = getEnv();
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}
