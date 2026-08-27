import { z } from 'zod';
import { CurrencySchema, MAX_SAFE_CENTS } from '@/lib/validations/finance';

/**
 * CUID format validation (Prisma default)
 */
export const CUID = z.string().regex(/^c[a-z0-9]{20,}$/, 'Must be a valid CUID');

/**
 * UUID v4 format validation
 */
const UUIDv4 = z.uuid('Must be a valid UUID v4');

/**
 * Savings goal type enum
 */
export const SavingsGoalTypeSchema = z.enum(['ANNUAL', 'SHORT_TERM', 'EMERGENCY', 'CUSTOM']);

/**
 * Savings goal status enum
 */
export const SavingsGoalStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'CANCELLED']);

/**
 * Create savings goal validation schema
 */
export const CreateSavingsGoalSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
  description: z.string().max(500).optional(),
  type: SavingsGoalTypeSchema.default('CUSTOM'),
  targetAmountCents: z
    .number()
    .int('Target amount must be an integer')
    .min(1, 'Target amount must be positive')
    .max(MAX_SAFE_CENTS, 'Target amount exceeds maximum safe value'),
  currency: CurrencySchema.default('COP'),
  deadline: z.coerce
    .date()
    .optional()
    .refine(
      (date) => {
        if (!date) return true;
        return date > new Date();
      },
      {
        message: 'Deadline must be in the future',
      }
    ),
  monthlyContributionCents: z
    .number()
    .int('Monthly contribution must be an integer')
    .min(1, 'Monthly contribution must be positive')
    .max(MAX_SAFE_CENTS, 'Monthly contribution exceeds maximum safe value')
    .optional(),
  linkedAccountId: CUID.optional(),
  color: z.string().max(50).optional(),
  icon: z.string().max(50).optional(),
});

/**
 * Update savings goal validation schema
 */
export const UpdateSavingsGoalSchema = z.object({
  goalId: CUID,
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim().optional(),
  description: z.string().max(500).optional(),
  targetAmountCents: z
    .number()
    .int('Target amount must be an integer')
    .min(1, 'Target amount must be positive')
    .max(MAX_SAFE_CENTS, 'Target amount exceeds maximum safe value')
    .optional(),
  deadline: z.coerce
    .date()
    .optional()
    .refine(
      (date) => {
        if (!date) return true;
        return date > new Date();
      },
      {
        message: 'Deadline must be in the future',
      }
    ),
  monthlyContributionCents: z
    .number()
    .int('Monthly contribution must be an integer')
    .min(1, 'Monthly contribution must be positive')
    .max(MAX_SAFE_CENTS, 'Monthly contribution exceeds maximum safe value')
    .optional(),
  color: z.string().max(50).optional(),
  status: SavingsGoalStatusSchema.optional(),
});

/**
 * Contribute to goal validation schema
 * RULE 12: Idempotency key UUID v4
 */
export const ContributeToGoalSchema = z.object({
  goalId: CUID,
  amountCents: z
    .number()
    .int('Amount must be an integer')
    .min(1, 'Amount must be positive')
    .max(MAX_SAFE_CENTS, 'Amount exceeds maximum safe value'),
  currency: CurrencySchema,
  sourceAccountId: CUID.optional(),
  notes: z.string().max(500).optional(),
  idempotencyKey: UUIDv4,
});

/**
 * Get savings summary validation schema
 */
export const GetSavingsSummarySchema = z.object({
  month: z.number().int().min(1).max(12).optional(),
  year: z.number().int().min(2000).max(2100).optional(),
});

/**
 * Calculate max spendable validation schema
 */
export const CalculateMaxSpendableSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
});

/**
 * Delete savings goal validation schema
 */
export const DeleteSavingsGoalSchema = z.object({
  goalId: CUID,
});

/**
 * Get savings goals validation schema
 */
export const GetSavingsGoalsSchema = z.object({
  status: SavingsGoalStatusSchema.optional(),
});

export type CreateSavingsGoalInput = z.infer<typeof CreateSavingsGoalSchema>;
export type UpdateSavingsGoalInput = z.infer<typeof UpdateSavingsGoalSchema>;
export type ContributeToGoalInput = z.infer<typeof ContributeToGoalSchema>;
export type GetSavingsSummaryInput = z.infer<typeof GetSavingsSummarySchema>;
export type CalculateMaxSpendableInput = z.infer<typeof CalculateMaxSpendableSchema>;
export type DeleteSavingsGoalInput = z.infer<typeof DeleteSavingsGoalSchema>;
export type GetSavingsGoalsInput = z.infer<typeof GetSavingsGoalsSchema>;
