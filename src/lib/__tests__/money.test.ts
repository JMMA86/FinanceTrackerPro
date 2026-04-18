/**
 * Money Utilities Test Suite
 * Tests high-precision decimal calculations with Banker's rounding
 */

import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import {
  addCents,
  subtractCents,
  multiplyCents,
  divideCents,
  centsToDecimal,
  decimalToCents,
  compoundInterest,
  calculateMonthlyPayment,
  formatMoney,
  parseMoney,
  convertCurrency,
  assertPositive,
  assertConversionMatches,
} from '../money';

describe('money.ts - Basic Arithmetic', () => {
  describe('addCents', () => {
    it('should add two positive amounts', () => {
      expect(addCents(1000, 500)).toBe(1500);
    });

    it('should handle negative amounts', () => {
      expect(addCents(1000, -200)).toBe(800);
    });

    it('should avoid floating point errors', () => {
      // JS: 0.1 + 0.2 = 0.30000000000000004
      // We work in cents: 10 + 20 = 30
      expect(addCents(10, 20)).toBe(30);
    });

    it('should handle zero', () => {
      expect(addCents(0, 500)).toBe(500);
      expect(addCents(500, 0)).toBe(500);
    });
  });

  describe('subtractCents', () => {
    it('should subtract two amounts', () => {
      expect(subtractCents(1000, 300)).toBe(700);
    });

    it('should handle negative result', () => {
      expect(subtractCents(100, 300)).toBe(-200);
    });

    it('should avoid floating point errors', () => {
      expect(subtractCents(30, 10)).toBe(20);
    });
  });
});

describe('money.ts - Multiplication and Division', () => {
  describe('multiplyCents', () => {
    it('should multiply by integer', () => {
      expect(multiplyCents(100, 3)).toBe(300);
    });

    it('should multiply by decimal', () => {
      expect(multiplyCents(100, 1.5)).toBe(150);
    });

    it("should apply Banker's rounding for .5", () => {
      // 2.5 rounds to 2 (nearest even)
      // 3.5 rounds to 4 (nearest even)
      expect(multiplyCents(1, 2.5)).toBe(2); // 2.5 cents → 2 cents
      expect(multiplyCents(1, 3.5)).toBe(4); // 3.5 cents → 4 cents
    });

    it('should accept Decimal instances', () => {
      expect(multiplyCents(100, new Decimal(2))).toBe(200);
    });
  });

  describe('divideCents', () => {
    it('should divide evenly', () => {
      expect(divideCents(100, 2)).toBe(50);
    });

    it("should apply Banker's rounding", () => {
      // 25 / 10 = 2.5 → 2 (nearest even)
      // 35 / 10 = 3.5 → 4 (nearest even)
      expect(divideCents(25, 10)).toBe(2);
      expect(divideCents(35, 10)).toBe(4);
    });

    it('should accept Decimal instances', () => {
      expect(divideCents(100, new Decimal(4))).toBe(25);
    });
  });
});

describe('money.ts - Conversion', () => {
  describe('centsToDecimal', () => {
    it('should convert cents to decimal', () => {
      const result = centsToDecimal(1050);
      expect(result.toNumber()).toBe(10.5);
    });

    it('should handle zero', () => {
      const result = centsToDecimal(0);
      expect(result.toNumber()).toBe(0);
    });

    it('should preserve precision', () => {
      const result = centsToDecimal(12345);
      expect(result.toNumber()).toBe(123.45);
    });
  });

  describe('decimalToCents', () => {
    it('should convert decimal to cents', () => {
      expect(decimalToCents(10.5)).toBe(1050);
    });

    it("should apply Banker's rounding", () => {
      // $10.025 = 1002.5 cents → 1002 cents
      // $10.035 = 1003.5 cents → 1004 cents
      expect(decimalToCents(10.025)).toBe(1002);
      expect(decimalToCents(10.035)).toBe(1004);
    });

    it('should accept Decimal instances', () => {
      expect(decimalToCents(new Decimal(15.75))).toBe(1575);
    });
  });
});

