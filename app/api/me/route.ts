import { NextResponse } from 'next/server';
import { FREE_GENERATIONS_LIMIT } from '@/lib/responses/api-responses';
export async function GET() {
  return NextResponse.json({ status: 'success', user: { email: null, emailVerified: false }, usage: { generationsUsed: 0, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: 2, accessStatus: 'free' }, paywall: { show: true, variant: 'auth' } });
}
