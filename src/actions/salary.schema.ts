/**
 * Salary & Projection Validation Schemas (Zod)
 *
 * Server-side validation following CLAUDE.md Rule 5 (zero trust). The client
 * validates for UX only; every Server Action re-validates here before writing.
 *
 * Rule 2: money is always integer cents bounded by MIN/MAX_SAFE_CENTS.
 * Rule 4: `currency` is mandatory on every monetary amount (COP by default).
 */

import { z } from 'zod';
import type { SalaryFrequency } from '@prisma/client';
import { CurrencySchema, MAX_SAFE_CENTS, MIN_SAFE_CENTS } from '@/lib/validations/finance';
import { CUID } from './account.schema';

/** Recurrence of the salary amount (amount PER period). Mirrors `SalaryFrequency`. */
export const SalaryFrequencySchema = z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY']);

/** Recurrence of a bonus anchored on `anchorMonth`. Mirrors `BonusFrequency`. */
export const BonusFrequencySchema = z.enum([
  'MONTHLY',
  'BIMONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
]);

/** Integer cents bounded to the safe monetary range (never negative/overflowing). */
const SafeCentsSchema = z
  .number()
  .int('El monto debe ser un entero (centavos)')
  .min(MIN_SAFE_CENTS, 'El monto debe ser mayor que cero')
  .max(MAX_SAFE_CENTS, 'El monto excede el máximo permitido');

/**
 * Payment days for the salary recurrence. The INTERPRETATION depends on
 * `frequency` (enforced by {@link refinePayDaysByFrequency}):
 *   WEEKLY   -> exactly 1 value 1..7  (ISO weekday: 1=Monday … 7=Sunday)
 *   BIWEEKLY -> exactly 2 values 1..31 (days of the MONTH, clamped to end of month)
 *   MONTHLY  -> exactly 1 value 1..31 (day of the MONTH, clamped to end of month)
 *
 * The generic bounds (1..2 items, each 1..31) are validated here; the
 * frequency-specific shape is cross-field and therefore a `superRefine`.
 */
const PayDaysSchema = z
  .array(
    z
      .number()
      .int('El día de pago debe ser un entero')
      .min(1, 'El día de pago debe estar entre 1 y 31')
      .max(31, 'El día de pago debe estar entre 1 y 31')
  )
  .min(1, 'Debes indicar al menos un día de pago')
  .max(2, 'Se permiten como máximo 2 días de pago');

/**
 * Cross-field validation of `payDays` against `frequency` (Rule 5). Messages are
 * intentionally specific so the UI can surface an actionable error.
 */
function refinePayDaysByFrequency(
  data: { frequency: SalaryFrequency; payDays: number[] },
  ctx: z.RefinementCtx
): void {
  if (data.frequency === 'WEEKLY') {
    if (data.payDays.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['payDays'],
        message: 'Para pago semanal debes indicar exactamente 1 día de la semana',
      });
      return;
    }
    const day = data.payDays[0];
    if (day < 1 || day > 7) {
      ctx.addIssue({
        code: 'custom',
        path: ['payDays'],
        message: 'El día de la semana debe estar entre 1 (lunes) y 7 (domingo)',
      });
    }
    return;
  }

  if (data.frequency === 'MONTHLY') {
    if (data.payDays.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['payDays'],
        message: 'Para pago mensual debes indicar exactamente 1 día del mes (1-31)',
      });
    }
    return;
  }

  // BIWEEKLY
  if (data.payDays.length !== 2) {
    ctx.addIssue({
      code: 'custom',
      path: ['payDays'],
      message: 'Para pago quincenal debes indicar exactamente 2 días del mes (1-31)',
    });
  }
}

/**
 * A single salary configuration (1:1 with the session user).
 *
 * The recurrence is defined by `payDays` interpreted per `frequency`; there is
 * no single-date anchor anymore (`nextPayDate` was removed).
 */
const SalaryConfigurationBaseSchema = z.object({
  amountCents: SafeCentsSchema,
  currency: CurrencySchema.default('COP'),
  frequency: SalaryFrequencySchema.default('MONTHLY'),
  payDays: PayDaysSchema,
});

export const SalaryConfigurationSchema =
  SalaryConfigurationBaseSchema.superRefine(refinePayDaysByFrequency);

export type SalaryConfigurationInput = z.infer<typeof SalaryConfigurationBaseSchema>;

/**
 * A declared bonus. `id` present = update of an existing row (ownership is
 * verified server-side); absent = create with a server-generated idempotencyKey.
 */
export const SalaryBonusSchema = z.object({
  id: CUID.optional(),
  name: z.string().min(1, 'El nombre es obligatorio').max(100, 'Nombre demasiado largo').trim(),
  amountCents: SafeCentsSchema,
  currency: CurrencySchema.default('COP'),
  frequency: BonusFrequencySchema,
  /** First occurrence month of the year (1-12). */
  anchorMonth: z.number().int().min(1, 'Mes inválido').max(12, 'Mes inválido'),
  /** Optional day within the month (clamped to the end of the month). */
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
});

export type SalaryBonusInput = z.infer<typeof SalaryBonusSchema>;

/** Maximum bonuses accepted per save (defensive bound; UI caps lower). */
export const MAX_SALARY_BONUSES = 20;

/**
 * Full save payload: the salary configuration plus the COMPLETE desired set of
 * bonuses. Bonuses omitted from this list are soft-deleted (Rule 4) — the client
 * always sends the whole list, never a partial diff.
 */
export const SaveSalaryConfigurationSchema = SalaryConfigurationBaseSchema.extend({
  bonuses: z
    .array(SalaryBonusSchema)
    .max(MAX_SALARY_BONUSES, `No se permiten más de ${MAX_SALARY_BONUSES} primas`)
    .default([]),
}).superRefine(refinePayDaysByFrequency);

export type SaveSalaryConfigurationInput = z.infer<typeof SaveSalaryConfigurationSchema>;

/**
 * Projection settings: the configurable savings target. The amount is a MONTHLY
 * figure stored exactly as entered (no round-trip drift). It is expressed in COP
 * (the projection is COP-only by product decision), so the currency is FORCED to
 * COP instead of being user-selectable.
 */
export const ProjectionSettingsSchema = z.object({
  monthlySavingsTargetCents: z
    .number()
    .int('La meta debe ser un entero (centavos)')
    .min(0, 'La meta no puede ser negativa')
    .max(MAX_SAFE_CENTS, 'La meta excede el máximo permitido'),
  currency: z.literal('COP').default('COP'),
});

export type ProjectionSettingsInput = z.infer<typeof ProjectionSettingsSchema>;
