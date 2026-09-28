/**
 * Investment Schemas (Zod)
 * Server-side validation for investment operations
 * Follows CLAUDE.md Rules 5, 12
 */

import { z } from 'zod';
import { Decimal } from 'decimal.js';
import { MAX_SAFE_CENTS } from '@/lib/validations/finance';

/**
 * UUID v4 format validation
 */
const UUIDv4Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Must be a valid UUID v4'
  );

/**
 * CUID format validation (Prisma default)
 */
const CUIDSchema = z.string().regex(/^c[a-z0-9]{20,}$/, 'Must be a valid CUID');

/**
 * Investment account currency (USD or EUR only)
 */
const InvestmentCurrencySchema = z.enum(['USD', 'EUR']);

/**
 * Positive decimal quantity (supports fractional shares).
 *
 * Accepts `,` or `.` as the decimal separator (the `,` is normalized to `.`)
 * and up to 12 decimal places — aligned with the `Decimal(24, 12)` Prisma
 * columns. More than one separator is rejected. Positiveness/finiteness is
 * validated with Decimal.js (never native float parsing).
 */
const QUANTITY_REGEX = /^\d+(\.\d{1,12})?$/;
const QUANTITY_MESSAGE = 'Must be a valid positive decimal number (max 12 decimals)';

function normalizeQuantitySeparator(value: string): string {
  const trimmed = value.trim();
  const separatorCount = (trimmed.match(/[.,]/g) ?? []).length;
  // More than one separator (e.g. "1,234.5" or "1,2,3") is never a valid
  // quantity: leave it untouched so the regex below rejects it.
  if (separatorCount > 1) return trimmed;
  return trimmed.includes(',') ? trimmed.replace(',', '.') : trimmed;
}

const DecimalQuantitySchema = z.preprocess(
  (value) => (typeof value === 'string' ? normalizeQuantitySeparator(value) : value),
  z
    .string()
    .regex(QUANTITY_REGEX, QUANTITY_MESSAGE)
    .refine(
      (val) => {
        // `new Decimal(...)` throws a DecimalError on malformed input; guard it
        // so an invalid quantity is always surfaced as a Zod validation issue
        // (VALIDATION_ERROR) instead of leaking a raw DecimalError.
        try {
          const num = new Decimal(val);
          return num.isFinite() && num.greaterThan(0);
        } catch {
          return false;
        }
      },
      { message: 'Quantity must be positive and finite' }
    )
);

/**
 * Trade date: coerces to a Date and rejects future dates (a trade can be
 * registered on a past date — historical backfill — but never in the future).
 *
 * `null` is normalized to `NaN` before coercion: `new Date(null)` would
 * otherwise silently resolve to the 1970 epoch.
 */
const TradeDateSchema = z
  .preprocess((value) => (value === null ? Number.NaN : value), z.coerce.date())
  .refine((date) => !Number.isNaN(date.getTime()), {
    message: 'Trade date must be a valid date',
  })
  .refine((date) => date.getTime() <= Date.now(), {
    message: 'Trade date cannot be in the future',
  });

/**
 * Create investment account schema
 */
export const CreateInvestmentAccountSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  name: z.string().min(1).max(100),
  currency: InvestmentCurrencySchema,
  initialBalanceCents: z
    .number()
    .int('Balance must be an integer')
    .min(0, 'Balance cannot be negative')
    .max(MAX_SAFE_CENTS, 'Balance exceeds maximum safe value')
    .default(0),
});

/**
 * Deposit from bank account (COP) to investment account (USD/EUR) schema
 */
export const DepositToInvestmentSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  investmentAccountId: CUIDSchema,
  fromBankAccountId: CUIDSchema,
  amountCents: z
    .number()
    .int('Amount must be an integer')
    .min(1, 'Amount must be at least 1 cent')
    .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value'),
  exchangeRate: z
    .number()
    .positive('Exchange rate must be positive')
    .min(1000, 'Exchange rate seems unrealistic')
    .max(6000, 'Exchange rate seems unrealistic'),
  description: z.string().max(500).optional(),
});

/**
 * Withdraw from investment account (USD/EUR) to bank account (COP) schema
 */
export const WithdrawFromInvestmentSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  investmentAccountId: CUIDSchema,
  toBankAccountId: CUIDSchema,
  amountCents: z
    .number()
    .int('Amount must be an integer')
    .min(1, 'Amount must be at least 1 cent')
    .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value'),
  exchangeRate: z
    .number()
    .positive('Exchange rate must be positive')
    .min(1000, 'Exchange rate seems unrealistic')
    .max(6000, 'Exchange rate seems unrealistic'),
  description: z.string().max(500).optional(),
});

/**
 * Buy asset schema
 */
