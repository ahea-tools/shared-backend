import { NextResponse } from 'next/server';
import { FREE_GENERATIONS_LIMIT } from '@/lib/responses/api-responses';
import { getEnv } from '@/lib/config/env';

export async function GET() {
  return NextResponse.json({
    status: 'success',
    user: { email: null, emailVerified: false },
    usage: { generationsUsed: 0, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: 2, accessStatus: 'free' },
    membership: { hasActiveMembership: false, membershipStatus: 'unknown', billingInterval: 'unknown', currentPeriodEnd: null },
    paywall: { show: true, variant: 'auth', ctaLabel: 'View membership options', ctaUrl: getEnv().SQUARESPACE_MEMBERSHIP_PURCHASE_URL }
  });
}
