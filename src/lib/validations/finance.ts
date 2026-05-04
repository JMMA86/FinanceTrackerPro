/**
 * Financial Validation Schemas (Zod)
 * Server-side validation following CLAUDE.md Rule 5
 * SECURITY: Includes integer overflow protection with MAX_SAFE_CENTS
 */

import { z } from 'zod';

/**
 * Maximum safe cents value (9999999999999 = $99,999,999,999.99)
 * Prevents Integer.MAX_SAFE_INTEGER overflow
 */
export const MAX_SAFE_CENTS = 9999999999999;

/**
 * Minimum safe cents value (for transfers)
 */
export const MIN_SAFE_CENTS = 1;

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

    // Amount in cents (positive integer with overflow protection)
    amountCents: z
      .number()
      .int('Amount must be an integer')
      .min(MIN_SAFE_CENTS, 'Amount must be at least 1 cent')
      .max(MAX_SAFE_CENTS, `Amount cannot exceed ${MAX_SAFE_CENTS} cents`),
      // NOTE: For transfers, negative amounts are handled by the business logic
      // This validates the absolute value

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
  initialBalanceCents: z
    .number()
    .int('Balance must be an integer')
    .min(-MAX_SAFE_CENTS, 'Balance cannot exceed negative limit')
    .max(MAX_SAFE_CENTS, 'Balance cannot exceed maximum')
    .default(0),

  // Credit card specific
  creditLimitCents: z
    .number()
    .int('Credit limit must be an integer')
    .min(MIN_SAFE_CENTS, 'Credit limit must be at least 1 cent')
    .max(MAX_SAFE_CENTS, 'Credit limit cannot exceed maximum')
    .optional(),
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
 * SECURITY: Includes integer overflow protection
 */
export const CreateTransactionSchema = z
  .object({
    idempotencyKey: UUIDv4Schema,
    userId: CUIDSchema,
    accountId: CUIDSchema,
    type: TransactionTypeSchema,
    amountCents: z
      .number()
      .int('Amount must be an integer')
      .min(-MAX_SAFE_CENTS, 'Amount magnitude exceeds safe limit')
      .max(MAX_SAFE_CENTS, 'Amount magnitude exceeds safe limit'),
    currency: CurrencySchema,
    description: z.string().max(500).optional(),
    date: z.coerce.date().optional(),

    // Currency conversion (optional)
    originalAmountCents: z
      .number()
      .int('Original amount must be an integer')
      .min(-MAX_SAFE_CENTS, 'Original amount magnitude exceeds safe limit')
      .max(MAX_SAFE_CENTS, 'Original amount magnitude exceeds safe limit')
      .optional(),
    originalCurrency: CurrencySchema.optional(),
    exchangeRate: z.number().positive().max(1000).optional(),

    // Category
    categoryId: CUIDSchema.optional(),
  })
  .refine(
    (data) => {
      // For TRANSFER_OUT, amount must be negative
      if (data.type === 'TRANSFER_OUT' && data.amountCents >= 0) {
        return false;
      }
      // For TRANSFER_IN, amount must be positive
      if (data.type === 'TRANSFER_IN' && data.amountCents <= 0) {
        return false;
      }
      return true;
    },
    {
      message: 'Transfer amounts must have correct sign (negative for OUT, positive for IN)',
      path: ['amountCents'],
    }
  );

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;

/**
 * Update account balance validation
 * SECURITY: Includes overflow protection
 */
export const UpdateAccountBalanceSchema = z.object({
  accountId: CUIDSchema,
  newBalanceCents: z
    .number()
    .int('Balance must be an integer')
    .min(-MAX_SAFE_CENTS, 'Balance cannot exceed negative limit')
    .max(MAX_SAFE_CENTS, 'Balance cannot exceed maximum'),
  lastModifiedBy: z.string(),
});

/**
 * Currency conversion validation
 */
export const CurrencyConversionSchema = z
  .object({
    amountCents: z
      .number()
      .int('Amount must be an integer')
      .min(MIN_SAFE_CENTS, 'Amount must be at least 1 cent')
      .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value'),
    fromCurrency: CurrencySchema,
    toCurrency: CurrencySchema,
    exchangeRate: z
      .number()
      .positive('Exchange rate must be positive')
      .max(10000, 'Exchange rate seems unrealistic'),
  })
  .refine((data) => data.fromCurrency !== data.toCurrency, {
    message: 'Source and destination currencies must be different',
  });

export type CurrencyConversionInput = z.infer<typeof CurrencyConversionSchema>;

/**
 * Reversal action validation
 */
export const ReversalSchema = z.object({
  transferId: CUIDSchema,
  userId: CUIDSchema,
});

export type ReversalInput = z.infer<typeof ReversalSchema>;
