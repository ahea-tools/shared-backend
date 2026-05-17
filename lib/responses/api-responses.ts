import { NextResponse } from 'next/server';

export type AccessStatus = 'free' | 'paid' | 'comped' | 'admin';
export const FREE_GENERATIONS_LIMIT = 2;
const MEMBERSHIP_CTA_URL = 'https://www.americanhealthequity.org/membership';
const AUTH_MESSAGE = 'Please sign in or verify your email to use AHEA tools. Verified users receive two complimentary generations total across AHEA tools.';
const FREE_LIMIT_MESSAGE = 'You’ve used your two complimentary AHEA tool generations. Membership unlocks continued access across all AHEA tools.';

type PaywallVariant = 'none' | 'auth' | 'verification' | 'rate_limit' | 'free_limit' | 'membership';

type PaywallState = {
  show: boolean;
  variant: PaywallVariant;
  ctaLabel: string | null;
  ctaUrl: string | null;
  message: string | null;
};

export function allowedPaywallState(): PaywallState {
  return { show: false, variant: 'none', ctaLabel: null, ctaUrl: null, message: null };
}

export function authPaywallState(origin: string): PaywallState {
  return { show: true, variant: 'auth', ctaLabel: 'Verify email to continue', ctaUrl: `${origin}/api/auth/start`, message: AUTH_MESSAGE };
}

export function blockedResponse(reason: 'auth_required'|'email_unverified'|'free_limit_reached'|'rate_limited'|'invalid_tool'|'invalid_request', message: string, usage = { generationsUsed: 0, freeGenerationsLimit: FREE_GENERATIONS_LIMIT, remainingFreeGenerations: 0, accessStatus: 'free' as AccessStatus }) {
  const paywall: PaywallState = reason === 'auth_required' || reason === 'email_unverified'
    ? { show: true, variant: 'auth', message: AUTH_MESSAGE, ctaLabel: 'Verify email to continue', ctaUrl: null }
    : reason === 'rate_limited'
      ? { show: true, variant: 'rate_limit', message, ctaLabel: null, ctaUrl: null }
      : reason === 'free_limit_reached'
        ? { show: true, variant: 'membership', message: FREE_LIMIT_MESSAGE, ctaLabel: 'View membership options', ctaUrl: MEMBERSHIP_CTA_URL }
        : { show: true, variant: 'free_limit', message, ctaLabel: 'Continue to account access options', ctaUrl: null };

  const responseMessage = reason === 'free_limit_reached' ? FREE_LIMIT_MESSAGE : reason === 'auth_required' || reason === 'email_unverified' ? AUTH_MESSAGE : message;

  return NextResponse.json({ status: 'blocked', reason: reason === 'free_limit_reached' ? 'free_trial_used' : reason, message: responseMessage, usage, paywall }, { status: reason === 'invalid_request' || reason === 'invalid_tool' ? 400 : 403 });
}

export function successResponse(params: { requestId: string; toolId: string; data: unknown; usage: { generationsUsed: number; freeGenerationsLimit: number; remainingFreeGenerations: number; accessStatus: AccessStatus } }) {
  return NextResponse.json({ status: 'success', requestId: params.requestId, toolId: params.toolId, output: params.data, usage: params.usage, paywall: allowedPaywallState() });
}
