import { NextResponse } from 'next/server';

export type AccessStatus = 'free' | 'paid' | 'comped' | 'admin';
export const FREE_GENERATIONS_LIMIT = 2;

export function blockedResponse(reason: 'auth_required'|'email_unverified'|'free_limit_reached'|'rate_limited'|'invalid_tool'|'invalid_request', message: string, usage = { generationsUsed: 0, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: 0, accessStatus: 'free' as AccessStatus }) {
  const variant = reason === 'auth_required' ? 'auth' : reason === 'email_unverified' ? 'verification' : reason === 'rate_limited' ? 'rate_limit' : 'free_limit';
  return NextResponse.json({ status: 'blocked', reason, message, usage, paywall: { show: true, variant, ctaLabel: 'Continue to account access options' } }, { status: reason === 'invalid_request' || reason === 'invalid_tool' ? 400 : 403 });
}

export function successResponse(params: { requestId: string; toolId: string; data: unknown; usage: { generationsUsed: number; freeGenerationsLimit: number; remainingFreeGenerations: number; accessStatus: AccessStatus } }) {
  return NextResponse.json({ status: 'success', requestId: params.requestId, toolId: params.toolId, output: params.data, usage: params.usage, paywall: { show: false, variant: null, ctaLabel: null } });
}
