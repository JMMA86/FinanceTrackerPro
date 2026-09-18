'use client';

import { useCallback, useImperativeHandle, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Save } from 'lucide-react';
import type { Currency, SalaryFrequency } from '@prisma/client';
import { MAX_SAFE_CENTS, MIN_SAFE_CENTS } from '@/lib/validations/finance';
import { get } from '@/lib/i18n';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { BonusListEditor, CURRENCY_OPTIONS } from './BonusListEditor';
import type { BonusDraft } from './BonusListEditor';
import type { SaveSalaryConfigurationInput } from '@/actions/salary.schema';

/** Mirrors `MAX_SALARY_BONUSES` in the server schema (client UX bound). */
export const MAX_BONUSES = 20;

const SALARY_FREQUENCY_OPTIONS: ReadonlyArray<{
  readonly value: SalaryFrequency;
  readonly labelKey: string;
}> = [
  { value: 'MONTHLY', labelKey: 'frequencyMonthly' },
  { value: 'BIWEEKLY', labelKey: 'frequencyBiweekly' },
  { value: 'WEEKLY', labelKey: 'frequencyWeekly' },
];

/** ISO weekday options (1 = Monday … 7 = Sunday), mirroring the server schema. */
const WEEKDAY_OPTIONS: ReadonlyArray<{ readonly value: number; readonly labelKey: string }> = [
  { value: 1, labelKey: 'weekdayMonday' },
  { value: 2, labelKey: 'weekdayTuesday' },
  { value: 3, labelKey: 'weekdayWednesday' },
  { value: 4, labelKey: 'weekdayThursday' },
  { value: 5, labelKey: 'weekdayFriday' },
  { value: 6, labelKey: 'weekdaySaturday' },
  { value: 7, labelKey: 'weekdaySunday' },
];

const MIN_ISO_WEEKDAY = 1;
const MAX_ISO_WEEKDAY = 7;
const MIN_DAY_OF_MONTH = 1;
const MAX_DAY_OF_MONTH = 31;

const CURRENCY_VALUES = ['COP', 'USD', 'EUR'] as const;
const SALARY_FREQUENCY_VALUES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
const BONUS_FREQUENCY_VALUES = [
  'MONTHLY',
  'BIMONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL',
] as const;

/**
 * Sensible, always-valid `payDays` per frequency. Used as the form default and
 * whenever a frequency change (or legacy persisted data) makes the previous
 * days meaningless for the new interpretation.
 */
const DEFAULT_PAY_DAYS: Readonly<Record<SalaryFrequency, readonly number[]>> = {
  WEEKLY: [1],
  BIWEEKLY: [15, 30],
  MONTHLY: [30],
};

interface SalaryFormValues {
  amountCents: number;
  currency: Currency;
  frequency: SalaryFrequency;
  /**
   * Payment days interpreted per `frequency` (WEEKLY: 1 ISO weekday 1..7;
   * BIWEEKLY: 2 days of the month 1..31; MONTHLY: 1 day of the month 1..31).
   * A cleared number input is stored as `NaN` so the schema surfaces the
   * localized "required" message instead of silently dropping the entry.
   */
  payDays: number[];
  bonuses: BonusDraft[];
}

/** Persisted configuration used to seed the form (null = not configured). */
export interface SalaryFormConfiguration {
  amountCents: number;
  currency: Currency;
  frequency: SalaryFrequency;
  payDays: number[];
  bonuses: BonusDraft[];
}

export interface SalaryFormSubmitResult {
  success: boolean;
  /** Localized message shown inline when `success` is false. */
  error?: string;
}

/**
 * Outcome of a programmatic submit (`requestSubmit`), used by hosts that own
 * their own primary CTA (e.g. the onboarding wizard's "Continue" button).
 */
export type SalaryFormSubmitOutcome = 'saved' | 'invalid' | 'skipped';

/** Imperative API of `SalaryForm` for external CTAs. */
export interface SalaryFormHandle {
  /** Submits programmatically and reports what happened. */
  requestSubmit(): Promise<SalaryFormSubmitOutcome>;
}

