'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { BonusFrequency, Currency } from '@prisma/client';
import { get } from '@/lib/i18n';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';

/**
 * Local (draft) shape of a declared bonus.
 *
 * `id` is present ONLY for bonuses that already exist server-side: those are
 * sent back with their id so the backend updates the same row. New bonuses are
 * sent without an id and the Server Action creates them with its own
 * idempotency key.
 */
export interface BonusDraft {
  id?: string;
  name: string;
  amountCents: number;
  currency: Currency;
  frequency: BonusFrequency;
  anchorMonth: number;
  dayOfMonth: number | null;
}

export const CURRENCY_OPTIONS: readonly Currency[] = ['COP', 'USD', 'EUR'];

export const BONUS_FREQUENCY_OPTIONS: ReadonlyArray<{
  readonly value: BonusFrequency;
  readonly labelKey: string;
}> = [
  { value: 'MONTHLY', labelKey: 'bonusFrequencyMonthly' },
  { value: 'BIMONTHLY', labelKey: 'bonusFrequencyBimonthly' },
  { value: 'QUARTERLY', labelKey: 'bonusFrequencyQuarterly' },
  { value: 'SEMIANNUAL', labelKey: 'bonusFrequencySemiannual' },
  { value: 'ANNUAL', labelKey: 'bonusFrequencyAnnual' },
];

/** Fresh editable bonus (no `id`: the server creates it). */
export function createEmptyBonus(currency: Currency = 'COP'): BonusDraft {
  return {
    name: '',
    amountCents: 0,
    currency,
    frequency: 'MONTHLY',
    anchorMonth: 1,
    dayOfMonth: null,
  };
}

/** `{placeholder}` interpolation, mirroring the onboarding i18n helper. */
function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/**
 * Localized, capitalized month name (1-12). UTC is used so the label never
 * shifts by timezone.
 */
function monthLabel(month: number, locale: string): string {
  const label = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, month - 1, 1))
  );
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
const selectCls = `${inputCls} appearance-none`;
const labelCls = 'block text-[11px] font-semibold text-slate-300 mb-1 uppercase tracking-wider';

interface BonusListEditorProps {
  readonly bonuses: readonly BonusDraft[];
  readonly onChange: (next: BonusDraft[]) => void;
  /** Dictionary holding the labels (settings or onboarding). */
  readonly dictionary: Record<string, unknown>;
  /** Dot-path prefix of the form labels, e.g. `salary.form`. */
  readonly prefix: string;
  readonly locale: string;
  /** Unique prefix for the DOM ids of this form instance. */
  readonly idPrefix: string;
  /** Upper bound accepted by the backend (`MAX_SALARY_BONUSES`). */
  readonly maxBonuses: number;
  /** Per-item validation message resolver (name/amount/month/day). */
  readonly getItemError: (index: number) => string | undefined;
  /** Error for the whole list (e.g. too many bonuses). */
  readonly listError?: string;
}

/**
 * Editable list of bonuses (add / edit / remove) kept fully controlled by the
 * parent form state. Keyboard-operable buttons and labelled inputs; the remove
 * action is a real button with visible text (never icon-only).
 */
