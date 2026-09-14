'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check, TrendingUp, TrendingDown, Sparkles } from 'lucide-react';
import { get } from '@/lib/i18n';
import { translateValidationMessage } from '@/lib/i18n/validation';
import { formatMoney } from '@/lib/money';
import { createLoan } from '@/actions/loan.actions';
import { CreateLoanSchema, type CreateLoanInput } from '@/actions/loan.schema';
import {
  buildAmortizationSchedule,
  computeLoanSummary,
  computeTermCountFromInstallment,
} from '@/lib/loans/interest';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import type { AccountBrief } from '@/components/transactions/types';
import type { LoanScheduleMode } from '@/types/loans';
import { getLoanError } from './getLoanError';
import { LoanDialogShell, type LoanDialogRenderApi } from './LoanDialogShell';

const CURRENCIES = ['COP', 'USD', 'EUR'] as const;
const LOAN_TYPES = ['PERSONAL', 'MORTGAGE', 'AUTO', 'STUDENT', 'BUSINESS'] as const;
const RATE_TYPES = ['EA', 'NAMV', 'PERIODIC', 'DAILY'] as const;
const INTEREST_MODES = ['COMPOUND', 'SIMPLE'] as const;
const INTEREST_ACCRUALS = ['PERIODIC', 'DAILY'] as const;
const DAY_COUNT_BASES = ['ACTUAL_365', 'ACTUAL_360', 'THIRTY_360'] as const;
const AMORTIZATION_TYPES = ['FRENCH', 'GERMAN', 'AMERICAN', 'CUSTOM'] as const;
const PAYMENT_FREQUENCIES = ['WEEKLY', 'BIWEEKLY', 'MONTHLY'] as const;
const DIRECTIONS = ['RECEIVABLE', 'PAYABLE'] as const;
const SCHEDULE_MODES = ['TERM', 'INSTALLMENT'] as const;

/** Upper bound for the schedule length (mirrors the backend sanity bound). */
const MAX_TERM_COUNT = 1200;

/** The rate input stores the percentage in centesimal units (rate * 100). */
const RATE_SCALE = 100;
const MAX_RATE_VALUE = 1000;

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
const selectCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const errorCls = 'mt-1 text-xs text-red-400';
const hintCls = 'text-[10px] text-slate-500 mb-1.5';
const noteCls = 'mt-1 text-[10px] text-slate-500';

interface ColorPreset {
  value: string;
  labelKey: string;
}

const COLOR_PRESETS: ColorPreset[] = [
  { value: 'from-violet-500 to-purple-500', labelKey: 'colorNames.violet' },
  { value: 'from-blue-500 to-cyan-500', labelKey: 'colorNames.blue' },
  { value: 'from-emerald-500 to-teal-500', labelKey: 'colorNames.emerald' },
  { value: 'from-amber-500 to-orange-500', labelKey: 'colorNames.amber' },
  { value: 'from-red-500 to-rose-500', labelKey: 'colorNames.red' },
  { value: 'from-pink-500 to-fuchsia-500', labelKey: 'colorNames.pink' },
];