interface SalaryFormProps {
  /** Dictionary holding the labels (settings or onboarding). */
  readonly dictionary: Record<string, unknown>;
  /** Dot-path prefix of the form labels, e.g. `salary.form`. */
  readonly prefix: string;
  readonly locale: string;
  /** Unique prefix for the DOM ids of this form instance. */
  readonly idPrefix: string;
  readonly initialConfiguration: SalaryFormConfiguration | null;
  readonly onSubmit: (input: SaveSalaryConfigurationInput) => Promise<SalaryFormSubmitResult>;
  readonly submitLabel?: string;
  readonly submitLabelBusy?: string;
  /**
   * Imperative handle for hosts that trigger the save from their own CTA. The
   * built-in "Save" button keeps working unchanged when this is omitted.
   */
  readonly submitRef?: React.RefObject<SalaryFormHandle | null>;
}

/** `{placeholder}` interpolation, mirroring the onboarding i18n helper. */
function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

function defaultPayDaysFor(frequency: SalaryFrequency): number[] {
  return [...DEFAULT_PAY_DAYS[frequency]];
}

function isIntegerInRange(value: number | undefined, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Coerces a persisted `payDays` into the exact shape its `frequency` requires.
 * A configuration saved under another frequency (or a legacy empty array) can
 * therefore never leave the form in an invalid state.
 */
function normalizePayDays(
  frequency: SalaryFrequency,
  payDays: readonly number[] | undefined
): number[] {
  const days = Array.isArray(payDays) ? payDays : [];

  if (frequency === 'WEEKLY') {
    const day = days.length === 1 ? days[0] : undefined;
    return isIntegerInRange(day, MIN_ISO_WEEKDAY, MAX_ISO_WEEKDAY)
      ? [day]
      : defaultPayDaysFor('WEEKLY');
  }

  if (frequency === 'MONTHLY') {
    const day = days.length === 1 ? days[0] : undefined;
    return isIntegerInRange(day, MIN_DAY_OF_MONTH, MAX_DAY_OF_MONTH)
      ? [day]
      : defaultPayDaysFor('MONTHLY');
  }

  const [first, second] = days;
  if (
    days.length === 2 &&
    isIntegerInRange(first, MIN_DAY_OF_MONTH, MAX_DAY_OF_MONTH) &&
    isIntegerInRange(second, MIN_DAY_OF_MONTH, MAX_DAY_OF_MONTH)
  ) {
    return [first, second];
  }

  return defaultPayDaysFor('BIWEEKLY');
}

/** Client-side mirror of the server-side salary validation (UX only). */
function buildSchema(dictionary: Record<string, unknown>, prefix: string) {
  const message = (key: string) => get(dictionary, `${prefix}.errors.${key}`);
  const cents = z
    .number()
    .int(message('amountWhole'))
    .min(MIN_SAFE_CENTS, message('amountRequired'))
    .max(MAX_SAFE_CENTS, message('amountMax'));
  const payDay = z
    .number({ error: message('payDayRequired') })
    .int(message('payDayRange'))
    .min(MIN_DAY_OF_MONTH, message('payDayRange'))
    .max(MAX_DAY_OF_MONTH, message('payDayRange'));

  return z
    .object({
      amountCents: cents,
      currency: z.enum(CURRENCY_VALUES),
      frequency: z.enum(SALARY_FREQUENCY_VALUES),
      payDays: z.array(payDay).min(1, message('payDaysRequired')).max(2, message('payDaysMax')),
      bonuses: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z
              .string()
              .trim()
              .min(1, message('nameRequired'))
              .max(100, message('nameTooLong')),
            amountCents: cents,
            currency: z.enum(CURRENCY_VALUES),
            frequency: z.enum(BONUS_FREQUENCY_VALUES),
            anchorMonth: z
              .number()
              .int(message('monthInvalid'))
              .min(1, message('monthInvalid'))
              .max(12, message('monthInvalid')),
            dayOfMonth: z
              .number()
              .int(message('dayInvalid'))
              .min(1, message('dayInvalid'))
              .max(31, message('dayInvalid'))
              .nullable(),
          })
        )
        .max(MAX_BONUSES, interpolate(message('maxBonuses'), { max: MAX_BONUSES })),
    })
    .superRefine((values, ctx) => {
      // Cross-field mirror of `refinePayDaysByFrequency` in `salary.schema.ts`.
      const days = values.payDays;

      if (values.frequency === 'WEEKLY') {
        if (days.length !== 1) {
          ctx.addIssue({ code: 'custom', path: ['payDays'], message: message('weeklyOneDay') });
          return;
        }
        const day = days[0];
        if (!isIntegerInRange(day, MIN_ISO_WEEKDAY, MAX_ISO_WEEKDAY)) {
          ctx.addIssue({ code: 'custom', path: ['payDays'], message: message('weekdayRange') });
        }
        return;
      }

      if (values.frequency === 'MONTHLY') {
        if (days.length !== 1) {
          ctx.addIssue({ code: 'custom', path: ['payDays'], message: message('monthlyOneDay') });
        }
        return;
      }

      if (days.length !== 2) {
        ctx.addIssue({ code: 'custom', path: ['payDays'], message: message('biweeklyTwoDays') });
      }
    });
}

