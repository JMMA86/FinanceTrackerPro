'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { translateValidationMessage } from '@/lib/i18n/validation';
import { formatMoney } from '@/lib/money';
import { registerLoanPayment } from '@/actions/loan.actions';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import type { AccountBrief } from '@/components/transactions/types';
import type { LoanInstallmentSerialized, LoanWithInstallments } from '@/types/loans';
import { getLoanError } from './getLoanError';
import { LoanDialogShell, type LoanDialogRenderApi } from './LoanDialogShell';

interface RegisterPaymentModalProps {
  loan: LoanWithInstallments;
  installment: LoanInstallmentSerialized | null;
  accounts: AccountBrief[];
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

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

/**
 * Register a payment (PAYABLE) or receipt (RECEIVABLE) against a single loan
 * installment. Accounts are limited to the loan currency, the amount defaults
 * to the remaining balance and may be lowered for partial payments. The
 * idempotency key is stable per opening and cleared only on success.
 */
export function RegisterPaymentModal({
  loan,
  installment,
  accounts,
  dictionary,
  locale,
  isOpen,
  onClose,
}: Readonly<RegisterPaymentModalProps>) {
  const idempotencyKeyRef = useRef<string | null>(null);
  const shellRef = useRef<LoanDialogRenderApi | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [notes, setNotes] = useState('');

  const remainingCents = installment
    ? Math.max(0, installment.totalCents - (installment.paidAmountCents ?? 0))
    : 0;
  const currencyAccounts = accounts.filter((account) => account.currency === loan.currency);
  const paidCents = installment?.paidAmountCents ?? 0;

  useEffect(() => {
    if (!isOpen) return;
    // Fresh idempotency key per opening; retries inside the same opening reuse it.
    idempotencyKeyRef.current = crypto.randomUUID();
    const remaining = installment
      ? Math.max(0, installment.totalCents - (installment.paidAmountCents ?? 0))
      : 0;
    const firstAccount = accounts.find((account) => account.currency === loan.currency);
    const id = requestAnimationFrame(() => {
      setAmountCents(remaining);
      setAccountId(firstAccount?.id ?? '');
      setDateStr(toDateInputValue(new Date()));
      setNotes('');
      setSubmitError(null);
      setIsSubmitting(false);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, installment, accounts, loan.currency]);

  const handleSubmit = useCallback(
    async (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!installment) return;

      if (!accountId) {
        setSubmitError(get(dictionary, 'errors.paymentInvalid'));
        return;
      }
      if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > remainingCents) {
        setSubmitError(get(dictionary, 'errors.paymentInvalid'));
        return;
      }

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        if (!idempotencyKeyRef.current) {
          idempotencyKeyRef.current = crypto.randomUUID();
        }
        const result = await registerLoanPayment({
          installmentId: installment.id,
          accountId,
          amountCents,
          date: dateStr ? parseDateInput(dateStr) : undefined,
          notes: notes || undefined,
          idempotencyKey: idempotencyKeyRef.current,
        });

        if (result.success) {
          idempotencyKeyRef.current = null;
          onClose();
          return;
        }
        const message =
          result.code === 'VALIDATION_ERROR'
            ? translateValidationMessage(result.error, dictionary) ||
              get(dictionary, 'errors.validationFailed')
            : getLoanError(result, dictionary, 'errors.paymentFailed');
        setSubmitError(message);
      } catch (error) {
        setSubmitError(
          error instanceof Error ? error.message : get(dictionary, 'errors.paymentFailed')
        );
      } finally {
        setIsSubmitting(false);
      }
    },
    [installment, accountId, amountCents, remainingCents, dateStr, notes, dictionary, onClose]
  );

  return (
    <LoanDialogShell
      isOpen={isOpen}
      onClose={onClose}
      onBeforeClose={() => setSubmitError(null)}
      closeLabel={get(dictionary, 'close')}
      titleId="register-payment-title"
      title={get(dictionary, 'registerPayment')}
      headerSlot={
        installment ? (
          <span className="text-slate-400 ml-1">
            — {loan.name} #{installment.installmentNumber}
          </span>
        ) : null
      }
      maxWidthClass="max-w-lg"
      panelClassName="max-h-[90vh] overflow-y-auto"
      closeRef={shellRef}
    >
      <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" noValidate>
        {submitError && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        {installment && (
          <div className="bg-white/5 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{get(dictionary, 'table.installment')}</span>
              <span className="font-semibold text-white tabular-nums">
                {formatMoney(installment.totalCents, loan.currency, locale)}
              </span>
            </div>
            {paidCents > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{get(dictionary, 'paidAmount')}</span>
                <span className="font-semibold text-emerald-400 tabular-nums">
                  {formatMoney(paidCents, loan.currency, locale)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{get(dictionary, 'remaining')}</span>
              <span className="font-semibold text-amber-400 tabular-nums">
                {formatMoney(remainingCents, loan.currency, locale)}
              </span>
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <label htmlFor="loan-payment-amount" className={LABEL_CLS}>
            {get(dictionary, 'paymentAmount')}
            <span className="text-slate-500 font-normal lowercase ml-1">({loan.currency})</span>
          </label>
          <FormattedNumericInput
            id="loan-payment-amount"
            value={amountCents}
            onChange={setAmountCents}
            locale={locale}
            maxValue={remainingCents}
            className={`${INPUT_CLS} font-mono tabular-nums text-lg`}
          />
          <p className="mt-1.5 text-xs text-slate-500">{get(dictionary, 'partialPaymentHint')}</p>
        </div>

        {/* Account */}
        <div>
          <label htmlFor="loan-payment-account" className={LABEL_CLS}>
            {get(dictionary, 'account')}
          </label>
          <select
            id="loan-payment-account"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className={SELECT_CLS}
            required
          >
            <option value="" className="bg-slate-800" disabled>
              {get(dictionary, 'selectAccount')}
            </option>
            {currencyAccounts.map((account) => (
              <option key={account.id} value={account.id} className="bg-slate-800">
                {account.name} ({formatMoney(account.balanceCents, account.currency, locale)})
              </option>
            ))}
          </select>
          {currencyAccounts.length === 0 && (
            <p className="mt-1.5 text-xs text-amber-400">{get(dictionary, 'selectAccount')}</p>
          )}
        </div>

        {/* Date */}
        <div>
          <label htmlFor="loan-payment-date" className={LABEL_CLS}>
            {get(dictionary, 'paymentDate')}
          </label>
          <input
            id="loan-payment-date"
            type="date"
            value={dateStr}
            onChange={(event) => setDateStr(event.target.value)}
            className={INPUT_CLS}
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="loan-payment-notes" className={LABEL_CLS}>
            {get(dictionary, 'paymentNotes')}
          </label>
          <textarea
            id="loan-payment-notes"
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
            disabled={isSubmitting || amountCents <= 0 || !accountId}
            aria-busy={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {isSubmitting ? (
              <>{get(dictionary, 'loading')}</>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {get(dictionary, 'confirmPayment')}
              </>
            )}
          </button>
        </div>
      </form>
    </LoanDialogShell>
  );
}
