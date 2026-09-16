import { z } from 'zod';
import { CurrencySchema, MAX_SAFE_CENTS } from '@/lib/validations/finance';
import { CUID } from './savings.schema';

/**
 * UUID v4 format validation (Rule 12 — idempotency).
 * Mirrors the strict v4 regex used in `@/lib/validations/finance`.
 */
const UUIDv4 = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'Must be a valid UUID v4'
  );

/**
 * Fixed expense recurrence frequency (mirrors the Prisma enum).
 */
export const FixedExpenseFrequencySchema = z.enum([
  'DAILY',
  'WEEKLY',
  'BIWEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]);

/**
 * Create fixed expense validation schema
 */
export const CreateFixedExpenseSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
    description: z.string().max(500).optional(),
    amountCents: z
      .number()
      .int('Amount must be an integer')
      .min(1, 'Amount must be positive')
      .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value'),
    currency: CurrencySchema.default('COP'),
    frequency: FixedExpenseFrequencySchema,
    dayOfPayment: z.number().int().min(1).max(31).optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
    color: z.string().max(50).optional(),
    icon: z.string().max(50).optional(),
  })
  .refine((data) => data.endDate === undefined || data.endDate > data.startDate, {
    message: 'End date must be after start date',
    path: ['endDate'],
  });

/**
 * Update fixed expense validation schema.
 * Every field except the id is optional; `endDate` accepts null to clear it.
 */
export const UpdateFixedExpenseSchema = z
  .object({
    fixedExpenseId: CUID,
    name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim().optional(),
    description: z.string().max(500).optional(),
    amountCents: z
      .number()
      .int('Amount must be an integer')
      .min(1, 'Amount must be positive')
      .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value')
      .optional(),
    currency: CurrencySchema.optional(),
    frequency: FixedExpenseFrequencySchema.optional(),
    dayOfPayment: z.number().int().min(1).max(31).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullable().optional(),
    color: z.string().max(50).optional(),
    icon: z.string().max(50).optional(),
  })
  // When BOTH dates are supplied, the end date must be strictly after the start
  // (`null` means "clear the end date" and is always valid).
  .refine(
    (data) =>
      data.startDate === undefined ||
      data.endDate === undefined ||
      data.endDate === null ||
      data.endDate > data.startDate,
    {
      message: 'End date must be after start date',
      path: ['endDate'],
    }
  );

/**
 * Soft-delete a fixed expense template.
 */
export const DeleteFixedExpenseSchema = z.object({
  fixedExpenseId: CUID,
});

/**
 * Get fixed expenses (optionally including soft-deleted templates).
 */
export const GetFixedExpensesSchema = z.object({
  includeInactive: z.boolean().optional(),
});

/**
 * Get the materialized payments of a template (optionally month-filtered).
 */
export const GetFixedExpensePaymentsSchema = z.object({
  fixedExpenseId: CUID.optional(),
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
});

/**
 * Get the per-currency fixed expenses summary for a month.
 */
export const GetFixedExpensesSummarySchema = z.object({
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
});

/**
 * Pay a materialized fixed expense payment.
 * RULE 12: idempotency key UUID v4.
 */
export const PayFixedExpenseSchema = z.object({
  paymentId: CUID,
  accountId: CUID,
  amountCents: z
    .number()
    .int('Amount must be an integer')
    .min(1, 'Amount must be positive')
    .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value')
    .optional(),
  date: z.coerce.date().optional(),
  notes: z.string().max(500).optional(),
  idempotencyKey: UUIDv4,
});

export type CreateFixedExpenseInput = z.infer<typeof CreateFixedExpenseSchema>;
export type UpdateFixedExpenseInput = z.infer<typeof UpdateFixedExpenseSchema>;
export type DeleteFixedExpenseInput = z.infer<typeof DeleteFixedExpenseSchema>;
export type GetFixedExpensesInput = z.infer<typeof GetFixedExpensesSchema>;
export type GetFixedExpensePaymentsInput = z.infer<typeof GetFixedExpensePaymentsSchema>;
export type GetFixedExpensesSummaryInput = z.infer<typeof GetFixedExpensesSummarySchema>;
export type PayFixedExpenseInput = z.infer<typeof PayFixedExpenseSchema>;