function toDefaultValues(configuration: SalaryFormConfiguration | null): SalaryFormValues {
  if (!configuration) {
    return {
      amountCents: 0,
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: defaultPayDaysFor('MONTHLY'),
      bonuses: [],
    };
  }
  return {
    amountCents: configuration.amountCents,
    currency: configuration.currency,
    frequency: configuration.frequency,
    payDays: normalizePayDays(configuration.frequency, configuration.payDays),
    bonuses: configuration.bonuses.map((bonus) => ({ ...bonus })),
  };
}

/** Form values → the exact payload the Server Action expects. */
function toPayload(values: SalaryFormValues): SaveSalaryConfigurationInput {
  return {
    amountCents: values.amountCents,
    currency: values.currency,
    frequency: values.frequency,
    payDays: values.payDays,
    bonuses: values.bonuses.map((bonus) => ({
      // Existing bonuses keep their id (updated in place); new ones omit it so
      // the backend creates them with its own idempotency key.
      ...(bonus.id ? { id: bonus.id } : {}),
      name: bonus.name,
      amountCents: bonus.amountCents,
      currency: bonus.currency,
      frequency: bonus.frequency,
      anchorMonth: bonus.anchorMonth,
      dayOfMonth: bonus.dayOfMonth,
    })),
  };
}

type BonusFieldErrors = Partial<
  Record<'name' | 'amountCents' | 'anchorMonth' | 'dayOfMonth', { message?: string }>
>;

type PayDayFieldError = { message?: string };

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
const selectCls = `${inputCls} appearance-none`;
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const errorCls = 'mt-1 text-xs text-red-400';
const hintCls = 'mt-1 text-xs text-slate-500';

/**
 * Reusable salary + bonuses form.
 *
 * Owns ONLY presentation and client-side UX validation: the actual persistence
 * is delegated to `onSubmit`, so Settings and the onboarding walkthrough can
 * reuse the exact same fields while keeping their own save semantics.
 *
 * The recurrence is expressed as `payDays`, whose meaning depends on the
 * selected `frequency`:
 * - MONTHLY  → one "day of the month" input (1–31).
 * - BIWEEKLY → two "day of the month" inputs (1–31).
 * - WEEKLY   → one ISO weekday select (Monday 1 … Sunday 7).
 */