describe('money.ts - Financial Calculations', () => {
  describe('compoundInterest', () => {
    it('should calculate simple compound interest', () => {
      // $1000 at 10% for 1 period = $1100
      const result = compoundInterest(100000, 10, 1);
      expect(result).toBe(110000);
    });

    it('should handle multiple periods', () => {
      // $1000 at 10% for 2 periods = $1210
      const result = compoundInterest(100000, 10, 2);
      expect(result).toBe(121000);
    });

    it('should handle zero interest', () => {
      const result = compoundInterest(100000, 0, 10);
      expect(result).toBe(100000);
    });
  });

  describe('calculateMonthlyPayment', () => {
    it('should calculate monthly payment with interest', () => {
      // $10,000 loan at 12% EA for 12 months
      const result = calculateMonthlyPayment(1000000, 12, 12);
      // Expected: ~$888.49 per month
      expect(result).toBeGreaterThan(88800);
      expect(result).toBeLessThan(88900);
    });

    it('should handle zero interest rate', () => {
      // $1200 at 0% for 12 months = $100/month
      const result = calculateMonthlyPayment(120000, 0, 12);
      expect(result).toBe(10000);
    });
  });
});

describe('money.ts - Currency Operations', () => {
  describe('convertCurrency', () => {
    it('should convert currency with exchange rate', () => {
      // $100 USD at rate 1.10 = €110
      const result = convertCurrency(10000, 1.1);
      expect(result).toBe(11000);
    });

    it('should accept Decimal exchange rate', () => {
      const result = convertCurrency(10000, new Decimal('1.15'));
      expect(result).toBe(11500);
    });
  });

  describe('formatMoney', () => {
    it('should format with es-CO locale', () => {
      const result = formatMoney(105000, 'COP', 'es-CO');
      expect(result).toContain('1.050');
    });

    it('should format with en-US locale', () => {
      const result = formatMoney(105000, 'USD', 'en-US');
      expect(result).toContain('1,050');
    });

    it('should format with de-DE locale', () => {
      const result = formatMoney(105000, 'EUR', 'de-DE');
      expect(result).toContain('1.050');
    });

    it('should handle invalid locale gracefully', () => {
      const result = formatMoney(105000, 'USD', 'invalid-locale');
      // Intl.NumberFormat may still format with fallback locale
      expect(result).toContain('1050');
    });

    it('should use es-CO as default locale', () => {
      const result = formatMoney(105000, 'COP');
      expect(result).toContain('1.050');
    });

    it('should fallback on invalid currency', () => {
      // Force catch block by using invalid currency with invalid locale
      const result = formatMoney(105000, 'INVALID', 'xx-XX');
      expect(result).toBe('INVALID 1050.00');
    });
  });

  describe('parseMoney', () => {
    it('should parse USD format', () => {
      expect(parseMoney('$1,234.56')).toBe(123456);
    });

    it('should parse simple decimal', () => {
      expect(parseMoney('1234.56')).toBe(123456);
    });

    it('should handle invalid input', () => {
      expect(parseMoney('invalid')).toBeNull();
    });

    it('should remove currency symbols', () => {
      expect(parseMoney('€ 100.50')).toBe(10050);
    });
  });
});

describe('money.ts - Validation', () => {
  describe('assertPositive', () => {
    it('should pass for positive amounts', () => {
      expect(() => assertPositive(100)).not.toThrow();
    });

    it('should throw for zero', () => {
      expect(() => assertPositive(0)).toThrow('Amount must be positive, got 0 cents');
    });

    it('should throw for negative', () => {
      expect(() => assertPositive(-100)).toThrow('Amount must be positive, got -100 cents');
    });
  });

  describe('assertConversionMatches', () => {
    it('should pass for correct conversion', () => {
      expect(() => assertConversionMatches(10000, 11000, 1.1)).not.toThrow();
    });

    it('should throw for incorrect conversion', () => {
      expect(() => assertConversionMatches(10000, 11500, 1.1)).toThrow('Conversion mismatch');
    });
  });
});

describe("money.ts - Banker's Rounding (ROUND_HALF_EVEN)", () => {
  it('should round 2.5 to 2 (nearest even)', () => {
    const result = new Decimal(2.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    expect(result.toNumber()).toBe(2);
  });

  it('should round 3.5 to 4 (nearest even)', () => {
    const result = new Decimal(3.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    expect(result.toNumber()).toBe(4);
  });

  it('should round 4.5 to 4 (nearest even)', () => {
    const result = new Decimal(4.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    expect(result.toNumber()).toBe(4);
  });

  it('should round 5.5 to 6 (nearest even)', () => {
    const result = new Decimal(5.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
    expect(result.toNumber()).toBe(6);
  });
});
