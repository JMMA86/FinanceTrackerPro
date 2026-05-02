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

describe('money.ts', () => {
  describe('when adding cents', () => {
    it('should sum two positive amounts correctly', () => {
      // Given
      const a = 1000,
        b = 500;

      // When
      const result = addCents(a, b);

      // Then
      expect(result).toBe(1500);
    });

    it('should handle negative addend', () => {
      // Given / When / Then
      expect(addCents(1000, -200)).toBe(800);
    });

    it('should avoid floating point errors', () => {
      // Given / When / Then
      expect(addCents(10, 20)).toBe(30);
    });

    it('should handle zero addend', () => {
      // Given / When / Then
      expect(addCents(0, 500)).toBe(500);
      expect(addCents(500, 0)).toBe(500);
    });
  });

  describe('when subtracting cents', () => {
    it('should subtract two amounts correctly', () => {
      // Given / When / Then
      expect(subtractCents(1000, 300)).toBe(700);
    });

    it('should return negative result when subtrahend is larger', () => {
      // Given / When / Then
      expect(subtractCents(100, 300)).toBe(-200);
    });

    it('should avoid floating point errors', () => {
      // Given / When / Then
      expect(subtractCents(30, 10)).toBe(20);
    });
  });

  describe('when multiplying cents', () => {
    it('should multiply by integer correctly', () => {
      // Given / When / Then
      expect(multiplyCents(100, 3)).toBe(300);
    });

    it('should multiply by decimal correctly', () => {
      // Given / When / Then
      expect(multiplyCents(100, 1.5)).toBe(150);
    });

    it("should apply Banker's rounding for .5 values", () => {
      // 2.5 rounds to 2 (nearest even), 3.5 rounds to 4 (nearest even)
      expect(multiplyCents(1, 2.5)).toBe(2);
      expect(multiplyCents(1, 3.5)).toBe(4);
    });

    it('should accept Decimal instances', () => {
      // Given / When / Then
      expect(multiplyCents(100, new Decimal(2))).toBe(200);
    });
  });

  describe('when dividing cents', () => {
    it('should divide evenly', () => {
      // Given / When / Then
      expect(divideCents(100, 2)).toBe(50);
    });

    it("should apply Banker's rounding for half values", () => {
      // 25/10=2.5 → 2 (nearest even), 35/10=3.5 → 4 (nearest even)
      expect(divideCents(25, 10)).toBe(2);
      expect(divideCents(35, 10)).toBe(4);
    });

    it('should accept Decimal divisor', () => {
      // Given / When / Then
      expect(divideCents(100, new Decimal(4))).toBe(25);
    });
  });

  describe('when converting cents to decimal', () => {
    it('should convert cents to decimal representation', () => {
      // Given / When
      const result = centsToDecimal(1050);

      // Then
      expect(result.toNumber()).toBe(10.5);
    });

    it('should handle zero', () => {
      // Given / When
      const result = centsToDecimal(0);

      // Then
      expect(result.toNumber()).toBe(0);
    });

    it('should preserve full precision', () => {
      // Given / When
      const result = centsToDecimal(12345);

      // Then
      expect(result.toNumber()).toBe(123.45);
    });
  });

  describe('when converting decimal to cents', () => {
    it('should convert decimal to integer cents', () => {
      // Given / When / Then
      expect(decimalToCents(10.5)).toBe(1050);
    });

    it("should apply Banker's rounding at half-cent boundary", () => {
      // $10.025 = 1002.5 cents → 1002, $10.035 = 1003.5 cents → 1004
      expect(decimalToCents(10.025)).toBe(1002);
      expect(decimalToCents(10.035)).toBe(1004);
    });

    it('should accept Decimal instances', () => {
      // Given / When / Then
      expect(decimalToCents(new Decimal(15.75))).toBe(1575);
    });
  });

  describe('when calculating compound interest', () => {
    it('should calculate correctly for a single period', () => {
      // Given: $1000 at 10% for 1 period = $1100
      const result = compoundInterest(100000, 10, 1);

      // Then
      expect(result).toBe(110000);
    });

    it('should compound correctly over multiple periods', () => {
      // Given: $1000 at 10% for 2 periods = $1210
      const result = compoundInterest(100000, 10, 2);

      // Then
      expect(result).toBe(121000);
    });

    it('should return principal unchanged at zero interest', () => {
      // Given / When
      const result = compoundInterest(100000, 0, 10);

      // Then
      expect(result).toBe(100000);
    });
  });

  describe('when calculating monthly payment', () => {
    it('should calculate correct payment with interest', () => {
      // Given: $10,000 loan at 12% EA for 12 months → ~$888.49/month
      const result = calculateMonthlyPayment(1000000, 12, 12);

      // Then
      expect(result).toBeGreaterThan(88800);
      expect(result).toBeLessThan(88900);
    });

    it('should divide principal evenly at zero interest', () => {
      // Given: $1200 at 0% for 12 months = $100/month
      const result = calculateMonthlyPayment(120000, 0, 12);

      // Then
      expect(result).toBe(10000);
    });
  });

  describe('when converting currency', () => {
    it('should apply exchange rate correctly', () => {
      // Given: $100 USD at rate 1.10 = $110
      const result = convertCurrency(10000, 1.1);

      // Then
      expect(result).toBe(11000);
    });

    it('should accept Decimal exchange rate', () => {
      // Given / When
      const result = convertCurrency(10000, new Decimal('1.15'));

      // Then
      expect(result).toBe(11500);
    });
  });

  describe('when formatting money', () => {
    it('should format with es-CO locale', () => {
      // Given / When
      const result = formatMoney(105000, 'COP', 'es-CO');

      // Then
      expect(result).toContain('1.050');
    });

    it('should format with en-US locale', () => {
      // Given / When
      const result = formatMoney(105000, 'USD', 'en-US');

      // Then
      expect(result).toContain('1,050');
    });

    it('should format with de-DE locale', () => {
      // Given / When
      const result = formatMoney(105000, 'EUR', 'de-DE');

      // Then
      expect(result).toContain('1.050');
    });

    it('should fall back gracefully on invalid locale', () => {
      // Given / When
      const result = formatMoney(105000, 'USD', 'invalid-locale');

      // Then
      expect(result).toMatch(/1[,.]?050/);
    });

    it('should default to es-CO locale when none provided', () => {
      // Given / When
      const result = formatMoney(105000, 'COP');

      // Then
      expect(result).toContain('1.050');
    });

    it('should fall back on invalid currency code', () => {
      // Given / When
      const result = formatMoney(105000, 'INVALID', 'xx-XX');

      // Then
      expect(result).toBe('INVALID 1050.00');
    });
  });

  describe('when parsing money strings', () => {
    it('should parse USD-formatted string', () => {
      // Given / When / Then
      expect(parseMoney('$1,234.56')).toBe(123456);
    });

    it('should parse plain decimal string', () => {
      // Given / When / Then
      expect(parseMoney('1234.56')).toBe(123456);
    });

    it('should return null for invalid input', () => {
      // Given / When / Then
      expect(parseMoney('invalid')).toBeNull();
    });

    it('should strip currency symbols', () => {
      // Given / When / Then
      expect(parseMoney('€ 100.50')).toBe(10050);
    });
  });

  describe('when asserting positive amounts', () => {
    it('should not throw for positive amounts', () => {
      // Given / When / Then
      expect(() => assertPositive(100)).not.toThrow();
    });

    it('should throw for zero', () => {
      // Given / When / Then
      expect(() => assertPositive(0)).toThrow('Amount must be positive, got 0 cents');
    });

    it('should throw for negative amounts', () => {
      // Given / When / Then
      expect(() => assertPositive(-100)).toThrow('Amount must be positive, got -100 cents');
    });
  });

  describe('when asserting currency conversion matches', () => {
    it('should not throw for correct conversion', () => {
      // Given / When / Then
      expect(() => assertConversionMatches(10000, 11000, 1.1)).not.toThrow();
    });

    it('should throw when conversion result does not match', () => {
      // Given / When / Then
      expect(() => assertConversionMatches(10000, 11500, 1.1)).toThrow('Conversion mismatch');
    });
  });

  describe("Banker's rounding (ROUND_HALF_EVEN)", () => {
    it('should round 2.5 down to 2 (nearest even)', () => {
      // Given / When
      const result = new Decimal(2.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);

      // Then
      expect(result.toNumber()).toBe(2);
    });

    it('should round 3.5 up to 4 (nearest even)', () => {
      // Given / When
      const result = new Decimal(3.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);

      // Then
      expect(result.toNumber()).toBe(4);
    });

    it('should round 4.5 down to 4 (nearest even)', () => {
      // Given / When
      const result = new Decimal(4.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);

      // Then
      expect(result.toNumber()).toBe(4);
    });

    it('should round 5.5 up to 6 (nearest even)', () => {
      // Given / When
      const result = new Decimal(5.5).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);

      // Then
      expect(result.toNumber()).toBe(6);
    });
  });
});
