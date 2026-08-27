/**
 * Investment Schemas (Zod)
 * Server-side validation for investment operations
 * Follows CLAUDE.md Rules 5, 12
 */

import { z } from 'zod';
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
 * Positive decimal string for quantities (supports fractional shares)
 */
const DecimalQuantitySchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'Must be a valid positive decimal number')
  .refine(
    (val) => {
      const num = Number.parseFloat(val);
      return num > 0 && Number.isFinite(num);
    },
    { message: 'Quantity must be positive and finite' }
  );

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
    .max(10000, 'Exchange rate seems unrealistic'),
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

// ============================================================================
// Type Exports
// ============================================================================

export type CreateInvestmentAccountInput = z.infer<typeof CreateInvestmentAccountSchema>;
export type DepositToInvestmentInput = z.infer<typeof DepositToInvestmentSchema>;
export type BuyAssetInput = z.infer<typeof BuyAssetSchema>;
export type SellAssetInput = z.infer<typeof SellAssetSchema>;
export type UpdateAssetPriceInput = z.infer<typeof UpdateAssetPriceSchema>;
export type GetInvestmentTransactionsInput = z.infer<typeof GetInvestmentTransactionsSchema>;
export type GetStockPriceInput = z.infer<typeof GetStockPriceSchema>;
