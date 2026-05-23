/**
 * Money Utility Edge Cases
 * Supplementary tests for financial edge cases
 * Focuses on overflow protection, bankers rounding extremes, and currency conversion
 */

import { describe, it, expect } from 'vitest';
import {
  addCents,
  subtractCents,
  multiplyCents,
  divideCents,
  convertCurrency,
} from '../money';

describe('money.ts edge cases', () => {
  describe('addCents', () => {
    it('should handle large numbers without floating point imprecision', () => {
      // 0.1 + 0.2 = 0.3 in decimal, but 0.30000000000000004 in IEEE 754
      // In cents: 10 + 20 = 30 (no issue with integers, but verify)
      expect(addCents(10, 20)).toBe(30);
    });

    it('should handle very large cent values', () => {
      const result = addCents(9999999999999, 1);
      expect(result).toBe(10000000000000);
    });

    it('should handle negative numbers correctly', () => {
      expect(addCents(-1000, 500)).toBe(-500);
      expect(addCents(1000, -1500)).toBe(-500);
    });
  });

  describe('subtractCents', () => {
    it('should subtract correctly without precision loss', () => {
      expect(subtractCents(1000, 0.5)).toBe(999.5);
    });

    it('should handle subtracting from zero', () => {
      expect(subtractCents(0, 500)).toBe(-500);
    });
  });

  describe('multiplyCents', () => {
    it("should apply Banker's rounding for .5 cases", () => {
      // ROUND_HALF_EVEN: .5 rounds to nearest even
      expect(multiplyCents(100, 0.005)).toBe(0); // 0.5 → 0 (even)
      expect(multiplyCents(300, 0.005)).toBe(2); // 1.5 → 2 (even)
      expect(multiplyCents(500, 0.005)).toBe(2); // 2.5 → 2 (even)
      expect(multiplyCents(700, 0.005)).toBe(4); // 3.5 → 4 (even)
    });

    it('should handle zero multiplier', () => {
      expect(multiplyCents(10000, 0)).toBe(0);
    });

    it('should handle very large multipliers without throwing', () => {
      // Decimal.js handles arbitrary precision, so this should not throw
      expect(() => multiplyCents(9999999999999, 2)).not.toThrow();
      const result = multiplyCents(9999999999999, 2);
      expect(result).toBe(19999999999998);
    });

    it('should handle decimal multipliers correctly', () => {
      expect(multiplyCents(10000, 1.1)).toBe(11000); // 10% increase
      expect(multiplyCents(10000, 0.9)).toBe(9000); // 10% decrease
      expect(multiplyCents(10000, 1.05)).toBe(10500); // 5% increase
    });
  });

  describe('divideCents', () => {
    it("should apply Banker's rounding for .5 in division", () => {
      expect(divideCents(5, 10)).toBe(0); // 0.5 → 0 (even)
      expect(divideCents(15, 10)).toBe(2); // 1.5 → 2 (even)
      expect(divideCents(25, 10)).toBe(2); // 2.5 → 2 (even)
      expect(divideCents(35, 10)).toBe(4); // 3.5 → 4 (even)
    });

    it('should handle division by 1', () => {
      expect(divideCents(12345, 1)).toBe(12345);
    });

    it('should handle larger divisors', () => {
      expect(divideCents(100000, 12)).toBe(8333); // 8333.33 → 8333 (Banker's)
    });
  });

  describe('convertCurrency', () => {
    it('must preserve exact exchange rate', () => {
      const amountCents = 10000; // 100 EUR
      const rate = 1.1; // EUR to USD
      expect(convertCurrency(amountCents, rate)).toBe(11000); // $110 USD
    });

    it('should handle conversion with rounding at half-cent', () => {
      // If 100 cents at rate 0.015 = 1.5 cents → 2 (Banker's: nearest even)
      expect(convertCurrency(100, 0.015)).toBe(2);
      // If 200 cents at rate 0.015 = 3 cents exactly
      expect(convertCurrency(200, 0.015)).toBe(3);
      // If 300 cents at rate 0.015 = 4.5 cents → 4 (Banker's: nearest even)
      expect(convertCurrency(300, 0.015)).toBe(4);
    });

    it('should handle very small exchange rates', () => {
      // Converting 1,000,000 COP to USD at rate 0.00025
      const result = convertCurrency(100000000, 0.00025);
      expect(result).toBe(25000); // 250 USD
    });

    it('should handle exchange rate of 1 (same currency)', () => {
      expect(convertCurrency(5000, 1)).toBe(5000);
    });

    it('should handle zero amount conversion', () => {
      expect(convertCurrency(0, 1.5)).toBe(0);
    });
  });

  describe('edge cases for large numbers with Decimal.js', () => {
    it('should handle MAX_SAFE_INTEGER level amounts', () => {
      // Avoid actual overflow
      const large = 9_000_719_925_474_000; // Below MAX_SAFE_INTEGER but very large
      const result = addCents(large, 1);
      expect(result).toBe(large + 1);
    });

    it('should handle negative large amounts', () => {
      expect(addCents(-5000000000, -5000000000)).toBe(-10000000000);
    });
  });
});
