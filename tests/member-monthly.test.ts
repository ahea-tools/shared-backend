import { describe, expect, it } from 'vitest';
import { getMemberGenerationPeriod, isMemberMonthlyAllowanceApplicable, MEMBER_GENERATION_TIME_ZONE, MEMBER_MONTHLY_GENERATION_LIMIT } from '@/lib/usage/member-monthly';

describe('member calendar-month configuration', () => {
  it('centralizes the limit, applicability, and admin/free exemptions', () => {
    expect(MEMBER_MONTHLY_GENERATION_LIMIT).toBe(100);
    expect(MEMBER_GENERATION_TIME_ZONE).toBe('America/Chicago');
    expect(isMemberMonthlyAllowanceApplicable('paid')).toBe(true);
    expect(isMemberMonthlyAllowanceApplicable('comped')).toBe(true);
    expect(isMemberMonthlyAllowanceApplicable('admin')).toBe(false);
    expect(isMemberMonthlyAllowanceApplicable('free')).toBe(false);
  });

  it('uses calendar months with no rollover and resets at Chicago midnight', () => {
    expect(getMemberGenerationPeriod(new Date('2026-07-31T23:59:00Z'))).toEqual({ periodStart: '2026-07-01T05:00:00.000Z', periodEnd: '2026-08-01T05:00:00.000Z' });
    expect(getMemberGenerationPeriod(new Date('2026-08-01T05:00:00Z'))).toEqual({ periodStart: '2026-08-01T05:00:00.000Z', periodEnd: '2026-09-01T05:00:00.000Z' });
  });

  it('handles CST and CDT boundaries instead of a fixed UTC offset', () => {
    expect(getMemberGenerationPeriod(new Date('2026-01-15T12:00:00Z'))).toEqual({ periodStart: '2026-01-01T06:00:00.000Z', periodEnd: '2026-02-01T06:00:00.000Z' });
    expect(getMemberGenerationPeriod(new Date('2026-03-15T12:00:00Z'))).toEqual({ periodStart: '2026-03-01T06:00:00.000Z', periodEnd: '2026-04-01T05:00:00.000Z' });
    expect(getMemberGenerationPeriod(new Date('2026-11-15T12:00:00Z'))).toEqual({ periodStart: '2026-11-01T05:00:00.000Z', periodEnd: '2026-12-01T06:00:00.000Z' });
  });
});

import { readFileSync } from 'node:fs';

describe('member allowance migration invariants', () => {
  const sql = readFileSync('supabase/migrations/202607300001_member_monthly_generation_allowance.sql', 'utf8');
  it('serializes global cross-tool reservations and counts active plus completed slots', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain("r.status in ('reserved','completed')");
    expect(sql).not.toContain('tool_id=p_tool_id');
  });
  it('provides unique request id idempotency, stale expiry, finalize, and safe release', () => {
    expect(sql).toContain('request_id uuid not null unique');
    expect(sql).toContain("status='expired'");
    expect(sql).toContain("target.status='reserved'");
    expect(sql).toContain("if current_status='reserved'");
  });
  it('is backend-only and stores no sensitive generation content', () => {
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('to service_role');
    expect(sql).not.toMatch(/\b(prompt|abstract|model_output|generated_response)\s+(text|json|jsonb)/i);
  });
});