/** Placeholder that satisfies the UUID v4 shape until a real key is generated. */
const UUID_PLACEHOLDER = '00000000-0000-4000-8000-000000000000';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function addMonthsClamped(date: Date, months: number): Date {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

type LoanPreviewError = { kind: 'error'; error: 'installmentTooLow' };
type LoanPreviewOk = {
  kind: 'ok';
  schedule: ReturnType<typeof buildAmortizationSchedule>;
  summary: ReturnType<typeof computeLoanSummary>;
  termCount: number;
};
type LoanPreview = LoanPreviewOk | LoanPreviewError | null;

/** All live-preview inputs, passed as a single object to the pure resolver. */
interface LoanPreviewParams {
  principalWatch: CreateLoanInput['principalCents'];
  rateInternal: number;
  startWatch: CreateLoanInput['startDate'];
  startDateStr: string;
  firstPaymentWatch: CreateLoanInput['firstPaymentDate'];
  firstPaymentStr: string;
  scheduleModeWatch: CreateLoanInput['scheduleMode'];
  installmentWatch: CreateLoanInput['installmentAmountCents'];
  interestOnlyWatch: CreateLoanInput['interestOnlyInstallments'];
  rateTypeWatch: CreateLoanInput['rateType'];
  frequencyWatch: CreateLoanInput['paymentFrequency'];
  interestAccrualWatch: CreateLoanInput['interestAccrual'];
  dayCountBasisWatch: CreateLoanInput['dayCountBasis'];
  interestModeWatch: CreateLoanInput['interestMode'];
  amortizationWatch: CreateLoanInput['amortizationType'];
  termWatch: CreateLoanInput['termCount'];
}

type TermResolution =
  | { kind: 'skip' }
  | { kind: 'error'; error: 'installmentTooLow' }
  | { kind: 'ok'; term: number; installmentMode: boolean; rawInterestOnly: number };

/** Resolve a watched form date, falling back to the raw string input value. */
function resolveWatchDate(watch: unknown, fallback: string): Date | null {
  if (watch instanceof Date) return watch;
  return fallback ? parseDateInput(fallback) : null;
}

function resolvePositiveAmount(value: number | null | undefined): number | null {
  if (value == null || Number(value) <= 0) return null;
  return Number(value);
}

/**
 * Resolve the TOTAL installments: given (TERM) or derived from the fixed
 * installment (INSTALLMENT). The derived count is the number of AMORTIZING
 * periods; interest-only periods are added on top (mirrors the backend).
 */
function resolveTermResolution(
  params: LoanPreviewParams,
  principal: number,
  rate: number
): TermResolution {
  const installmentMode = params.scheduleModeWatch === 'INSTALLMENT';
  const rawInterestOnly = Math.max(0, Number(params.interestOnlyWatch) || 0);
  if (!installmentMode) {
    return { kind: 'ok', term: Number(params.termWatch) || 0, installmentMode, rawInterestOnly };
  }
  const rawInstallment = resolvePositiveAmount(params.installmentWatch);
  if (rawInstallment == null) return { kind: 'skip' };
  try {
    const amortizingTerm = computeTermCountFromInstallment({
      principalCents: principal,
      rateType: params.rateTypeWatch ?? 'EA',
      interestRateValue: rate,
      paymentFrequency: params.frequencyWatch ?? 'MONTHLY',
      installmentCents: rawInstallment,
      interestAccrual: params.interestAccrualWatch ?? 'PERIODIC',
      dayCountBasis: params.dayCountBasisWatch ?? 'ACTUAL_365',
      interestMode: params.interestModeWatch ?? 'COMPOUND',
    });
    return {
      kind: 'ok',
      term: rawInterestOnly + amortizingTerm,
      installmentMode,
      rawInterestOnly,
    };
  } catch {
    return { kind: 'error', error: 'installmentTooLow' };
  }
}

/** Assemble the schedule input from the live-preview parameters. */
function resolveScheduleInput(
  params: LoanPreviewParams,
  principal: number,
  rate: number,
  term: number,
  rawInterestOnly: number,
  startDate: Date,
  firstPaymentDate: Date
): Parameters<typeof buildAmortizationSchedule>[0] {
  const installmentMode = params.scheduleModeWatch === 'INSTALLMENT';
  const rawInstallment = resolvePositiveAmount(params.installmentWatch);
  return {
    principalCents: principal,
    rateType: params.rateTypeWatch ?? 'EA',
    interestRateValue: rate,
    interestMode: params.interestModeWatch ?? 'COMPOUND',
    interestAccrual: params.interestAccrualWatch ?? 'PERIODIC',
    dayCountBasis: params.dayCountBasisWatch ?? 'ACTUAL_365',
    amortizationType: installmentMode ? 'FRENCH' : (params.amortizationWatch ?? 'FRENCH'),
    paymentFrequency: params.frequencyWatch ?? 'MONTHLY',
    termCount: term,
    installmentAmountCents: installmentMode ? rawInstallment : null,
    interestOnlyInstallments: Math.min(rawInterestOnly, term - 1),
    startDate,
    firstPaymentDate,
  };
}

/** Pure live preview: null when incomplete, an error or a full schedule. */
function resolveLoanPreview(params: LoanPreviewParams): LoanPreview {
  const principal = Number(params.principalWatch) || 0;
  const rate = params.rateInternal / RATE_SCALE;
  const startDate = resolveWatchDate(params.startWatch, params.startDateStr);
  const firstPaymentDate = resolveWatchDate(params.firstPaymentWatch, params.firstPaymentStr);

  if (principal <= 0 || !startDate || !firstPaymentDate) return null;
  if (firstPaymentDate.getTime() <= startDate.getTime()) return null;

  const termState = resolveTermResolution(params, principal, rate);
  if (termState.kind === 'skip') return null;
  if (termState.kind === 'error') return termState;
  const { term, installmentMode, rawInterestOnly } = termState;

  if (term <= 0) return null;
  // Never build an unbounded schedule in the browser; an out-of-range derived
  // count means the installment is too low to amortize within the limit.
  if (term > MAX_TERM_COUNT) {
    return installmentMode ? { kind: 'error', error: 'installmentTooLow' } : null;
  }

  try {
    const schedule = buildAmortizationSchedule(
      resolveScheduleInput(
        params,
        principal,
        rate,
        term,
        rawInterestOnly,
        startDate,
        firstPaymentDate
      )
    );
    const summary = computeLoanSummary(schedule, principal);
    return { kind: 'ok', schedule, summary, termCount: term };
  } catch {
    return installmentMode ? { kind: 'error', error: 'installmentTooLow' } : null;
  }
}

function getPreviewErrorCode(preview: LoanPreview): 'installmentTooLow' | null {
  return preview?.kind === 'error' ? preview.error : null;
}

function getInstallmentPreviewCents(preview: LoanPreview): number {
  return preview?.kind === 'ok' ? (preview.schedule[0]?.totalCents ?? 0) : 0;
}

function getScheduleRows(preview: LoanPreview): ReturnType<typeof buildAmortizationSchedule> {
  return preview?.kind === 'ok' ? preview.schedule : [];
}

function isPrincipalExceedsBalance(
  direction: CreateLoanInput['direction'],
  principalWatch: CreateLoanInput['principalCents'],
  selectedAccount: AccountBrief | undefined
): boolean {
  return (
    direction === 'RECEIVABLE' &&
    selectedAccount != null &&
    Number(principalWatch) > selectedAccount.balanceCents
  );
}

function isInstallmentExceedsTotal(
  isInstallmentMode: boolean,
  preview: LoanPreview,
  installmentWatch: CreateLoanInput['installmentAmountCents']
): boolean {
  return (
    isInstallmentMode &&
    preview?.kind === 'ok' &&
    installmentWatch != null &&
    Number(installmentWatch) > preview.summary.totalPayableCents
  );
}

function resolvePreviewErrorMessage(
  installmentExceedsTotal: boolean,
  preview: LoanPreview,
  dictionary: Record<string, unknown>
): string | null {
  if (installmentExceedsTotal) return get(dictionary, 'validation.installmentExceedsTotal');
  if (preview?.kind === 'error') return get(dictionary, 'installmentTooLow');
  return null;
}

function resolveInstallmentFieldError(
  installmentExceedsTotal: boolean,
  preview: LoanPreview,
  rawError: string | undefined,
  dictionary: Record<string, unknown>
): string | null {
  if (installmentExceedsTotal) return get(dictionary, 'validation.installmentExceedsTotal');
  if (preview?.kind === 'error') return get(dictionary, 'installmentTooLow');
  return translateValidationMessage(rawError, dictionary) || null;
}

function resolveLoanSubmitDisabled(params: {
  isValid: boolean;
  isSubmitting: boolean;
  previewError: 'installmentTooLow' | null;
  installmentExceedsTotal: boolean;
  principalExceedsBalance: boolean;
}): boolean {
  return (
    !params.isValid ||
    params.isSubmitting ||
    params.previewError != null ||
    params.installmentExceedsTotal ||
    params.principalExceedsBalance
  );
}

function resolvePrincipalDescribedBy(
  hasError: boolean,
  exceedsBalance: boolean
): string | undefined {
  if (hasError) return 'loan-principal-error';
  if (exceedsBalance) return 'loan-principal-balance-error';
  return undefined;
}

/** Localized message produced while a validation flag is active. */
function resolveFlaggedMessage(dictionary: Record<string, unknown>, key: string): string {
  return get(dictionary, key);
}

/** No message is produced while a validation flag is inactive. */
function resolveUnflaggedMessage(): undefined {
  return undefined;
}

function resolveUsesDailyAccrual(
  interestAccrual: CreateLoanInput['interestAccrual'],
  rateType: CreateLoanInput['rateType']
): boolean {
  return interestAccrual === 'DAILY' || rateType === 'DAILY';
}

interface LoanFieldErrorProps {
  id?: string;
  message?: string;
}

function LoanFieldError({ id, message }: Readonly<LoanFieldErrorProps>) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={errorCls}>
      {message}
    </p>
  );
}