export function SalaryForm({
  dictionary,
  prefix,
  locale,
  idPrefix,
  initialConfiguration,
  onSubmit,
  submitLabel,
  submitLabelBusy,
  submitRef,
}: Readonly<SalaryFormProps>) {
  const t = useCallback((key: string) => get(dictionary, `${prefix}.${key}`), [dictionary, prefix]);
  const defaultValues = useMemo(
    () => toDefaultValues(initialConfiguration),
    [initialConfiguration]
  );
  const schema = useMemo(() => buildSchema(dictionary, prefix), [dictionary, prefix]);
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    clearErrors,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SalaryFormValues>({
    resolver: zodResolver(schema) as Resolver<SalaryFormValues>,
    defaultValues,
  });

  const amountCents = useWatch({ control, name: 'amountCents' }) ?? 0;
  const frequency = useWatch({ control, name: 'frequency' }) ?? 'MONTHLY';
  const payDays = useWatch({ control, name: 'payDays' }) ?? [];
  const bonuses = useWatch({ control, name: 'bonuses' }) ?? [];

  const bonusFieldErrors: BonusFieldErrors[] = Array.isArray(errors.bonuses)
    ? (errors.bonuses as BonusFieldErrors[])
    : [];
  const bonusesListError =
    typeof errors.bonuses?.message === 'string' ? errors.bonuses.message : undefined;

  const payDayFieldErrors: PayDayFieldError[] = Array.isArray(errors.payDays)
    ? (errors.payDays as PayDayFieldError[])
    : [];
  const payDaysListError =
    typeof errors.payDays?.message === 'string' ? errors.payDays.message : undefined;
  const hasPayDayItemError = payDayFieldErrors.some((error) => typeof error?.message === 'string');

  const getBonusItemError = (index: number): string | undefined => {
    const item = bonusFieldErrors[index];
    return (
      item?.name?.message ??
      item?.amountCents?.message ??
      item?.anchorMonth?.message ??
      item?.dayOfMonth?.message
    );
  };

  const getPayDayError = (index: number): string | undefined => payDayFieldErrors[index]?.message;

  /**
   * Writes one day of the `payDays` array. An empty input is stored as `NaN` so
   * the schema reports the localized "required" message on submit instead of
   * silently persisting a wrong day.
   */
  const handlePayDayChange = (index: number, raw: string): void => {
    const next = [...payDays];
    next[index] = raw === '' ? Number.NaN : Number.parseInt(raw, 10);
    setValue('payDays', next, { shouldDirty: true });
  };

  /**
   * Switching frequency normalizes `payDays` to that frequency's valid shape so
   * values from the previous frequency can never leak into the payload.
   */
  const handleFrequencyChange = (next: SalaryFrequency): void => {
    setValue('frequency', next, { shouldDirty: true });
    setValue('payDays', defaultPayDaysFor(next), { shouldDirty: true });
    clearErrors('payDays');
  };

  /** Described-by target of a pay-day control: error first, hint otherwise. */
  const describedBy = (index: number, hintId: string): string => {
    const itemErrorId = `${idPrefix}-pay-day-${index}-error`;
    if (getPayDayError(index)) return itemErrorId;
    if (payDaysListError && !hasPayDayItemError) return `${idPrefix}-pay-days-error`;
    return hintId;
  };

  const renderPayDayNumberInput = (
    index: number,
    labelKey: string,
    hintId: string,
    inputId: string
  ) => {
    const day = payDays[index];
    const error = getPayDayError(index);
    return (
      <div>
        <label htmlFor={inputId} className={labelCls}>
          {t(labelKey)}
        </label>
        <input
          id={inputId}
          type="number"
          min={MIN_DAY_OF_MONTH}
          max={MAX_DAY_OF_MONTH}
          step={1}
          inputMode="numeric"
          value={Number.isFinite(day) ? String(day) : ''}
          onChange={(event) => handlePayDayChange(index, event.target.value)}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy(index, hintId)}
          className={`${inputCls} font-mono tabular-nums`}
        />
        {error ? (
          <p id={`${idPrefix}-pay-day-${index}-error`} role="alert" className={errorCls}>
            {error}
          </p>
        ) : (
          <p id={hintId} className={hintCls}>
            {t('payDayOfMonthHint')}
          </p>
        )}
      </div>
    );
  };

  /** Persists the validated values; resolves `true` only when `onSubmit` succeeded. */
  const handleValid = useCallback(
    async (values: SalaryFormValues): Promise<boolean> => {
      setServerError('');
      const result = await onSubmit(toPayload(values));
      if (!result.success) {
        setServerError(result.error ?? t('errors.saveFailed'));
        return false;
      }
      return true;
    },
    [onSubmit, t]
  );

  /**
   * Programmatic submit for hosts with their own primary CTA.
   *
   * An untouched form or a missing/non-positive amount resolves `'skipped'`:
   * the (optional) host step must be able to advance without persisting a
   * placeholder, and only a real amount is ever sent to the server.
   */
  const requestSubmit = useCallback(async (): Promise<SalaryFormSubmitOutcome> => {
    if (!isDirty) return 'skipped';

    const amountCents = getValues('amountCents');
    if (!Number.isFinite(amountCents) || amountCents <= 0) return 'skipped';

    let outcome: SalaryFormSubmitOutcome = 'invalid';
    await handleSubmit(async (values: SalaryFormValues) => {
      outcome = (await handleValid(values)) ? 'saved' : 'invalid';
    })();
    return outcome;
  }, [isDirty, getValues, handleSubmit, handleValid]);

  useImperativeHandle(submitRef, () => ({ requestSubmit }), [requestSubmit]);

  return (
    <form onSubmit={handleSubmit(handleValid)} className="space-y-5" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idPrefix}-amount`} className={labelCls}>
            {t('amountLabel')}
          </label>
          <FormattedNumericInput
            id={`${idPrefix}-amount`}
            value={amountCents}
            // `shouldDirty` is required: the input is not registered, so this
            // `setValue` is the only signal that the user actually typed an amount.
            onChange={(value) =>
              setValue('amountCents', value, { shouldValidate: true, shouldDirty: true })
            }
            locale={locale}
            aria-invalid={errors.amountCents ? 'true' : 'false'}
            aria-describedby={errors.amountCents ? `${idPrefix}-amount-error` : undefined}
            className={`${inputCls} font-mono tabular-nums`}
          />
          {errors.amountCents && (
            <p id={`${idPrefix}-amount-error`} role="alert" className={errorCls}>
              {errors.amountCents.message}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={`${idPrefix}-currency`} className={labelCls}>
            {t('currencyLabel')}
          </label>
          <select id={`${idPrefix}-currency`} className={selectCls} {...register('currency')}>
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code} className="bg-slate-800">
                {code}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-frequency`} className={labelCls}>
            {t('frequencyLabel')}
          </label>
          <select
            id={`${idPrefix}-frequency`}
            className={selectCls}
            value={frequency}
            onChange={(event) => handleFrequencyChange(event.target.value as SalaryFrequency)}
          >
            {SALARY_FREQUENCY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value} className="bg-slate-800">
                {t(option.labelKey)}
              </option>
            ))}
          </select>
        </div>

        {frequency === 'MONTHLY' &&
          renderPayDayNumberInput(
            0,
            'payDayOfMonthLabel',
            `${idPrefix}-pay-day-hint`,
            `${idPrefix}-pay-day`
          )}

        {frequency === 'BIWEEKLY' && (
          <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-2">
            {renderPayDayNumberInput(
              0,
              'firstPayDayLabel',
              `${idPrefix}-first-pay-day-hint`,
              `${idPrefix}-first-pay-day`
            )}
            {renderPayDayNumberInput(
              1,
              'secondPayDayLabel',
              `${idPrefix}-second-pay-day-hint`,
              `${idPrefix}-second-pay-day`
            )}
          </div>
        )}

        {frequency === 'WEEKLY' && (
          <div>
            <label htmlFor={`${idPrefix}-pay-weekday`} className={labelCls}>
              {t('weekdayLabel')}
            </label>
            <select
              id={`${idPrefix}-pay-weekday`}
              className={selectCls}
              value={Number.isFinite(payDays[0]) ? String(payDays[0]) : ''}
              onChange={(event) => handlePayDayChange(0, event.target.value)}
              aria-invalid={getPayDayError(0) ? 'true' : 'false'}
              aria-describedby={describedBy(0, `${idPrefix}-pay-weekday-hint`)}
            >
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} className="bg-slate-800">
                  {t(option.labelKey)}
                </option>
              ))}
            </select>
            {getPayDayError(0) && (
              <p id={`${idPrefix}-pay-day-0-error`} role="alert" className={errorCls}>
                {getPayDayError(0)}
              </p>
            )}
            <p id={`${idPrefix}-pay-weekday-hint`} className={hintCls}>
              {t('weekdayHint')}
            </p>
          </div>
        )}

        {payDaysListError && !hasPayDayItemError && (
          <div className="sm:col-span-2">
            <p id={`${idPrefix}-pay-days-error`} role="alert" className={errorCls}>
              {payDaysListError}
            </p>
          </div>
        )}
      </div>

      <BonusListEditor
        bonuses={bonuses}
        onChange={(next) => setValue('bonuses', next, { shouldValidate: false, shouldDirty: true })}
        dictionary={dictionary}
        prefix={prefix}
        locale={locale}
        idPrefix={idPrefix}
        maxBonuses={MAX_BONUSES}
        getItemError={getBonusItemError}
        listError={bonusesListError}
      />

      {serverError && (
        <p
          role="alert"
          className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        aria-busy={isSubmitting}
        className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Save className="h-4 w-4" aria-hidden="true" />
        )}
        {isSubmitting ? (submitLabelBusy ?? t('submitting')) : (submitLabel ?? t('submit'))}
      </button>
    </form>
  );
}
