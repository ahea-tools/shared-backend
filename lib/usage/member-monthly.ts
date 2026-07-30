import { getSupabaseAdmin } from '@/lib/supabase/server';

export const MEMBER_MONTHLY_GENERATION_LIMIT = 100;
export const MEMBER_GENERATION_TIME_ZONE = 'America/Chicago';
export const MEMBER_RESERVATION_TTL_MINUTES = 30;

export type MemberMonthlyUsage = {
  generationsUsed: number;
  generationsLimit: number;
  remainingGenerations: number;
  periodStart: string;
  periodEnd: string;
  resetsAt: string;
};

const partsInChicago = (date: Date) => Object.fromEntries(
  new Intl.DateTimeFormat('en-US', {
    timeZone: MEMBER_GENERATION_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, Number(value)])
) as Record<string, number>;

/** Converts a Chicago wall-clock time to UTC without assuming a fixed DST offset. */
const chicagoWallTimeToUtc = (year: number, month: number, day: number) => {
  const desired = Date.UTC(year, month - 1, day);
  let candidate = desired;
  for (let i = 0; i < 3; i += 1) {
    const p = partsInChicago(new Date(candidate));
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    candidate += desired - represented;
  }
  return new Date(candidate);
};

export function getMemberGenerationPeriod(now = new Date()) {
  const local = partsInChicago(now);
  const nextYear = local.month === 12 ? local.year + 1 : local.year;
  const nextMonth = local.month === 12 ? 1 : local.month + 1;
  return {
    periodStart: chicagoWallTimeToUtc(local.year, local.month, 1).toISOString(),
    periodEnd: chicagoWallTimeToUtc(nextYear, nextMonth, 1).toISOString()
  };
}

const usageFromRpc = (value: any, fallback: ReturnType<typeof getMemberGenerationPeriod>): MemberMonthlyUsage => {
  const row = Array.isArray(value) ? value[0] : value;
  const used = Number(row?.generations_used ?? row?.usage ?? 0);
  const limit = Number(row?.generations_limit ?? MEMBER_MONTHLY_GENERATION_LIMIT);
  const periodStart = String(row?.period_start ?? fallback.periodStart);
  const periodEnd = String(row?.period_end ?? fallback.periodEnd);
  return { generationsUsed: used, generationsLimit: limit, remainingGenerations: Math.max(0, limit - used), periodStart, periodEnd, resetsAt: periodEnd };
};

export function isMemberMonthlyAllowanceApplicable(accessStatus: string) {
  return accessStatus === 'paid' || accessStatus === 'comped';
}

export async function reserveMemberMonthlyGeneration(userId: string, requestId: string, toolId: string, now = new Date()) {
  const period = getMemberGenerationPeriod(now);
  const reservationExpiresAt = new Date(now.getTime() + MEMBER_RESERVATION_TTL_MINUTES * 60_000).toISOString();
  const { data, error } = await getSupabaseAdmin().rpc('reserve_member_monthly_generation', {
    p_user_id: userId, p_request_id: requestId, p_tool_id: toolId,
    p_period_start: period.periodStart, p_period_end: period.periodEnd,
    p_reservation_expires_at: reservationExpiresAt, p_generation_limit: MEMBER_MONTHLY_GENERATION_LIMIT
  });
  if (error) throw new Error(`Member generation reservation failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  return { reserved: Boolean(row?.reserved), usage: usageFromRpc(row, period) };
}

export async function finalizeMemberMonthlyGeneration(requestId: string, now = new Date()) {
  const period = getMemberGenerationPeriod(now);
  const { data, error } = await getSupabaseAdmin().rpc('finalize_member_monthly_generation', { p_request_id: requestId, p_generation_limit: MEMBER_MONTHLY_GENERATION_LIMIT });
  if (error) throw new Error(`Member generation finalization failed: ${error.message}`);
  return usageFromRpc(data, period);
}

export async function releaseMemberMonthlyGeneration(requestId: string, reason: string) {
  const { error } = await getSupabaseAdmin().rpc('release_member_monthly_generation', { p_request_id: requestId, p_release_reason: reason.slice(0, 100) });
  if (error) throw new Error(`Member generation release failed: ${error.message}`);
}

export async function getMemberMonthlyGenerationUsage(userId: string, now = new Date()) {
  const period = getMemberGenerationPeriod(now);
  const { data, error } = await getSupabaseAdmin().rpc('get_member_monthly_generation_usage', {
    p_user_id: userId, p_period_start: period.periodStart, p_period_end: period.periodEnd,
    p_generation_limit: MEMBER_MONTHLY_GENERATION_LIMIT
  });
  if (error) throw new Error(`Member generation usage lookup failed: ${error.message}`);
  return usageFromRpc(data, period);
}
