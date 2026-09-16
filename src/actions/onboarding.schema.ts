import { z } from 'zod';
import { CurrencySchema } from '@/lib/validations/finance';
import { ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding/steps';

/**
 * Persist the current onboarding walkthrough step.
 * The upper bound is derived from the shared step list so it can never drift.
 */
export const SaveOnboardingStepSchema = z.object({
  step: z
    .number()
    .int('Step must be an integer')
    .min(0, 'Step cannot be negative')
    .max(ONBOARDING_TOTAL_STEPS - 1, 'Step exceeds the last onboarding step'),
});

/** Prisma `Language` enum values, used for server-side localized defaults. */
export const LanguageSchema = z.enum(['SPANISH', 'ENGLISH', 'GERMAN']);

/**
 * Persist the user's onboarding preferences.
 * Both fields are optional so the caller can update either one, but at least
 * one must be provided. `CurrencySchema` is the single ISO 4217 source of
 * truth for the app; `language` mirrors the Prisma `Language` enum.
 */
export const UpdateOnboardingPreferencesSchema = z
  .object({
    baseCurrency: CurrencySchema.optional(),
    language: LanguageSchema.optional(),
  })
  .refine((data) => data.baseCurrency !== undefined || data.language !== undefined, {
    message: 'At least one preference must be provided',
  });

export type SaveOnboardingStepInput = z.infer<typeof SaveOnboardingStepSchema>;
export type UpdateOnboardingPreferencesInput = z.infer<typeof UpdateOnboardingPreferencesSchema>;
