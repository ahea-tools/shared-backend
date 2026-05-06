import { FREE_GENERATIONS_LIMIT, type AccessStatus } from '@/lib/responses/api-responses';

export type Profile = { id: string; email: string; email_verified: boolean; access_status: AccessStatus; access_expires_at: string | null; generations_used: number };
export function evaluateGenerationAccess(profile: Profile | null, isRateLimited: boolean) {
  if (!profile) return { allowed: false, reason: 'auth_required' as const };
  if (!profile.email_verified) return { allowed: false, reason: 'email_unverified' as const };
  if (isRateLimited) return { allowed: false, reason: 'rate_limited' as const };
  const privileged = ['paid', 'comped', 'admin'].includes(profile.access_status) && (!profile.access_expires_at || new Date(profile.access_expires_at) > new Date());
  if (privileged) return { allowed: true, consumesFreeGeneration: false };
  if (profile.generations_used >= FREE_GENERATIONS_LIMIT) return { allowed: false, reason: 'free_limit_reached' as const };
  return { allowed: true, consumesFreeGeneration: true };
}
