/**
 * trade-amounts unit tests — coupled price ⇄ base-cost derivation (Rule 1).
 */
import { describe, it, expect } from 'vitest';
import { deriveTradeAmounts } from '../trade-amounts';

describe('deriveTradeAmounts', () => {
  it('derives the base cost from the price anchor (base = price × quantity)', () => {
    const result = deriveTradeAmounts('price', { pricePerShareCents: 15000, baseCostCents: 0 }, 2);

    expect(result.pricePerShareCents).toBe(15000);
    expect(result.baseCostCents).toBe(30000);
  });

  it('keeps the anchor price when quantity is zero', () => {
    const result = deriveTradeAmounts(
      'price',
      { pricePerShareCents: 15000, baseCostCents: 999 },
      0
    );

    expect(result.pricePerShareCents).toBe(15000);
    expect(result.baseCostCents).toBe(0);
  });

  it('derives the price from the base anchor (price = base ÷ quantity)', () => {
    const result = deriveTradeAmounts('base', { pricePerShareCents: 0, baseCostCents: 40000 }, 2);

    expect(result.baseCostCents).toBe(40000);
    expect(result.pricePerShareCents).toBe(20000);
  });

  it('never divides by zero when the quantity is zero (anchor kept, derived 0)', () => {
    const result = deriveTradeAmounts('base', { pricePerShareCents: 123, baseCostCents: 40000 }, 0);

    expect(result.pricePerShareCents).toBe(0);
    expect(result.baseCostCents).toBe(40000);
  });

  it('handles fractional quantities with Decimal.js rounding', () => {
    // 15000 * 2.5 = 37500
    const result = deriveTradeAmounts(
      'price',
      { pricePerShareCents: 15000, baseCostCents: 0 },
      2.5
    );
    expect(result.baseCostCents).toBe(37500);
  });

  it('rounds the derived price with banker rounding', () => {
    // 10000 / 3 = 3333.33… → 3333 (integer cents)
    const result = deriveTradeAmounts('base', { pricePerShareCents: 0, baseCostCents: 10000 }, 3);
    expect(result.pricePerShareCents).toBe(3333);
  });
});
