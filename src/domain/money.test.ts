import { describe, expect, it } from '@jest/globals';
import { formatCurrencyFromCents, parseCurrencyToCents } from './money';

describe('money in integer cents', () => {
  it('parses decimal and grouped MXN amounts without floating point storage', () => {
    expect(parseCurrencyToCents('0.99')).toBe(99);
    expect(parseCurrencyToCents('1,234.5')).toBe(123450);
    expect(parseCurrencyToCents('500')).toBe(50000);
  });

  it.each(['-1.00', '1.234', '1,23', '1.2.3', 'abc', ''])('rejects invalid amount %p', (value) => {
    expect(() => parseCurrencyToCents(value)).toThrow(TypeError);
  });

  it('rejects values that exceed safe integer precision', () => {
    expect(() => parseCurrencyToCents('90,071,992,547,409.92')).toThrow(RangeError);
  });

  it('formats integer cents for Mexican pesos', () => {
    expect(formatCurrencyFromCents(12345)).toBe('$123.45');
    expect(formatCurrencyFromCents(0)).toBe('$0.00');
    expect(() => formatCurrencyFromCents(1.5)).toThrow(RangeError);
  });
});
