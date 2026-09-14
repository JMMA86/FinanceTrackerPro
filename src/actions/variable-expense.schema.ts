import { z } from 'zod';
import { CurrencySchema, MAX_SAFE_CENTS } from '@/lib/validations/finance';
import { CUID } from './account.schema';

const Name = z.string().min(1, 'Name is required').max(100, 'Name too long').trim();
const Description = z.string().max(500, 'Description too long');
const Color = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid hex color');
const Icon = z.string().max(30, 'Icon name too long');
const ExpectedTimesPerMonth = z
  .number()
  .int('Times per month must be an integer')
  .min(1, 'Times per month must be positive')
  .max(31, 'Times per month cannot exceed 31');
const ExpectedAmountCents = z
  .number()
  .int('Expected amount must be an integer')
  .min(1, 'Expected amount must be positive')
  .max(MAX_SAFE_CENTS, 'Expected amount exceeds maximum safe value');

/** Create a monitored variable expense definition. */
export const CreateVariableExpenseSchema = z.object({
  name: Name,
  description: Description.optional(),
  color: Color.optional(),
  icon: Icon.optional(),
  categoryId: CUID,
  expectedTimesPerMonth: ExpectedTimesPerMonth.optional(),
  expectedAmountCents: ExpectedAmountCents.optional(),
  currency: CurrencySchema.default('COP'),
});

/**
 * Update a definition. The nullable monitoring targets distinguish "field
 * absent" (not touched) from `null` (explicitly cleared).
 */
export const UpdateVariableExpenseSchema = z.object({
  variableExpenseId: CUID,
  name: Name.optional(),
  description: Description.nullable().optional(),
  color: Color.nullable().optional(),
  icon: Icon.nullable().optional(),
  categoryId: CUID.optional(),
  expectedTimesPerMonth: ExpectedTimesPerMonth.nullable().optional(),
  expectedAmountCents: ExpectedAmountCents.nullable().optional(),
  currency: CurrencySchema.optional(),
});

export const DeleteVariableExpenseSchema = z.object({
  variableExpenseId: CUID,
});

export const GetVariableExpensesSchema = z.object({
  includeInactive: z.boolean().optional(),
});

export const GetVariableExpensesOverviewSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

export const GetVariableExpenseDetailSchema = z
  .object({
    variableExpenseId: CUID,
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
  })
  .refine((data) => (data.month === undefined) === (data.year === undefined), {
    message: 'month and year must be provided together',
    path: ['month'],
  });

export const GetVariableExpenseMovementsSchema = z
  .object({
    variableExpenseId: CUID.optional(),
    month: z.number().int().min(1).max(12).optional(),
    year: z.number().int().min(2000).max(2100).optional(),
  })
  .refine((data) => (data.month === undefined) === (data.year === undefined), {
    message: 'month and year must be provided together',
    path: ['month'],
  });

export type CreateVariableExpenseInput = z.infer<typeof CreateVariableExpenseSchema>;
export type UpdateVariableExpenseInput = z.infer<typeof UpdateVariableExpenseSchema>;
export type DeleteVariableExpenseInput = z.infer<typeof DeleteVariableExpenseSchema>;
export type GetVariableExpensesInput = z.infer<typeof GetVariableExpensesSchema>;
export type GetVariableExpensesOverviewInput = z.infer<typeof GetVariableExpensesOverviewSchema>;
export type GetVariableExpenseDetailInput = z.infer<typeof GetVariableExpenseDetailSchema>;
export type GetVariableExpenseMovementsInput = z.infer<typeof GetVariableExpenseMovementsSchema>;
