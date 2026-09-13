'use client';

import type { UseFormRegisterReturn } from 'react-hook-form';
import { get } from '@/lib/i18n';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import {
  FIXED_EXPENSE_COLOR_PRESETS,
  FIXED_EXPENSE_CURRENCIES,
  FIXED_EXPENSE_FREQUENCIES,
  FIXED_EXPENSE_ICONS,
  toDateInputValue,
} from './constants';

const INPUT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-transparent transition-all';
const SELECT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-transparent transition-all appearance-none';
const LABEL_CLS = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const HINT_CLS = 'text-[10px] text-slate-500 mb-1.5';
const ERROR_CLS = 'mt-1 text-xs text-red-400';

export interface FixedExpenseFormFieldsProps {
  dictionary: Record<string, unknown>;
  locale: string;
  /** Prefix shared by every field id, e.g. `fixed-expense` (create) / `edit-fixed-expense`. */
  idPrefix: string;
  // Uncontrolled text/select fields (React Hook Form register returns)
  nameField: UseFormRegisterReturn;
  descriptionField: UseFormRegisterReturn;
  currencyField: UseFormRegisterReturn;
  frequencyField: UseFormRegisterReturn;
  // Controlled fields (state lives in the parent form)
  amountCents: number;
  onAmountChange: (value: number) => void;
  dayOfPayment?: number;
  onDayOfPaymentChange: (value: number | undefined) => void;
  startDate?: Date;
  /** Raw `YYYY-MM-DD` input value; the parent parses it into a Date. */
  onStartDateChange: (value: string) => void;
  endDate?: Date | null;
  /** Raw `YYYY-MM-DD` input value; the parent parses it (and may clear it). */
  onEndDateChange: (value: string) => void;
  selectedColor: string;
  customColor: string;
  onColorChange: (value: string) => void;
  onCustomColorChange: (value: string) => void;
  selectedIcon: string;
  onIconChange: (value: string) => void;
  // Resolved validation messages (undefined = no error)
  nameError?: string;
  amountError?: string;
  dayOfPaymentError?: string;
  startDateError?: string;
  endDateError?: string;
}

/**
 * Shared presentational fields for the create/edit fixed-expense forms.
 *
 * Preserves the exact ids (`${idPrefix}-*`), labels and i18n texts of the
 * original modals. Purely presentational: all values and callbacks are supplied
 * by the parent form so both modals stay thin and free of duplication.
 */
