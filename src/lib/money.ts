/**
 * High-Precision Money Handling (CLAUDE.md Rule 1)
 * Uses Decimal.js with Banker's Rounding (ROUND_HALF_EVEN)
 *
 * CRITICAL: All financial calculations MUST use these utilities
 * Storage: Integer cents (no floats)
 * Precision: 20 decimal places
 */

import { Decimal } from 'decimal.js';

// Configure Decimal.js globally
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN, // Banker's rounding (IEEE 754)
});

/**
 * Add two amounts in cents
 * @param a Amount A in cents
 * @param b Amount B in cents
 * @returns Sum in cents
 */
export function addCents(a: number, b: number): number {
  return new Decimal(a).plus(b).toNumber();
}

/**
 * Subtract two amounts in cents
 * @param a Amount A in cents
 * @param b Amount B in cents (subtracted from A)
 * @returns Difference in cents
 */
export function subtractCents(a: number, b: number): number {
  return new Decimal(a).minus(b).toNumber();
}

/**
 * Multiply amount by decimal factor
 * @param cents Amount in cents
 * @param multiplier Decimal multiplier (e.g., 1.05 for 5% increase)
 * @returns Product in cents (rounded)
 */
export function multiplyCents(cents: number, multiplier: number | Decimal): number {
  return new Decimal(cents)
    .times(multiplier)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

/**
 * Divide amount by decimal divisor
 * @param cents Amount in cents
 * @param divisor Decimal divisor (e.g., 12 for monthly from yearly)
 * @returns Quotient in cents (rounded using Banker's rounding)
 */
export function divideCents(cents: number, divisor: number | Decimal): number {
  return new Decimal(cents)
    .dividedBy(divisor)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

/**
 * Convert cents to currency amount (for display only)
 * @param cents Amount in cents
 * @returns Decimal amount
 */
export function centsToDecimal(cents: number): Decimal {
  return new Decimal(cents).dividedBy(100);
}

/**
 * Convert currency amount to cents (for storage)
 * @param amount Decimal amount
 * @returns Amount in cents
 */
export function decimalToCents(amount: number | Decimal): number {
  return new Decimal(amount).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

/**
 * Calculate compound interest
 * @param principalCents Principal amount in cents
 * @param rateEA Effective Annual Rate (e.g., 12.5 for 12.5%)
 * @param periods Number of compounding periods
 * @returns Final amount in cents
 */
export function compoundInterest(
  principalCents: number,
  rateEA: number | Decimal,
  periods: number
): number {
  const rate = new Decimal(rateEA).dividedBy(100);
  const multiplier = rate.plus(1).pow(periods);
  return multiplyCents(principalCents, multiplier);
}

/**
 * Calculate monthly payment for loan (amortization)
 * @param principalCents Loan principal in cents
 * @param rateEA Effective Annual Rate (e.g., 12.5 for 12.5%)
 * @param termMonths Number of months
 * @returns Monthly payment in cents
 */
export function calculateMonthlyPayment(
  principalCents: number,
  rateEA: number | Decimal,
  termMonths: number
): number {
  const monthlyRate = new Decimal(rateEA).dividedBy(12).dividedBy(100);

  if (monthlyRate.isZero()) {
    // No interest: simple division
    return divideCents(principalCents, termMonths);
  }

  // Amortization formula: P * (r(1+r)^n) / ((1+r)^n - 1)
  const onePlusR = monthlyRate.plus(1);
  const numerator = new Decimal(principalCents).times(monthlyRate).times(onePlusR.pow(termMonths));
  const denominator = onePlusR.pow(termMonths).minus(1);

  return numerator.dividedBy(denominator).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

/**
 * Format money for display with locale support
 * @param cents Amount in cents
 * @param currency ISO 4217 currency code
 * @param locale Locale string (e.g., 'es-CO', 'en-US', 'de-DE')
 * @returns Formatted currency string
 */
export function formatMoney(cents: number, currency: string, locale: string = 'es-CO'): string {
  const amount = centsToDecimal(cents).toNumber();

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch (error) {
    // Fallback for invalid locale/currency
    return `${currency} ${amount.toFixed(2)}`;
  }
}

/**
 * Parse money string to cents
 * @param moneyString Formatted money string (e.g., "$1,234.56")
 * @returns Amount in cents or null if invalid
 */
export function parseMoney(moneyString: string): number | null {
  // Remove currency symbols, spaces, and thousand separators
  const cleaned = moneyString.replace(/[^\d.,-]/g, '').replace(/,/g, '');

  const parsed = parseFloat(cleaned);

  if (isNaN(parsed)) {
    return null;
  }

  return decimalToCents(parsed);
}

/**
 * Convert amount between currencies
 * @param cents Amount in cents (original currency)
 * @param exchangeRate Exchange rate (destination / source)
 * @returns Converted amount in cents
 */
export function convertCurrency(cents: number, exchangeRate: number | Decimal): number {
  return multiplyCents(cents, exchangeRate);
}

/**
 * Validate amount is positive
 * @param cents Amount in cents
 * @throws Error if amount is negative or zero
 */
export function assertPositive(cents: number): void {
  if (cents <= 0) {
    throw new Error(`Amount must be positive, got ${cents} cents`);
  }
}

/**
 * Validate amounts match after currency conversion
 * @param originalCents Original amount in cents
 * @param convertedCents Converted amount in cents
 * @param exchangeRate Exchange rate used
 * @throws Error if conversion doesn't match
 */
export function assertConversionMatches(
  originalCents: number,
  convertedCents: number,
  exchangeRate: number | Decimal
): void {
  const computed = convertCurrency(originalCents, exchangeRate);

  if (computed !== convertedCents) {
    throw new Error(
      `Conversion mismatch: ${originalCents} * ${exchangeRate} = ${computed}, ` +
        `but got ${convertedCents}`
    );
  }
}
