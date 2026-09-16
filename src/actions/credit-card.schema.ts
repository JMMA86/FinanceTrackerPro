import { z } from 'zod';
import { CardNetworkSchema, CUID } from './account.schema';
import { CurrencySchema, MAX_SAFE_CENTS } from '@/lib/validations/finance';

const UUIDv4 = z.uuid('Must be a valid UUID v4');

// Same name rules as bank accounts (AccountName in account.schema.ts)
const CardName = z
  .string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .trim()
  .regex(/^[\w\s\-áéíóúÁÉÍÓÚñÑüÜ]+$/, 'Name contains invalid characters');

const CreditLimitCents = z
  .number()
  .int('Credit limit must be an integer')
  .min(1, 'Credit limit must be positive')
  .max(MAX_SAFE_CENTS, 'Credit limit exceeds maximum safe value');

const DayOfMonth = z
  .number()
  .int('Day must be an integer')
  .min(1, 'Day must be between 1 and 31')
  .max(31, 'Day must be between 1 and 31');

const CardColor = z.string().max(50, 'Color too long').optional();

/**
 * Create credit card validation schema
 * RULE 12: Idempotency key UUID v4
 * RULE 5: Server-side validation
 */
export const CreateCreditCardSchema = z
  .object({
    idempotencyKey: UUIDv4,
    name: CardName,
    currency: CurrencySchema,
    creditLimitCents: CreditLimitCents,
    cutoffDay: DayOfMonth,
    paymentDueDay: DayOfMonth,
    cardColor: CardColor,
    cardNetwork: CardNetworkSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.cutoffDay === data.paymentDueDay) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentDueDay'],
        message: 'Payment due day cannot be the same as the cutoff day',
      });
    }
  });

/**
 * Update credit card validation schema
 * Only editable card attributes are accepted — NEVER balanceCents.
 */
export const UpdateCreditCardSchema = z
  .object({
    accountId: CUID,
    name: CardName.optional(),
    creditLimitCents: CreditLimitCents.optional(),
    cutoffDay: DayOfMonth.optional(),
    paymentDueDay: DayOfMonth.optional(),
    cardColor: CardColor,
    cardNetwork: CardNetworkSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.cutoffDay !== undefined &&
      data.paymentDueDay !== undefined &&
      data.cutoffDay === data.paymentDueDay
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentDueDay'],
        message: 'Payment due day cannot be the same as the cutoff day',
      });
    }
  });

/**
 * Delete credit card validation schema
 */
export const DeleteCreditCardSchema = z.object({
  accountId: CUID,
});

/**
 * Pay credit card validation schema
 * RULE 12: Idempotency key UUID v4
 * Double-entry: EXPENSE on source account + CREDIT_PAYMENT on the card
 */
export const PayCreditCardSchema = z
  .object({
    idempotencyKey: UUIDv4,
    accountId: CUID, // The credit card being paid
    sourceAccountId: CUID, // Bank account funding the payment
    amountCents: z
      .number()
      .int('Amount must be an integer')
      .min(1, 'Amount must be positive')
      .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value'),
    currency: CurrencySchema,
    description: z.string().max(500, 'Description too long').optional(),
    date: z.coerce.date().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.accountId === data.sourceAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['sourceAccountId'],
        message: 'Cannot pay a card from itself',
      });
    }
  });

/**
 * Get credit card statement validation schema
 */
export const GetCreditCardStatementSchema = z.object({
  accountId: CUID,
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
});

/**
 * Get all credit cards validation schema
 */
export const GetCreditCardsSchema = z.object({});

export type CreateCreditCardInput = z.infer<typeof CreateCreditCardSchema>;
export type UpdateCreditCardInput = z.infer<typeof UpdateCreditCardSchema>;
export type DeleteCreditCardInput = z.infer<typeof DeleteCreditCardSchema>;
export type PayCreditCardInput = z.infer<typeof PayCreditCardSchema>;
export type GetCreditCardStatementInput = z.infer<typeof GetCreditCardStatementSchema>;
export type GetCreditCardsInput = z.infer<typeof GetCreditCardsSchema>;