interface DailyOnlyHintProps {
  id: string;
  show: boolean;
  dictionary: Record<string, unknown>;
}

function DailyOnlyHint({ id, show, dictionary }: Readonly<DailyOnlyHintProps>) {
  if (!show) return null;
  return (
    <p id={id} className={noteCls}>
      {get(dictionary, 'dailyOnlyHint')}
    </p>
  );
}

interface InstallmentAmountFeedbackProps {
  dictionary: Record<string, unknown>;
  error: string | null;
}

function InstallmentAmountFeedback({
  dictionary,
  error,
}: Readonly<InstallmentAmountFeedbackProps>) {
  if (error) {
    return (
      <p id="loan-installment-error" role="alert" className={errorCls}>
        {error}
      </p>
    );
  }
  return <p className={noteCls}>{get(dictionary, 'installmentAmountHint')}</p>;
}

interface LoanFormActionsProps {
  dictionary: Record<string, unknown>;
  isSubmitting: boolean;
  submitDisabled: boolean;
  onClose: () => void;
}

function LoanFormActions({
  dictionary,
  isSubmitting,
  submitDisabled,
  onClose,
}: Readonly<LoanFormActionsProps>) {
  return (
    <div className="flex gap-3 pt-1">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
      >
        {get(dictionary, 'cancel')}
      </button>
      <button
        type="submit"
        disabled={submitDisabled}
        aria-busy={isSubmitting}
        className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
      >
        {isSubmitting ? (
          <>{get(dictionary, 'loading')}</>
        ) : (
          <>
            <Check className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'createLoan')}
          </>
        )}
      </button>
    </div>
  );
}

interface LoanColorFieldProps {
  dictionary: Record<string, unknown>;
  selectedColor: string | undefined;
  customColor: string;
  onPresetSelect: (value: string) => void;
  onCustomChange: (value: string) => void;
}

function LoanColorField({
  dictionary,
  selectedColor,
  customColor,
  onPresetSelect,
  onCustomChange,
}: Readonly<LoanColorFieldProps>) {
  return (
    <div>
      <label className={labelCls}>{get(dictionary, 'color')}</label>
      <div className="flex items-center gap-2 flex-wrap">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            aria-label={get(dictionary, preset.labelKey)}
            onClick={() => onPresetSelect(preset.value)}
            className={`w-7 h-7 rounded-full bg-gradient-to-r ${preset.value} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-violet-400 ${
              selectedColor === preset.value
                ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-violet-400 scale-110'
                : 'opacity-70 hover:opacity-100 hover:scale-105'
            }`}
          />
        ))}
        <label
          aria-label={get(dictionary, 'customColor')}
          className={`relative w-7 h-7 rounded-full overflow-hidden cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-slate-900 has-[:focus-visible]:ring-violet-400 ${
            selectedColor && !COLOR_PRESETS.some((p) => p.value === selectedColor)
              ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-violet-400 scale-110'
              : 'opacity-70 hover:opacity-100 hover:scale-105'
          }`}
          style={{ background: customColor }}
        >
          <input
            type="color"
            value={customColor}
            onChange={(e) => onCustomChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer focus-visible:outline-none"
          />
        </label>
      </div>
    </div>
  );
}

interface LoanPreviewPanelProps {
  dictionary: Record<string, unknown>;
  locale: string;
  preview: LoanPreview;
  previewErrorMessage: string | null;
  isInstallmentMode: boolean;
  installmentPreviewCents: number;
  scheduleRows: ReturnType<typeof buildAmortizationSchedule>;
  currency: string;
}