export function BonusListEditor({
  bonuses,
  onChange,
  dictionary,
  prefix,
  locale,
  idPrefix,
  maxBonuses,
  getItemError,
  listError,
}: Readonly<BonusListEditorProps>) {
  const t = (key: string) => get(dictionary, `${prefix}.${key}`);
  const maxReached = bonuses.length >= maxBonuses;

  function update(index: number, patch: Partial<BonusDraft>): void {
    onChange(bonuses.map((bonus, current) => (current === index ? { ...bonus, ...patch } : bonus)));
  }

  function remove(index: number): void {
    onChange(bonuses.filter((_, current) => current !== index));
  }

  function add(): void {
    onChange([...bonuses, createEmptyBonus('COP')]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-white">{t('bonusesTitle')}</h4>
          <p className="text-xs text-slate-400">{t('bonusesDescription')}</p>
        </div>
        <button
          type="button"
          onClick={add}
          disabled={maxReached}
          className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t('addBonus')}
        </button>
      </div>

      {bonuses.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
          {t('bonusesEmpty')}
        </p>
      ) : (
        <ul className="space-y-3">
          {bonuses.map((bonus, index) => {
            const error = getItemError(index);
            const errorId = `${idPrefix}-bonus-${index}-error`;
            const describedBy = error ? errorId : undefined;
            return (
              <li
                key={bonus.id ?? `new-${index}`}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
              >
                <fieldset className="space-y-3">
                  <legend className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                    {interpolate(t('bonusItemTitle'), { index: index + 1 })}
                  </legend>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label htmlFor={`${idPrefix}-bonus-${index}-name`} className={labelCls}>
                        {t('bonusName')}
                      </label>
                      <input
                        id={`${idPrefix}-bonus-${index}-name`}
                        type="text"
                        autoComplete="off"
                        placeholder={t('bonusNamePlaceholder')}
                        value={bonus.name}
                        onChange={(event) => update(index, { name: event.target.value })}
                        aria-invalid={error ? 'true' : 'false'}
                        aria-describedby={describedBy}
                        className={inputCls}
                      />
                    </div>

                    <div>
                      <label htmlFor={`${idPrefix}-bonus-${index}-amount`} className={labelCls}>
                        {t('bonusAmount')}
                      </label>
                      <FormattedNumericInput
                        id={`${idPrefix}-bonus-${index}-amount`}
                        value={bonus.amountCents}
                        onChange={(value) => update(index, { amountCents: value })}
                        locale={locale}
                        aria-invalid={error ? 'true' : 'false'}
                        aria-describedby={describedBy}
                        className={`${inputCls} font-mono tabular-nums`}
                      />
                    </div>

                    <div>
                      <label htmlFor={`${idPrefix}-bonus-${index}-currency`} className={labelCls}>
                        {t('bonusCurrency')}
                      </label>
                      <select
                        id={`${idPrefix}-bonus-${index}-currency`}
                        value={bonus.currency}
                        onChange={(event) =>
                          update(index, { currency: event.target.value as Currency })
                        }
                        className={selectCls}
                      >
                        {CURRENCY_OPTIONS.map((code) => (
                          <option key={code} value={code} className="bg-slate-800">
                            {code}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`${idPrefix}-bonus-${index}-frequency`} className={labelCls}>
                        {t('bonusFrequency')}
                      </label>
                      <select
                        id={`${idPrefix}-bonus-${index}-frequency`}
                        value={bonus.frequency}
                        onChange={(event) =>
                          update(index, { frequency: event.target.value as BonusFrequency })
                        }
                        className={selectCls}
                      >
                        {BONUS_FREQUENCY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value} className="bg-slate-800">
                            {t(option.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`${idPrefix}-bonus-${index}-month`} className={labelCls}>
                        {t('bonusAnchorMonth')}
                      </label>
                      <select
                        id={`${idPrefix}-bonus-${index}-month`}
                        value={bonus.anchorMonth}
                        onChange={(event) =>
                          update(index, { anchorMonth: Number(event.target.value) })
                        }
                        className={selectCls}
                      >
                        {Array.from({ length: 12 }, (_, monthIndex) => monthIndex + 1).map(
                          (month) => (
                            <option key={month} value={month} className="bg-slate-800">
                              {monthLabel(month, locale)}
                            </option>
                          )
                        )}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`${idPrefix}-bonus-${index}-day`} className={labelCls}>
                        {t('bonusDay')}
                      </label>
                      <input
                        id={`${idPrefix}-bonus-${index}-day`}
                        type="number"
                        min={1}
                        max={31}
                        inputMode="numeric"
                        value={bonus.dayOfMonth ?? ''}
                        onChange={(event) =>
                          update(index, {
                            dayOfMonth:
                              event.target.value === '' ? null : Number(event.target.value),
                          })
                        }
                        aria-invalid={error ? 'true' : 'false'}
                        aria-describedby={describedBy}
                        className={inputCls}
                      />
                    </div>

                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('removeBonus')}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <p id={errorId} role="alert" className="text-xs text-red-400">
                      {error}
                    </p>
                  )}
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}

      {listError && (
        <p role="alert" className="text-xs text-red-400">
          {listError}
        </p>
      )}
    </div>
  );
}
