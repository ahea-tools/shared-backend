import { describe, it, expect, vi } from 'vitest';
import { findMembershipLineItem } from '@/lib/squarespace/membership-products';

vi.stubEnv('SQUARESPACE_MEMBERSHIP_MONTHLY_PRODUCT_IDS', 'm-prod');
vi.stubEnv('SQUARESPACE_MEMBERSHIP_ANNUAL_PRODUCT_IDS', 'a-prod');
vi.stubEnv('SQUARESPACE_MEMBERSHIP_MONTHLY_MATCHERS', 'monthly words');
vi.stubEnv('SQUARESPACE_MEMBERSHIP_ANNUAL_MATCHERS', 'annual words');
vi.stubEnv('SQUARESPACE_MEMBERSHIP_SHARED_PRODUCT_IDS', 'shared-prod');
vi.stubEnv('SQUARESPACE_MEMBERSHIP_MONTHLY_PRICE_VALUES', '34.00');
vi.stubEnv('SQUARESPACE_MEMBERSHIP_ANNUAL_PRICE_VALUES', '299.00');
vi.stubEnv('SQUARESPACE_MEMBERSHIP_PRICE_CURRENCY', 'USD');

describe('shared product guarded price fallback', () => {
  it('shared product + 34.00 maps monthly', () => {
    const out = findMembershipLineItem([{ productId: 'shared-prod', unitPricePaid: { value: 34, currency: 'USD' } }]);
    expect(out?.billingInterval).toBe('monthly');
    expect(out?.matchSource).toBe('shared_product_price');
  });
  it('shared product + 299.00 maps annual', () => {
    const out = findMembershipLineItem([{ productId: 'shared-prod', unitPricePaid: { value: 299, currency: 'USD' } }]);
    expect(out?.billingInterval).toBe('annual');
  });
  it('price without shared product does not match', () => {
    const out = findMembershipLineItem([{ productId: 'other-prod', unitPricePaid: { value: 34, currency: 'USD' } }]);
    expect(out).toBeNull();
  });
  it('wrong currency does not match', () => {
    const out = findMembershipLineItem([{ productId: 'shared-prod', unitPricePaid: { value: 34, currency: 'EUR' } }]);
    expect(out).toBeNull();
  });
  it('product id match takes priority', () => {
    const out = findMembershipLineItem([{ productId: 'm-prod', unitPricePaid: { value: 299, currency: 'USD' } }]);
    expect(out?.matchSource).toBe('id');
    expect(out?.billingInterval).toBe('monthly');
  });
  it('text matcher still works', () => {
    const out = findMembershipLineItem([{ productId: 'none', name: 'my monthly words plan' }]);
    expect(out?.matchSource).toBe('matcher');
  });
});
