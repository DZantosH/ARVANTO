import { describe, expect, it } from '@jest/globals';
import { getCartTotalCents, getExpectedCashCents, validatePayments } from './sales';

describe('sales calculations', () => {
  it('calculates rounded line totals in cents', () => {
    expect(getCartTotalCents([
      { productId: 'a', name: 'A', sku: null, unitPriceCents: 199, unitCostCents: 90, stock: 2, quantity: 2 },
      { productId: 'b', name: 'B', sku: 'B', unitPriceCents: 50, unitCostCents: 20, stock: 5, quantity: 0.5 },
    ])).toBe(423);
  });

  it('accepts a cash sale and calculates change', () => {
    expect(validatePayments(1250, { cashCents: 1250, cardCents: 0, transferCents: 0, cashTenderedCents: 2000 }))
      .toEqual({ valid: true, changeCents: 750 });
  });

  it('accepts mixed payment only when applied methods equal the total', () => {
    expect(validatePayments(1000, { cashCents: 400, cardCents: 600, transferCents: 0, cashTenderedCents: 400 }).valid).toBe(true);
    expect(validatePayments(1000, { cashCents: 400, cardCents: 599, transferCents: 0, cashTenderedCents: 400 }).valid).toBe(false);
  });

  it('rejects cash tendered below the cash portion and negative amounts', () => {
    expect(validatePayments(1000, { cashCents: 500, cardCents: 500, transferCents: 0, cashTenderedCents: 499 }).valid).toBe(false);
    expect(validatePayments(1000, { cashCents: -1, cardCents: 1001, transferCents: 0, cashTenderedCents: 0 }).valid).toBe(false);
  });

  it('calculates expected cash using cash sales and cash movements only', () => {
    expect(getExpectedCashCents(10000, 2550, 400, 1000)).toBe(11950);
  });
});
