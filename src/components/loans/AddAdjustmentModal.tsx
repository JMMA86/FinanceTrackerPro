'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { translateValidationMessage } from '@/lib/i18n/validation';
import { formatMoney } from '@/lib/money';
import { addLoanAdjustment } from '@/actions/loan.actions';
import type { AddLoanAdjustmentInput } from '@/actions/loan.schema';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import type { AccountBrief } from '@/components/transactions/types';
import type { LoanAdjustmentType, LoanWithInstallments } from '@/types/loans';
import { getLoanError } from './getLoanError';
import { LoanDialogShell, type LoanDialogRenderApi } from './LoanDialogShell';

interface AddAdjustmentModalProps {
  loan: LoanWithInstallments;
  accounts: AccountBrief[];
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

const ADJUSTMENT_TYPES: ReadonlyArray<LoanAdjustmentType> = [
  'EXTRA_DISBURSEMENT',
  'EXTRA_PAYMENT',
  'RATE_CHANGE',
  'RESCHEDULE',
  'CUSTOM_INSTALLMENT',
  'INTEREST_ONLY_PERIOD',
];

const INPUT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
const SELECT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
const LABEL_CLS = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateInput(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function isAmountType(type: LoanAdjustmentType): boolean {
  return type === 'EXTRA_DISBURSEMENT' || type === 'EXTRA_PAYMENT' || type === 'CUSTOM_INSTALLMENT';
}

function isAccountType(type: LoanAdjustmentType): boolean {
  return type === 'EXTRA_DISBURSEMENT' || type === 'EXTRA_PAYMENT';
}

function isInstallmentType(type: LoanAdjustmentType): boolean {
  return type === 'CUSTOM_INSTALLMENT' || type === 'INTEREST_ONLY_PERIOD';
}

/**
 * Apply a post-creation loan adjustment (extra disbursement/payment, rate
 * change, reschedule, custom installment or interest-only period). Only the
 * fields relevant to the selected type are collected and sent. The idempotency
 * key is stable per opening and cleared only on success.
 */
export function AddAdjustmentModal({
  loan,
  accounts,
  dictionary,
  locale,
  isOpen,
  onClose,
}: Readonly<AddAdjustmentModalProps>) {
  const idempotencyKeyRef = useRef<string | null>(null);
  const shellRef = useRef<LoanDialogRenderApi | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [type, setType] = useState<LoanAdjustmentType>('EXTRA_PAYMENT');
  const [effectiveDateStr, setEffectiveDateStr] = useState('');
  const [amountCents, setAmountCents] = useState(0);
  const [newRateValue, setNewRateValue] = useState('');
  const [newTermCount, setNewTermCount] = useState('');
  const [installmentNumber, setInstallmentNumber] = useState('');
  const [accountId, setAccountId] = useState('');
  const [notes, setNotes] = useState('');

  const currencyAccounts = accounts.filter((account) => account.currency === loan.currency);

  useEffect(() => {
    if (!isOpen) return;
    idempotencyKeyRef.current = crypto.randomUUID();
    const id = requestAnimationFrame(() => {
      setType('EXTRA_PAYMENT');
      setEffectiveDateStr(toDateInputValue(new Date()));
      setAmountCents(0);
      setNewRateValue('');
      setNewTermCount('');
      setInstallmentNumber('');
      setAccountId('');
      setNotes('');
      setSubmitError(null);
      setIsSubmitting(false);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  function buildInput(): AddLoanAdjustmentInput | null {
    if (!idempotencyKeyRef.current || !effectiveDateStr) return null;

    const input: AddLoanAdjustmentInput = {
      loanId: loan.id,
      type,
      effectiveDate: parseDateInput(effectiveDateStr),
      notes: notes || undefined,
      idempotencyKey: idempotencyKeyRef.current,
    };

    if (isAmountType(type)) {
      if (!Number.isInteger(amountCents) || amountCents <= 0) return null;
      input.amountCents = amountCents;
    }
    if (isAccountType(type) && accountId) {
      input.accountId = accountId;
    }
    if (type === 'RATE_CHANGE') {
      const parsedRate = Number(newRateValue);
      if (newRateValue === '' || !Number.isFinite(parsedRate) || parsedRate < 0) return null;
      input.newRateValue = parsedRate;
    }
    if (type === 'RESCHEDULE') {
      const parsedTerm = Number(newTermCount);
      if (!Number.isInteger(parsedTerm) || parsedTerm < 1) return null;
      input.newTermCount = parsedTerm;
    }
    if (isInstallmentType(type)) {
      const parsedNumber = Number(installmentNumber);
      if (!Number.isInteger(parsedNumber) || parsedNumber < 1) return null;
      input.installmentNumber = parsedNumber;
    }

    return input;
  }

  async function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = buildInput();
    if (!input) {
      setSubmitError(get(dictionary, 'errors.adjustmentInvalid'));
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await addLoanAdjustment(input);
      if (result.success) {
        idempotencyKeyRef.current = null;
        onClose();
        return;
      }
      const message =
        result.code === 'VALIDATION_ERROR'
          ? translateValidationMessage(result.error, dictionary) ||
            get(dictionary, 'errors.validationFailed')
          : getLoanError(result, dictionary, 'errors.adjustmentFailed');
      setSubmitError(message);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : get(dictionary, 'errors.adjustmentFailed')
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <LoanDialogShell
      isOpen={isOpen}
      onClose={onClose}
      onBeforeClose={() => setSubmitError(null)}
      closeLabel={get(dictionary, 'close')}
      titleId="add-adjustment-title"
      title={get(dictionary, 'addAdjustment')}
      headerSlot={<span className="text-slate-400 ml-1">— {loan.name}</span>}
      maxWidthClass="max-w-lg"
      panelClassName="max-h-[90vh] overflow-y-auto"
      closeRef={shellRef}
    >
      <form onSubmit={onSubmit} className="px-6 py-5 space-y-4" noValidate>
        {submitError && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        {/* Type */}
        <div>
          <label htmlFor="adjustment-type" className={LABEL_CLS}>
            {get(dictionary, 'adjustmentType')}
          </label>
          <select
            id="adjustment-type"
            value={type}
            onChange={(event) => {
              setType(event.target.value as LoanAdjustmentType);
              setSubmitError(null);
            }}
            className={SELECT_CLS}
          >
            {ADJUSTMENT_TYPES.map((option) => (
              <option key={option} value={option} className="bg-slate-800">
                {get(dictionary, `adjustmentTypes.${option}`)}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-slate-500">
            {get(dictionary, `adjustmentTypeHint.${type}`)}
          </p>
        </div>

        {/* Effective date */}
        <div>
          <label htmlFor="adjustment-date" className={LABEL_CLS}>
            {get(dictionary, 'effectiveDate')}
          </label>
          <input
            id="adjustment-date"
            type="date"
            value={effectiveDateStr}
            onChange={(event) => setEffectiveDateStr(event.target.value)}
            className={INPUT_CLS}
            required
          />
        </div>

        {/* Amount */}
        {isAmountType(type) && (
          <div>
            <label htmlFor="adjustment-amount" className={LABEL_CLS}>
              {get(dictionary, 'adjustmentAmount')}
              <span className="text-slate-500 font-normal lowercase ml-1">({loan.currency})</span>
            </label>
            <FormattedNumericInput
              id="adjustment-amount"
              value={amountCents}
              onChange={setAmountCents}
              locale={locale}
              className={`${INPUT_CLS} font-mono tabular-nums`}
            />
          </div>
        )}

        {/* New rate */}
        {type === 'RATE_CHANGE' && (
          <div>
            <label htmlFor="adjustment-rate" className={LABEL_CLS}>
              {get(dictionary, 'newRate')}
            </label>
            <input
              id="adjustment-rate"
              type="number"
              step="0.01"
              min="0"
              max="1000"
              inputMode="decimal"
              value={newRateValue}
              onChange={(event) => setNewRateValue(event.target.value)}
              className={`${INPUT_CLS} tabular-nums`}
              required
            />
          </div>
        )}

        {/* New term */}
        {type === 'RESCHEDULE' && (
          <div>
            <label htmlFor="adjustment-term" className={LABEL_CLS}>
              {get(dictionary, 'newTerm')}
            </label>
            <input
              id="adjustment-term"
              type="number"
              min="1"
              max="1200"
              step="1"
              inputMode="numeric"
              value={newTermCount}
              onChange={(event) => setNewTermCount(event.target.value)}
              className={`${INPUT_CLS} tabular-nums`}
              required
            />
          </div>
        )}

        {/* Installment number */}
        {isInstallmentType(type) && (
          <div>
            <label htmlFor="adjustment-installment" className={LABEL_CLS}>
              {get(dictionary, 'installmentNumber')}
            </label>
            <input
              id="adjustment-installment"
              type="number"
              min="1"
              max={loan.termCount}
              step="1"
              inputMode="numeric"
              value={installmentNumber}
              onChange={(event) => setInstallmentNumber(event.target.value)}
              className={`${INPUT_CLS} tabular-nums`}
              required
            />
          </div>
        )}

        {/* Optional account (money movements only) */}
        {isAccountType(type) && (
          <div>
            <label htmlFor="adjustment-account" className={LABEL_CLS}>
              {get(dictionary, 'account')}
            </label>
            <select
              id="adjustment-account"
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              className={SELECT_CLS}
            >
              <option value="" className="bg-slate-800">
                — {get(dictionary, 'selectAccount')}
              </option>
              {currencyAccounts.map((account) => (
                <option key={account.id} value={account.id} className="bg-slate-800">
                  {account.name} ({formatMoney(account.balanceCents, account.currency, locale)})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Notes */}
        <div>
          <label htmlFor="adjustment-notes" className={LABEL_CLS}>
            {get(dictionary, 'paymentNotes')}
          </label>
          <textarea
            id="adjustment-notes"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className={`${INPUT_CLS} resize-none`}
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => shellRef.current?.close()}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {isSubmitting ? (
              <>{get(dictionary, 'loading')}</>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {get(dictionary, 'addAdjustment')}
              </>
            )}
          </button>
        </div>
      </form>
    </LoanDialogShell>
  );
}