export function FixedExpenseFormFields({
  dictionary,
  locale,
  idPrefix,
  nameField,
  descriptionField,
  currencyField,
  frequencyField,
  amountCents,
  onAmountChange,
  dayOfPayment,
  onDayOfPaymentChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  selectedColor,
  customColor,
  onColorChange,
  onCustomColorChange,
  selectedIcon,
  onIconChange,
  nameError,
  amountError,
  dayOfPaymentError,
  startDateError,
  endDateError,
}: Readonly<FixedExpenseFormFieldsProps>) {
  return (
    <>
      {/* Name */}
      <div>
        <label htmlFor={`${idPrefix}-name`} className={LABEL_CLS}>
          {get(dictionary, 'fixedExpenseName')}
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          autoComplete="off"
          placeholder={get(dictionary, 'namePlaceholder')}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? `${idPrefix}-name-error` : undefined}
          className={INPUT_CLS}
          {...nameField}
        />
        {nameError && (
          <p id={`${idPrefix}-name-error`} role="alert" className={ERROR_CLS}>
            {nameError}
          </p>
        )}
      </div>

      {/* Description */}
      <div>
        <label htmlFor={`${idPrefix}-description`} className={LABEL_CLS}>
          {get(dictionary, 'description')}
        </label>
        <textarea
          id={`${idPrefix}-description`}
          rows={2}
          placeholder={get(dictionary, 'descriptionPlaceholder')}
          className={`${INPUT_CLS} resize-none`}
          {...descriptionField}
        />
      </div>

      {/* Amount */}
      <div>
        <label htmlFor={`${idPrefix}-amount`} className={LABEL_CLS}>
          {get(dictionary, 'amount')}
        </label>
        <FormattedNumericInput
          id={`${idPrefix}-amount`}
          value={amountCents}
          onChange={onAmountChange}
          locale={locale}
          aria-invalid={!!amountError}
          aria-describedby={amountError ? `${idPrefix}-amount-error` : undefined}
          className={`${INPUT_CLS} font-mono tabular-nums`}
        />
        {amountError && (
          <p id={`${idPrefix}-amount-error`} role="alert" className={ERROR_CLS}>
            {amountError}
          </p>
        )}
      </div>

      {/* Currency + frequency */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${idPrefix}-currency`} className={LABEL_CLS}>
            {get(dictionary, 'currency')}
          </label>
          <select id={`${idPrefix}-currency`} className={SELECT_CLS} {...currencyField}>
            {FIXED_EXPENSE_CURRENCIES.map((currency) => (
              <option key={currency} value={currency} className="bg-slate-800">
                {currency}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${idPrefix}-frequency`} className={LABEL_CLS}>
            {get(dictionary, 'frequency')}
          </label>
          <select id={`${idPrefix}-frequency`} className={SELECT_CLS} {...frequencyField}>
            {FIXED_EXPENSE_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency} className="bg-slate-800">
                {get(dictionary, `frequencies.${frequency}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Day of payment */}
      <div>
        <label htmlFor={`${idPrefix}-day`} className={LABEL_CLS}>
          {get(dictionary, 'dayOfPayment')}
        </label>
        <p className={HINT_CLS}>{get(dictionary, 'dayOfPaymentHint')}</p>
        <input
          id={`${idPrefix}-day`}
          type="number"
          min={1}
          max={31}
          inputMode="numeric"
          className={`${INPUT_CLS} tabular-nums`}
          value={dayOfPayment ?? ''}
          onChange={(e) =>
            onDayOfPaymentChange(e.target.value === '' ? undefined : Number(e.target.value))
          }
          aria-invalid={!!dayOfPaymentError}
          aria-describedby={dayOfPaymentError ? `${idPrefix}-day-error` : undefined}
        />
        {dayOfPaymentError && (
          <p id={`${idPrefix}-day-error`} role="alert" className={ERROR_CLS}>
            {dayOfPaymentError}
          </p>
        )}
      </div>

      {/* Start + end date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${idPrefix}-start`} className={LABEL_CLS}>
            {get(dictionary, 'startDate')}
          </label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            className={INPUT_CLS}
            value={toDateInputValue(startDate)}
            onChange={(e) => onStartDateChange(e.target.value)}
            aria-invalid={!!startDateError}
            aria-describedby={startDateError ? `${idPrefix}-start-error` : undefined}
          />
          {startDateError && (
            <p id={`${idPrefix}-start-error`} role="alert" className={ERROR_CLS}>
              {startDateError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${idPrefix}-end`} className={LABEL_CLS}>
            {get(dictionary, 'endDate')}
          </label>
          <p className={HINT_CLS}>{get(dictionary, 'endDateHint')}</p>
          <input
            id={`${idPrefix}-end`}
            type="date"
            className={INPUT_CLS}
            value={toDateInputValue(endDate)}
            onChange={(e) => onEndDateChange(e.target.value)}
            aria-invalid={!!endDateError}
            aria-describedby={endDateError ? `${idPrefix}-end-error` : undefined}
          />
          {endDateError && (
            <p id={`${idPrefix}-end-error`} role="alert" className={ERROR_CLS}>
              {endDateError}
            </p>
          )}
        </div>
      </div>

      {/* Color */}
      <fieldset>
        <legend className={LABEL_CLS}>{get(dictionary, 'color')}</legend>
        <div className="flex items-center gap-2 flex-wrap">
          {FIXED_EXPENSE_COLOR_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              aria-label={get(dictionary, preset.labelKey)}
              aria-pressed={selectedColor === preset.value}
              onClick={() => onColorChange(preset.value)}
              className={`w-7 h-7 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-amber-400 ${
                selectedColor === preset.value
                  ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-amber-400 scale-110'
                  : 'opacity-70 hover:opacity-100 hover:scale-105'
              }`}
              style={{ background: preset.value }}
            />
          ))}
          <label
            aria-label={get(dictionary, 'customColor')}
            className={`relative w-7 h-7 rounded-full overflow-hidden cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-slate-900 has-[:focus-visible]:ring-amber-400 ${
              !FIXED_EXPENSE_COLOR_PRESETS.some((p) => p.value === selectedColor)
                ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-amber-400 scale-110'
                : 'opacity-70 hover:opacity-100 hover:scale-105'
            }`}
            style={{ background: customColor }}
          >
            <input
              type="color"
              value={customColor}
              onChange={(e) => onCustomColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer focus-visible:outline-none"
            />
          </label>
        </div>
      </fieldset>

      {/* Icon */}
      <fieldset>
        <legend className={LABEL_CLS}>{get(dictionary, 'icon')}</legend>
        <div className="flex items-center gap-2 flex-wrap">
          {FIXED_EXPENSE_ICONS.map((option) => {
            const Icon = option.Icon;
            const selected = selectedIcon === option.name;
            return (
              <button
                key={option.name}
                type="button"
                aria-label={get(dictionary, option.labelKey)}
                aria-pressed={selected}
                onClick={() => onIconChange(option.name)}
                className={`p-1.5 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                  selected
                    ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/50'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}
