/**
 * Financial Validation Schemas (Zod)
 * Server-side validation following CLAUDE.md Rule 5
 */

import { z } from 'zod';

/**
 * ISO 4217 Currency codes supported
 */
export const CurrencySchema = z.enum(['USD', 'EUR', 'GBP', 'COP', 'MXN']);

/**
 * Account types
 */
export const AccountTypeSchema = z.enum(['SAVINGS', 'INVESTMENT', 'CREDIT_CARD', 'POCKET']);

/**
 * Transaction types
 */
export const TransactionTypeSchema = z.enum([
  'INCOME',
  'EXPENSE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'INVESTMENT',
  'LOAN_PAYMENT',
  'CREDIT_PAYMENT',
]);

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
 * Transfer between accounts validation schema
 * RULE 3: Atomic transactions
 * RULE 12: Idempotency
 */
export const TransferSchema = z
  .object({
    // Idempotency key (UUID v4 from client)
    idempotencyKey: UUIDv4Schema,

    // Source account
    fromAccountId: CUIDSchema,

    // Destination account
    toAccountId: CUIDSchema,

    // Amount in cents (positive integer)
    amountCents: z.number().int().positive('Amount must be positive'),

    // Currency (same for both accounts in this version)
    currency: CurrencySchema,

    // Optional description
    description: z.string().max(500).optional(),

    // Transaction date (defaults to now if not provided)
    date: z.coerce.date().optional(),

    // User ID (for verification)
    userId: CUIDSchema,
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: 'Cannot transfer to the same account',
    path: ['toAccountId'],
  });

export type TransferInput = z.infer<typeof TransferSchema>;

/**
 * Create account validation schema
 */
export const CreateAccountSchema = z.object({
  userId: CUIDSchema,
  name: z.string().min(1).max(100),
  type: AccountTypeSchema,
  currency: CurrencySchema.default('COP'),
  initialBalanceCents: z.number().int().default(0),

  // Credit card specific
  creditLimitCents: z.number().int().positive().optional(),
  cutoffDay: z.number().int().min(1).max(31).optional(),
  paymentDueDay: z.number().int().min(1).max(31).optional(),

  // Investment/Savings specific
  interestRateEA: z.number().nonnegative().max(100).optional(),

  // Pocket specific
  parentAccountId: CUIDSchema.optional(),
});

export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

/**
 * Create transaction validation schema
 */
export const CreateTransactionSchema = z.object({
  idempotencyKey: UUIDv4Schema,
  userId: CUIDSchema,
  accountId: CUIDSchema,
  type: TransactionTypeSchema,
  amountCents: z.number().int(),
  currency: CurrencySchema,
  description: z.string().max(500).optional(),
  date: z.coerce.date().optional(),

  // Currency conversion (optional)
  originalAmountCents: z.number().int().optional(),
  originalCurrency: CurrencySchema.optional(),
  exchangeRate: z.number().positive().optional(),

  // Category
  categoryId: CUIDSchema.optional(),
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

/**
 * Update account balance validation
 */
export const UpdateAccountBalanceSchema = z.object({
  accountId: CUIDSchema,
  newBalanceCents: z.number().int(),
  lastModifiedBy: z.string(),
});

/**
 * Currency conversion validation
 */
export const CurrencyConversionSchema = z
  .object({
    amountCents: z.number().int().positive(),
    fromCurrency: CurrencySchema,
    toCurrency: CurrencySchema,
    exchangeRate: z.number().positive(),
  })
  .refine((data) => data.fromCurrency !== data.toCurrency, {
    message: 'Source and destination currencies must be different',
  });

export type CurrencyConversionInput = z.infer<typeof CurrencyConversionSchema>;