export const BuyAssetSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  accountId: CUIDSchema,
  symbol: z.string().min(1).max(20).toUpperCase(),
  name: z.string().min(1).max(200),
  quantity: DecimalQuantitySchema,
  pricePerShareCents: z
    .number()
    .int('Price must be an integer')
    .min(1, 'Price must be at least 1 cent')
    .max(MAX_SAFE_CENTS, 'Price exceeds maximum safe value'),
  description: z.string().max(500).optional(),
  /** Trade date (defaults to now). Historical tickets are allowed. */
  date: TradeDateSchema.optional(),
  /** Explicit user confirmation to accept a price outside the ±2% tolerance. */
  allowPriceOverride: z.boolean().optional().default(false),
});

/**
 * Sell asset schema
 */
export const SellAssetSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  holdingId: CUIDSchema,
  quantity: DecimalQuantitySchema,
  pricePerShareCents: z
    .number()
    .int('Price must be an integer')
    .min(1, 'Price must be at least 1 cent')
    .max(MAX_SAFE_CENTS, 'Price exceeds maximum safe value'),
  description: z.string().max(500).optional(),
  /** Trade date (defaults to now). Historical tickets are allowed. */
  date: TradeDateSchema.optional(),
  /** Explicit user confirmation to accept a price outside the ±2% tolerance. */
  allowPriceOverride: z.boolean().optional().default(false),
});

/**
 * Update an existing investment trade (BUY/SELL). Every field is optional; the
 * service recomputes `amountCents` and the holding from the resulting ledger.
 *
 * NOTE: `idempotencyKey` is kept for client contract only. Effective
 * idempotency for this action is STATE-based (editing/reversing an already
 * terminal trade is a no-op), not key-based.
 */
export const UpdateInvestmentTradeSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  transactionId: CUIDSchema,
  quantity: DecimalQuantitySchema.optional(),
  pricePerShareCents: z
    .number()
    .int('Price must be an integer')
    .min(1, 'Price must be at least 1 cent')
    .max(MAX_SAFE_CENTS, 'Price exceeds maximum safe value')
    .optional(),
  date: TradeDateSchema.optional(),
  description: z.string().max(500).optional(),
  /** Explicit user confirmation to accept a price outside the ±2% tolerance. */
  allowPriceOverride: z.boolean().optional().default(false),
});

/**
 * Reverse (undo) an investment trade. Always available — no time window.
 *
 * NOTE: `idempotencyKey` is kept for client contract only. Effective
 * idempotency is STATE-based (reversing an already reversed trade returns
 * `wasIdempotent: true`), not key-based.
 */
export const ReverseInvestmentTradeSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  transactionId: CUIDSchema,
});

/**
 * Update asset price schema
 */
export const UpdateAssetPriceSchema = z.object({
  holdingId: CUIDSchema,
  currentPriceCents: z
    .number()
    .int('Price must be an integer')
    .min(0, 'Price cannot be negative')
    .max(MAX_SAFE_CENTS, 'Price exceeds maximum safe value'),
});

/**
 * Get investment transactions schema
 */
export const GetInvestmentTransactionsSchema = z.object({
  accountId: CUIDSchema,
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

/**
 * Get stock price schema
 */
export const GetStockPriceSchema = z.object({
  symbol: z.string().min(1).max(20).toUpperCase(),
});

/**
 * Get current exchange rate schema
 * `currency` is the foreign currency the COP rate is quoted against
 * (defaults to USD); the returned rate is expressed in COP per foreign unit.
 */
export const GetExchangeRateSchema = z.object({
  currency: z.enum(['USD', 'EUR']).optional().default('USD'),
});

// ============================================================================
// Type Exports
// ============================================================================

export type CreateInvestmentAccountInput = z.infer<typeof CreateInvestmentAccountSchema>;
export type DepositToInvestmentInput = z.infer<typeof DepositToInvestmentSchema>;
export type WithdrawFromInvestmentInput = z.infer<typeof WithdrawFromInvestmentSchema>;
export type BuyAssetInput = z.infer<typeof BuyAssetSchema>;
export type SellAssetInput = z.infer<typeof SellAssetSchema>;
export type UpdateInvestmentTradeInput = z.infer<typeof UpdateInvestmentTradeSchema>;
export type ReverseInvestmentTradeInput = z.infer<typeof ReverseInvestmentTradeSchema>;
export type UpdateAssetPriceInput = z.infer<typeof UpdateAssetPriceSchema>;
export type GetInvestmentTransactionsInput = z.infer<typeof GetInvestmentTransactionsSchema>;
export type GetStockPriceInput = z.infer<typeof GetStockPriceSchema>;
export type GetExchangeRateInput = z.infer<typeof GetExchangeRateSchema>;