function LoanPreviewPanel({
  dictionary,
  locale,
  preview,
  previewErrorMessage,
  isInstallmentMode,
  installmentPreviewCents,
  scheduleRows,
  currency,
}: Readonly<LoanPreviewPanelProps>) {
  return (
    <aside className="lg:sticky lg:top-0 self-start">
      <section
        aria-label={get(dictionary, 'preview')}
        className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3 max-h-[80vh] overflow-y-auto"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-400" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-violet-300 uppercase tracking-wider">
            {get(dictionary, 'preview')}
          </h3>
        </div>

        {previewErrorMessage != null && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300"
          >
            {previewErrorMessage}
          </div>
        )}

        {preview?.kind === 'ok' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'calculatedInstallment')}
                </p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {formatMoney(installmentPreviewCents, currency, locale)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'calculatedYield')}
                </p>
                <p className="text-sm font-bold text-emerald-400 tabular-nums">
                  {preview.summary.effectiveYieldPct.toFixed(2)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'totalInterest')}
                </p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {formatMoney(preview.summary.totalInterestCents, currency, locale)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                  {get(dictionary, 'totalPayable')}
                </p>
                <p className="text-sm font-bold text-white tabular-nums">
                  {formatMoney(preview.summary.totalPayableCents, currency, locale)}
                </p>
              </div>
            </div>

            {isInstallmentMode && (
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {get(dictionary, 'calculatedTermCount')}
                </p>
                <p className="text-base font-bold text-violet-300 tabular-nums">
                  {preview.termCount}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {get(dictionary, 'previewFullSchedule')}
              </p>
              <div className="max-h-[56vh] overflow-auto rounded-xl border border-white/10">
                <table className="w-full text-sm tabular-nums">
                  <caption className="sr-only">{get(dictionary, 'previewFullSchedule')}</caption>
                  <thead className="sticky top-0 bg-slate-900/95 backdrop-blur">
                    <tr className="text-slate-500">
                      <th scope="col" className="text-left font-medium px-3 py-2.5">
                        {get(dictionary, 'table.number')}
                      </th>
                      <th scope="col" className="text-left font-medium px-3 py-2.5">
                        {get(dictionary, 'table.date')}
                      </th>
                      <th scope="col" className="text-right font-medium px-3 py-2.5">
                        {get(dictionary, 'table.installment')}
                      </th>
                      <th scope="col" className="text-right font-medium px-3 py-2.5">
                        {get(dictionary, 'table.interest')}
                      </th>
                      <th scope="col" className="text-right font-medium px-3 py-2.5">
                        {get(dictionary, 'table.principal')}
                      </th>
                      <th scope="col" className="text-right font-medium px-3 py-2.5">
                        {get(dictionary, 'table.balance')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {scheduleRows.map((row) => (
                      <tr key={row.installmentNumber} className="border-t border-white/5">
                        <td className="px-3 py-2.5">{row.installmentNumber}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {row.dueDate.toLocaleDateString(locale, {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit',
                          })}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {formatMoney(row.totalCents, currency, locale)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-amber-400">
                          {formatMoney(row.interestCents, currency, locale)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {formatMoney(row.principalCents, currency, locale)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-slate-400">
                          {formatMoney(row.balanceCents, currency, locale)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {preview === null && (
          <p className="text-xs text-slate-400">{get(dictionary, 'noPreview')}</p>
        )}
      </section>
    </aside>
  );
}

interface CreateLoanModalProps {
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
  accounts: AccountBrief[];
}

export function CreateLoanModal({
  dictionary,
  locale,
  isOpen,
  onClose,
  accounts,
}: Readonly<CreateLoanModalProps>) {
  // Idempotency key policy: generate once per logical attempt and keep it across
  // retries. Only a confirmed success clears it so the next open creates a fresh
  // key (a reused key would make the backend return the FIRST loan as idempotent).
  const idempotencyKeyRef = useRef<string | null>(null);
  const shellRef = useRef<LoanDialogRenderApi | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [principalCents, setPrincipalCents] = useState(0);
  const [rateInternal, setRateInternal] = useState(0);
  const [installmentAmount, setInstallmentAmount] = useState(0);
  const [startDateStr, setStartDateStr] = useState('');
  const [firstPaymentStr, setFirstPaymentStr] = useState('');
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const [customColor, setCustomColor] = useState('#6366f1');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    trigger,
    formState: { errors, isSubmitting, isValid },
  } = useForm<CreateLoanInput>({
    resolver: zodResolver(CreateLoanSchema) as Resolver<CreateLoanInput>,
    mode: 'onChange',
    defaultValues: {
      type: 'PERSONAL',
      direction: 'RECEIVABLE',
      currency: 'COP',
      rateType: 'EA',
      interestRateValue: 0,
      interestMode: 'COMPOUND',
      interestAccrual: 'PERIODIC',
      dayCountBasis: 'ACTUAL_365',
      amortizationType: 'FRENCH',
      paymentFrequency: 'MONTHLY',
      scheduleMode: 'TERM',
      interestOnlyInstallments: 0,
      idempotencyKey: UUID_PLACEHOLDER,
    },
  });

  // Live preview inputs (pure, no server round-trip). Every relevant field is
  // watched so the schedule recomputes on any change.
  const principalWatch = useWatch({ control, name: 'principalCents' });
  const rateTypeWatch = useWatch({ control, name: 'rateType' });
  const interestModeWatch = useWatch({ control, name: 'interestMode' });
  const interestAccrualWatch = useWatch({ control, name: 'interestAccrual' });
  const dayCountBasisWatch = useWatch({ control, name: 'dayCountBasis' });
  const amortizationWatch = useWatch({ control, name: 'amortizationType' });
  const frequencyWatch = useWatch({ control, name: 'paymentFrequency' });
  const termWatch = useWatch({ control, name: 'termCount' });
  const installmentWatch = useWatch({ control, name: 'installmentAmountCents' });
  const scheduleModeWatch = useWatch({ control, name: 'scheduleMode' });
  const interestOnlyWatch = useWatch({ control, name: 'interestOnlyInstallments' });
  const startWatch = useWatch({ control, name: 'startDate' });
  const firstPaymentWatch = useWatch({ control, name: 'firstPaymentDate' });
  const currencyWatch = useWatch({ control, name: 'currency' });
  const directionWatch = useWatch({ control, name: 'direction' });
  const accountIdWatch = useWatch({ control, name: 'accountId' });

  // Simple/Compound and the day-count basis only alter the math when interest is
  // accrued day by day (daily accrual or a daily rate). With per-period accrual
  // there is no capitalization window, so the controls are disabled.
  const usesDailyAccrual = resolveUsesDailyAccrual(interestAccrualWatch, rateTypeWatch);
  const isInstallmentMode = scheduleModeWatch === 'INSTALLMENT';

  useEffect(() => {
    if (!isOpen) return;
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstPayment = addMonthsClamped(today, 1);
    const todayStr = toDateInputValue(today);
    const firstPaymentString = toDateInputValue(firstPayment);

    reset({
      name: '',
      type: 'PERSONAL',
      direction: 'RECEIVABLE',
      notes: undefined,
      principalCents: 0,
      currency: 'COP',
      rateType: 'EA',
      interestRateValue: 0,
      interestMode: 'COMPOUND',
      interestAccrual: 'PERIODIC',
      dayCountBasis: 'ACTUAL_365',
      amortizationType: 'FRENCH',
      paymentFrequency: 'MONTHLY',
      scheduleMode: 'TERM',
      termCount: 12,
      installmentAmountCents: undefined,
      interestOnlyInstallments: 0,
      customTotals: undefined,
      startDate: today,
      firstPaymentDate: firstPayment,
      color: undefined,
      icon: undefined,
      accountId: undefined,
      idempotencyKey: idempotencyKeyRef.current,
    });

    const id = requestAnimationFrame(() => {
      setPrincipalCents(0);
      setRateInternal(0);
      setInstallmentAmount(0);
      setStartDateStr(todayStr);
      setFirstPaymentStr(firstPaymentString);
      setSelectedColor(undefined);
      setCustomColor('#6366f1');
      setSubmitError(null);
      // Re-evaluate validity against the freshly reset defaults (mode 'onChange').
      void trigger();
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset, trigger]);

  // The rate field keeps its own centesimal state; mirror the real percentage
  // value (rate = internal / 100) into the form so the schema receives it.
  const handleRateChange = useCallback(
    (value: number) => {
      setRateInternal(value);
      setValue('interestRateValue', value / RATE_SCALE, { shouldValidate: true });
    },
    [setValue]
  );

  const preview = useMemo(
    () =>
      resolveLoanPreview({
        principalWatch,
        rateInternal,
        startWatch,
        startDateStr,
        firstPaymentWatch,
        firstPaymentStr,
        scheduleModeWatch,
        installmentWatch,
        interestOnlyWatch,
        rateTypeWatch,
        frequencyWatch,
        interestAccrualWatch,
        dayCountBasisWatch,
        interestModeWatch,
        amortizationWatch,
        termWatch,
      }),
    [
      principalWatch,
      termWatch,
      rateInternal,
      rateTypeWatch,
      interestModeWatch,
      interestAccrualWatch,
      dayCountBasisWatch,
      amortizationWatch,
      frequencyWatch,
      installmentWatch,
      scheduleModeWatch,
      interestOnlyWatch,
      startWatch,
      firstPaymentWatch,
      startDateStr,
      firstPaymentStr,
    ]
  );

  const previewError = getPreviewErrorCode(preview);

  // CUSTOM amortization needs one total per installment; mirror the live preview
  // schedule so the persisted plan matches what the user sees.
  useEffect(() => {
    if (amortizationWatch !== 'CUSTOM' || preview?.kind !== 'ok') return;
    setValue(
      'customTotals',
      preview.schedule.map((row) => row.totalCents),
      { shouldValidate: false }
    );
  }, [amortizationWatch, preview, setValue]);

  const handleScheduleModeChange = useCallback(
    (mode: LoanScheduleMode) => {
      setValue('scheduleMode', mode, { shouldValidate: true });
      if (mode === 'INSTALLMENT') {
        // A fixed installment only makes sense with FRENCH (constant quota) and
        // no per-installment overrides; the count is derived, not authored.
        setValue('amortizationType', 'FRENCH', { shouldValidate: true });
        setValue('termCount', undefined, { shouldValidate: true });
        setValue('customTotals', undefined, { shouldValidate: true });
      } else {
        setInstallmentAmount(0);
        setValue('installmentAmountCents', undefined, { shouldValidate: true });
        setValue('customTotals', undefined, { shouldValidate: true });
      }
    },
    [setValue]
  );

  const onSubmit = useCallback(
    async (data: CreateLoanInput) => {
      setSubmitError(null);
      const isInstallment = data.scheduleMode === 'INSTALLMENT';
      // Only the field of the active mode is sent.
      const payload: CreateLoanInput = {
        ...data,
        termCount: isInstallment ? undefined : data.termCount,
        installmentAmountCents: isInstallment ? data.installmentAmountCents : undefined,
      };
      try {
        const result = await createLoan(payload);
        if (result.success) {
          idempotencyKeyRef.current = null;
          onClose();
        } else {
          const message =
            result.code === 'VALIDATION_ERROR'
              ? translateValidationMessage(result.error, dictionary) ||
                get(dictionary, 'errors.validationFailed')
              : getLoanError(result, dictionary, 'errors.createFailed');
          setSubmitError(message);
        }
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : get(dictionary, 'errors.createFailed')
        );
      }
    },
    [dictionary, onClose]
  );

  // handleSubmit is invoked inside the DOM submit event (not during render) so
  // the ref-backed idempotency key is only touched in the event phase.
  const handleFormSubmit = useCallback(
    (e: React.SubmitEvent<HTMLFormElement>) => {
      e.preventDefault();
      void handleSubmit(onSubmit)(e);
    },
    [handleSubmit, onSubmit]
  );

  const filteredAccounts = useMemo(
    () => accounts.filter((account) => account.currency === currencyWatch),
    [accounts, currencyWatch]
  );

  // Lending money out (RECEIVABLE) is funded from the selected account, so the
  // principal can never exceed its current balance. PAYABLE receives funds and
  // therefore has no balance requirement. Recomputed on account/direction/amount
  // changes because every watched value is part of this memo.
  const selectedAccount = useMemo(
    () => (accountIdWatch ? accounts.find((account) => account.id === accountIdWatch) : undefined),
    [accounts, accountIdWatch]
  );
  const principalExceedsBalance = isPrincipalExceedsBalance(
    directionWatch,
    principalWatch,
    selectedAccount
  );

  const installmentPreviewCents = getInstallmentPreviewCents(preview);
  const scheduleRows = getScheduleRows(preview);

  // A fixed installment can never exceed the total payable (principal plus
  // interest): the backend rejects it, so mirror it here for immediate feedback.
  const installmentExceedsTotal = isInstallmentExceedsTotal(
    isInstallmentMode,
    preview,
    installmentWatch
  );

  const previewErrorMessage = resolvePreviewErrorMessage(
    installmentExceedsTotal,
    preview,
    dictionary
  );

  // Submit stays disabled until every required field validates, the preview can
  // be computed and the client-side amount/balance guards pass.
  const submitDisabled = resolveLoanSubmitDisabled({
    isValid,
    isSubmitting,
    previewError,
    installmentExceedsTotal,
    principalExceedsBalance,
  });

  const installmentFieldError = resolveInstallmentFieldError(
    installmentExceedsTotal,
    preview,
    errors.installmentAmountCents?.message,
    dictionary
  );

  return (
    <LoanDialogShell
      isOpen={isOpen}
      onClose={onClose}
      onBeforeClose={() => setSubmitError(null)}
      closeLabel={get(dictionary, 'close')}
      titleId="create-loan-title"
      title={get(dictionary, 'createLoan')}
      maxWidthClass="max-w-[96rem]"
      panelClassName="max-h-[92vh] flex flex-col overflow-hidden"
      headerClassName="flex items-center justify-between px-6 py-4 border-b border-white/8 shrink-0 bg-slate-900 z-20"
      closeRef={shellRef}
    >
      <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto px-6 py-5" noValidate>
        <input type="hidden" {...register('idempotencyKey')} />

        {/* Error alert */}
        {submitError && (
          <div
            role="alert"
            className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* Left column: form fields + actions */}
          <div className="space-y-4">
            {/* Direction */}
            <fieldset>
              <legend className={labelCls}>{get(dictionary, 'direction.label')}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DIRECTIONS.map((direction) => {
                  const isReceivable = direction === 'RECEIVABLE';
                  return (
                    <label key={direction} className="relative cursor-pointer">
                      <input
                        type="radio"
                        value={direction}
                        className="sr-only peer"
                        {...register('direction')}
                      />
                      <span
                        className={`flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-violet-400 ${
                          isReceivable
                            ? 'peer-checked:border-emerald-500/60 peer-checked:bg-emerald-500/10 peer-checked:text-emerald-400'
                            : 'peer-checked:border-amber-500/60 peer-checked:bg-amber-500/10 peer-checked:text-amber-400'
                        }`}
                      >
                        {isReceivable ? (
                          <TrendingUp className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <TrendingDown className="w-4 h-4" aria-hidden="true" />
                        )}
                        {get(dictionary, `direction.${direction}`)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="loan-name" className={labelCls}>
                  {get(dictionary, 'name')}
                </label>
                <input
                  id="loan-name"
                  type="text"
                  autoComplete="off"
                  placeholder={get(dictionary, 'namePlaceholder')}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'loan-name-error' : undefined}
                  className={inputCls}
                  {...register('name')}
                />
                <LoanFieldError
                  id="loan-name-error"
                  message={translateValidationMessage(errors.name?.message, dictionary)}
                />
              </div>
            </div>

            {/* Type + currency */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="loan-type" className={labelCls}>
                  {get(dictionary, 'type')}
                </label>
                <select id="loan-type" className={selectCls} {...register('type')}>
                  {LOAN_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-slate-800">
                      {get(dictionary, `types.${t}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="loan-currency" className={labelCls}>
                  {get(dictionary, 'currency')}
                </label>
                <select id="loan-currency" className={selectCls} {...register('currency')}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c} className="bg-slate-800">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Principal */}
            <div>
              <label htmlFor="loan-principal" className={labelCls}>
                {get(dictionary, 'principal')}
              </label>
              <FormattedNumericInput
                id="loan-principal"
                value={principalCents}
                onChange={(v) => {
                  setPrincipalCents(v);
                  setValue('principalCents', v, { shouldValidate: true });
                }}
                locale={locale}
                aria-invalid={!!errors.principalCents || principalExceedsBalance}
                aria-describedby={resolvePrincipalDescribedBy(
                  !!errors.principalCents,
                  principalExceedsBalance
                )}
                className={`${inputCls} font-mono tabular-nums`}
              />
              <LoanFieldError
                id="loan-principal-error"
                message={translateValidationMessage(errors.principalCents?.message, dictionary)}
              />
              <LoanFieldError
                id="loan-principal-balance-error"
                message={
                  principalExceedsBalance
                    ? resolveFlaggedMessage(dictionary, 'validation.principalExceedsBalance')
                    : resolveUnflaggedMessage()
                }
              />
            </div>

            {/* Rate */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="loan-rate" className={labelCls}>
                  {get(dictionary, 'interestRate')}
                </label>
                <FormattedNumericInput
                  id="loan-rate"
                  value={rateInternal}
                  onChange={handleRateChange}
                  locale={locale}
                  suffix="%"
                  maxValue={MAX_RATE_VALUE * RATE_SCALE}
                  aria-invalid={!!errors.interestRateValue}
                  aria-describedby={errors.interestRateValue ? 'loan-rate-error' : undefined}
                  className={`${inputCls} font-mono tabular-nums`}
                />
                <LoanFieldError
                  id="loan-rate-error"
                  message={translateValidationMessage(
                    errors.interestRateValue?.message,
                    dictionary
                  )}
                />
              </div>

              <div>
                <label htmlFor="loan-rate-type" className={labelCls}>
                  {get(dictionary, 'rateType.label')}
                </label>
                <select id="loan-rate-type" className={selectCls} {...register('rateType')}>
                  {RATE_TYPES.map((r) => (
                    <option key={r} value={r} className="bg-slate-800">
                      {get(dictionary, `rateType.${r}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Interest mode / accrual / day-count */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="loan-interest-mode" className={labelCls}>
                  {get(dictionary, 'interestMode.label')}
                </label>
                <select
                  id="loan-interest-mode"
                  className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={!usesDailyAccrual}
                  aria-describedby={!usesDailyAccrual ? 'loan-interest-mode-hint' : undefined}
                  {...register('interestMode')}
                >
                  {INTEREST_MODES.map((m) => (
                    <option key={m} value={m} className="bg-slate-800">
                      {get(dictionary, `interestMode.${m}`)}
                    </option>
                  ))}
                </select>
                <DailyOnlyHint
                  id="loan-interest-mode-hint"
                  show={!usesDailyAccrual}
                  dictionary={dictionary}
                />
              </div>

              <div>
                <label htmlFor="loan-interest-accrual" className={labelCls}>
                  {get(dictionary, 'interestAccrual.label')}
                </label>
                <select
                  id="loan-interest-accrual"
                  className={selectCls}
                  {...register('interestAccrual')}
                >
                  {INTEREST_ACCRUALS.map((a) => (
                    <option key={a} value={a} className="bg-slate-800">
                      {get(dictionary, `interestAccrual.${a}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="loan-day-count" className={labelCls}>
                  {get(dictionary, 'dayCountBasis.label')}
                </label>
                <select
                  id="loan-day-count"
                  className={`${selectCls} disabled:opacity-50 disabled:cursor-not-allowed`}
                  disabled={!usesDailyAccrual}
                  aria-describedby={!usesDailyAccrual ? 'loan-day-count-hint' : undefined}
                  {...register('dayCountBasis')}
                >
                  {DAY_COUNT_BASES.map((b) => (
                    <option key={b} value={b} className="bg-slate-800">
                      {get(dictionary, `dayCountBasis.${b}`)}
                    </option>
                  ))}
                </select>
                <DailyOnlyHint
                  id="loan-day-count-hint"
                  show={!usesDailyAccrual}
                  dictionary={dictionary}
                />
              </div>
            </div>

            {/* Schedule mode: mutually exclusive TERM / INSTALLMENT */}
            <fieldset>
              <legend className={labelCls}>{get(dictionary, 'scheduleMode.label')}</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {SCHEDULE_MODES.map((mode) => {
                  const isActive = scheduleModeWatch === mode;
                  const hintKey =
                    mode === 'TERM' ? 'scheduleMode.termHint' : 'scheduleMode.installmentHint';
                  return (
                    <label
                      key={mode}
                      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-violet-400 ${
                        isActive
                          ? 'border-violet-500/60 bg-violet-500/10 text-violet-300'
                          : 'border-white/10 bg-white/5 text-slate-300 hover:border-white/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="loan-schedule-mode"
                        value={mode}
                        checked={isActive}
                        onChange={() => handleScheduleModeChange(mode)}
                        aria-label={get(dictionary, `scheduleMode.${mode}`)}
                        className="sr-only"
                      />
                      <span className="flex flex-col text-left">
                        <span>{get(dictionary, `scheduleMode.${mode}`)}</span>
                        <span className="mt-0.5 text-[10px] font-normal text-slate-500">
                          {get(dictionary, hintKey)}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Amortization / frequency / term-or-installment */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label
                  htmlFor={isInstallmentMode ? undefined : 'loan-amortization'}
                  className={labelCls}
                >
                  {get(dictionary, 'amortizationType.label')}
                </label>
                {isInstallmentMode ? (
                  <>
                    <div
                      id="loan-amortization"
                      aria-disabled="true"
                      className={`${selectCls} opacity-50 cursor-not-allowed`}
                    >
                      {get(dictionary, 'amortizationType.FRENCH')}
                    </div>
                    <p className={noteCls}>{get(dictionary, 'scheduleMode.installmentHint')}</p>
                  </>
                ) : (
                  <select
                    id="loan-amortization"
                    className={selectCls}
                    {...register('amortizationType')}
                  >
                    {AMORTIZATION_TYPES.map((a) => (
                      <option key={a} value={a} className="bg-slate-800">
                        {get(dictionary, `amortizationType.${a}`)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label htmlFor="loan-frequency" className={labelCls}>
                  {get(dictionary, 'paymentFrequency')}
                </label>
                <select id="loan-frequency" className={selectCls} {...register('paymentFrequency')}>
                  {PAYMENT_FREQUENCIES.map((f) => (
                    <option key={f} value={f} className="bg-slate-800">
                      {get(dictionary, `frequency.${f}`)}
                    </option>
                  ))}
                </select>
              </div>

              {isInstallmentMode ? (
                <div>
                  <label htmlFor="loan-installment-amount" className={labelCls}>
                    {get(dictionary, 'installmentAmount')}
                  </label>
                  <FormattedNumericInput
                    id="loan-installment-amount"
                    value={installmentAmount}
                    onChange={(v) => {
                      setInstallmentAmount(v);
                      setValue('installmentAmountCents', v || undefined, {
                        shouldValidate: true,
                      });
                    }}
                    locale={locale}
                    aria-invalid={installmentFieldError != null}
                    aria-describedby={installmentFieldError ? 'loan-installment-error' : undefined}
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                  <InstallmentAmountFeedback
                    dictionary={dictionary}
                    error={installmentFieldError}
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor="loan-term" className={labelCls}>
                    {get(dictionary, 'term')}
                  </label>
                  <input
                    id="loan-term"
                    type="number"
                    min="1"
                    max="1200"
                    step="1"
                    inputMode="numeric"
                    aria-invalid={!!errors.termCount}
                    aria-describedby="loan-term-hint"
                    className={`${inputCls} tabular-nums`}
                    {...register('termCount', { valueAsNumber: true })}
                  />
                  <p id="loan-term-hint" className={hintCls}>
                    {get(dictionary, 'termHint')}
                  </p>
                  <LoanFieldError
                    message={translateValidationMessage(errors.termCount?.message, dictionary)}
                  />
                </div>
              )}
            </div>

            {/* Interest-only installments (valid in both schedule modes) */}
            <div>
              <label htmlFor="loan-interest-only" className={labelCls}>
                {get(dictionary, 'interestOnlyInstallments')}
              </label>
              <p className={hintCls}>{get(dictionary, 'interestOnlyHint')}</p>
              <input
                id="loan-interest-only"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                aria-invalid={!!errors.interestOnlyInstallments}
                className={`${inputCls} tabular-nums`}
                {...register('interestOnlyInstallments', { valueAsNumber: true })}
              />
              <LoanFieldError
                message={translateValidationMessage(
                  errors.interestOnlyInstallments?.message,
                  dictionary
                )}
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="loan-start-date" className={labelCls}>
                  {get(dictionary, 'startDate')}
                </label>
                <input
                  id="loan-start-date"
                  type="date"
                  value={startDateStr}
                  aria-invalid={!!errors.startDate}
                  className={inputCls}
                  onChange={(e) => {
                    setStartDateStr(e.target.value);
                    if (e.target.value)
                      setValue('startDate', parseDateInput(e.target.value), {
                        shouldValidate: true,
                      });
                  }}
                />
              </div>

              <div>
                <label htmlFor="loan-first-payment" className={labelCls}>
                  {get(dictionary, 'firstPaymentDate')}
                </label>
                <input
                  id="loan-first-payment"
                  type="date"
                  value={firstPaymentStr}
                  aria-invalid={!!errors.firstPaymentDate}
                  aria-describedby={
                    errors.firstPaymentDate ? 'loan-first-payment-error' : undefined
                  }
                  className={inputCls}
                  onChange={(e) => {
                    setFirstPaymentStr(e.target.value);
                    if (e.target.value)
                      setValue('firstPaymentDate', parseDateInput(e.target.value), {
                        shouldValidate: true,
                      });
                  }}
                />
                <LoanFieldError
                  id="loan-first-payment-error"
                  message={translateValidationMessage(errors.firstPaymentDate?.message, dictionary)}
                />
              </div>
            </div>

            {/* Optional account */}
            <div>
              <label htmlFor="loan-account" className={labelCls}>
                {get(dictionary, 'account')}
              </label>
              <p className={hintCls}>{get(dictionary, 'accountHint')}</p>
              <select
                id="loan-account"
                className={selectCls}
                {...register('accountId', { setValueAs: (v: string) => v || undefined })}
              >
                <option value="" className="bg-slate-800">
                  — {get(dictionary, 'selectAccount')}
                </option>
                {filteredAccounts.map((account) => (
                  <option key={account.id} value={account.id} className="bg-slate-800">
                    {account.name} ({formatMoney(account.balanceCents, account.currency, locale)})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="loan-notes" className={labelCls}>
                {get(dictionary, 'notes')}
              </label>
              <textarea
                id="loan-notes"
                rows={2}
                className={`${inputCls} resize-none`}
                {...register('notes', { setValueAs: (v: string) => v || undefined })}
              />
            </div>

            {/* Color */}
            <LoanColorField
              dictionary={dictionary}
              selectedColor={selectedColor}
              customColor={customColor}
              onPresetSelect={(value) => {
                setSelectedColor(value);
                setValue('color', value);
              }}
              onCustomChange={(value) => {
                setCustomColor(value);
                setSelectedColor(value);
                setValue('color', value);
              }}
            />

            {/* Actions */}
            <LoanFormActions
              dictionary={dictionary}
              isSubmitting={isSubmitting}
              submitDisabled={submitDisabled}
              onClose={() => shellRef.current?.close()}
            />
          </div>

          {/* Right column: full live preview (own scroll) */}
          <LoanPreviewPanel
            dictionary={dictionary}
            locale={locale}
            preview={preview}
            previewErrorMessage={previewErrorMessage}
            isInstallmentMode={isInstallmentMode}
            installmentPreviewCents={installmentPreviewCents}
            scheduleRows={scheduleRows}
            currency={currencyWatch ?? 'COP'}
          />
        </div>
      </form>
    </LoanDialogShell>
  );
}
