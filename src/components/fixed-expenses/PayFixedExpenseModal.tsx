'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { payFixedExpense } from '@/actions/fixed-expense.actions';
import { PayFixedExpenseSchema, type PayFixedExpenseInput } from '@/actions/fixed-expense.schema';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import type {
  FixedExpensePaymentSerialized,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';
import { FixedExpenseDialog } from './FixedExpenseDialog';
import { toDateInputValue } from './constants';

interface BankAccount {
  id: string;
  name: string;
  currency: string;
  balanceCents: number;
}

interface PayFixedExpenseModalProps {
  expense: FixedExpenseWithPayments;
  payment: FixedExpensePaymentSerialized;
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

const INPUT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-transparent transition-all';
const SELECT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/60 focus:border-transparent transition-all appearance-none';
const LABEL_CLS = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const HINT_CLS = 'text-[10px] text-slate-500 mb-1.5';
const ERROR_CLS = 'mt-1 text-xs text-red-400';

/** Maps backend payment error codes to localized messages. */
function mapPayError(code: string | undefined, dictionary: Record<string, unknown>): string {
  switch (code) {
    case 'FIXED_EXPENSE_ALREADY_PAID':
      return get(dictionary, 'errors.alreadyPaid');
    case 'PAYMENT_AMOUNT_INVALID':
      return get(dictionary, 'errors.invalidAmount');
    case 'INSUFFICIENT_FUNDS':
      return get(dictionary, 'errors.insufficientFunds');
    case 'CURRENCY_MISMATCH':
      return get(dictionary, 'errors.currencyMismatch');
    case 'RATE_LIMITED':
      return get(dictionary, 'errors.rateLimited');
    case 'UNAUTHORIZED':
      return get(dictionary, 'errors.sessionInvalid');
    default:
      return get(dictionary, 'errors.payFailed');
  }
}

/**
 * Pay a materialized fixed expense payment. The source account list is filtered
 * to the payment currency; the amount defaults to the expected amount but can be
 * overridden. The idempotency key is generated once per logical attempt and kept
 * across retries (cleared only after a confirmed success).
 */
export function PayFixedExpenseModal({
  expense,
  payment,
  dictionary,
  locale,
  isOpen,
  onClose,
}: Readonly<PayFixedExpenseModalProps>) {
  const idempotencyKeyRef = useRef<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(payment.expectedAmountCents);
  // Accounts are stored keyed by currency: the list is only considered "loaded"
  // for the payment currency, so switching/opening never shows a notice or an
  // option list for the wrong currency.
  const [accountsState, setAccountsState] = useState<{
    currency: string;
    accounts: BankAccount[];
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PayFixedExpenseInput>({
    resolver: zodResolver(PayFixedExpenseSchema) as Resolver<PayFixedExpenseInput>,
    defaultValues: {
      paymentId: payment.id,
      amountCents: payment.expectedAmountCents,
    },
  });

  const selectedAccountId = useWatch({ control, name: 'accountId' });

  const accounts = accountsState?.currency === payment.currency ? accountsState.accounts : [];
  const isLoadingAccounts = accountsState?.currency !== payment.currency;

  const loadAccounts = useCallback(async (currency: string): Promise<BankAccount[]> => {
    try {
      const { getBankAccounts } = await import('@/actions/account.actions');
      const res = await getBankAccounts({});
      const all = res.success && res.data ? (res.data as BankAccount[]) : [];
      const filtered = all.filter((account) => account.currency === currency);
      setAccountsState({ currency, accounts: filtered });
      return filtered;
    } catch {
      setAccountsState({ currency, accounts: [] });
      return [];
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    // Keep the same idempotency key across retries; only a confirmed success
    // clears it (see onSubmit).
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    reset({
      paymentId: payment.id,
      accountId: undefined,
      amountCents: payment.expectedAmountCents,
      date: undefined,
      notes: undefined,
      idempotencyKey: idempotencyKeyRef.current,
    });
    const id = requestAnimationFrame(() => {
      setAmountCents(payment.expectedAmountCents);
      setSubmitError(null);
      setValue('date', new Date(), { shouldValidate: false, shouldDirty: false });
    });
    // Deferred so the account fetch does not call setState synchronously in the
    // effect body (React Compiler rule react-hooks/set-state-in-effect). The
    // first account in the payment currency is auto-selected so submitting the
    // prefilled form never fails with a raw CUID validation error.
    const timer = setTimeout(() => {
      void (async () => {
        const available = await loadAccounts(payment.currency);
        if (available.length > 0) {
          setValue('accountId', available[0].id, { shouldValidate: true });
        }
      })();
    }, 0);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(timer);
    };
  }, [isOpen, reset, setValue, payment, loadAccounts]);

  const onSubmit = useCallback(
    async (data: PayFixedExpenseInput) => {
      setSubmitError(null);
      try {
        const result = await payFixedExpense(data);
        if (result.success) {
          idempotencyKeyRef.current = null;
          onClose();
        } else {
          setSubmitError(mapPayError(result.code, dictionary));
        }
      } catch {
        setSubmitError(get(dictionary, 'errors.payFailed'));
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

  // Account feedback resolved with independent statements instead of a nested
  // ternary (Sonar S3358). The raw "Must be a valid CUID" schema message is
  // never surfaced: the error branch always shows a friendly i18n message.
  let accountMessage: ReactNode = null;
  if (errors.accountId) {
    accountMessage = (
      <p id="pay-fixed-expense-account-error" role="alert" className={ERROR_CLS}>
        {get(dictionary, 'errors.selectAccount')}
      </p>
    );
  } else if (!isLoadingAccounts && accounts.length === 0) {
    accountMessage = (
      <output id="pay-fixed-expense-account-error" className="mt-1.5 block text-xs text-amber-400">
        {get(dictionary, 'noAccountsForCurrency')}
      </output>
    );
  }

  return (
    <FixedExpenseDialog
      open={isOpen}
      titleId="pay-fixed-expense-title"
      title={
        <>
          {get(dictionary, 'pay')}
          <span className="text-slate-400 ml-1">— {expense.name}</span>
        </>
      }
      dictionary={dictionary}
      onClose={onClose}
    >
      <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
        <input type="hidden" {...register('paymentId')} />
        <input type="hidden" {...register('idempotencyKey')} />

        {/* Error alert */}
        {submitError && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        {/* Expected amount summary */}
        <div className="bg-white/5 rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">{get(dictionary, 'dueDate')}</span>
            <span className="font-semibold text-white">
              {new Date(payment.dueDate).toLocaleDateString(locale, {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">{get(dictionary, 'amount')}</span>
            <span className="font-semibold text-amber-400 tabular-nums">
              {formatMoney(payment.expectedAmountCents, payment.currency, locale)}
            </span>
          </div>
        </div>

        {/* Amount override */}
        <div>
          <label htmlFor="pay-fixed-expense-amount" className={LABEL_CLS}>
            {get(dictionary, 'paymentAmount')}
          </label>
          <p className={HINT_CLS}>{get(dictionary, 'paymentAmountHint')}</p>
          <FormattedNumericInput
            id="pay-fixed-expense-amount"
            value={amountCents}
            onChange={(value) => {
              setAmountCents(value);
              setValue('amountCents', value, { shouldValidate: true });
            }}
            locale={locale}
            aria-invalid={!!errors.amountCents}
            aria-describedby={errors.amountCents ? 'pay-fixed-expense-amount-error' : undefined}
            className={`${INPUT_CLS} font-mono tabular-nums`}
          />
          {errors.amountCents && (
            <p id="pay-fixed-expense-amount-error" role="alert" className={ERROR_CLS}>
              {errors.amountCents.message}
            </p>
          )}
        </div>

        {/* Source account */}
        <div>
          <label htmlFor="pay-fixed-expense-account" className={LABEL_CLS}>
            {get(dictionary, 'sourceAccount')}
          </label>
          <select
            id="pay-fixed-expense-account"
            className={SELECT_CLS}
            required
            disabled={isLoadingAccounts}
            {...register('accountId')}
            aria-invalid={!!errors.accountId}
            aria-describedby={
              errors.accountId || (!isLoadingAccounts && accounts.length === 0)
                ? 'pay-fixed-expense-account-error'
                : undefined
            }
          >
            <option value="" disabled className="bg-slate-800">
              {isLoadingAccounts ? get(dictionary, 'loading') : get(dictionary, 'selectAccount')}
            </option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id} className="bg-slate-800">
                {account.name} ({formatMoney(account.balanceCents, account.currency, locale)})
              </option>
            ))}
          </select>
          {/* Always friendly: never surface the raw "Must be a valid CUID" schema message. */}
          {accountMessage}
        </div>

        {/* Payment date */}
        <div>
          <label htmlFor="pay-fixed-expense-date" className={LABEL_CLS}>
            {get(dictionary, 'paymentDate')}
          </label>
          <Controller
            control={control}
            name="date"
            render={({ field }) => (
              <input
                id="pay-fixed-expense-date"
                type="date"
                className={INPUT_CLS}
                value={field.value ? toDateInputValue(field.value) : ''}
                onChange={(e) =>
                  field.onChange(e.target.value ? new Date(e.target.value) : undefined)
                }
                onBlur={field.onBlur}
              />
            )}
          />
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="pay-fixed-expense-notes" className={LABEL_CLS}>
            {get(dictionary, 'paymentNotes')}
          </label>
          <textarea
            id="pay-fixed-expense-notes"
            rows={2}
            className={`${INPUT_CLS} resize-none`}
            {...register('notes', { setValueAs: (v: string) => v || undefined })}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting || isLoadingAccounts || amountCents <= 0 || !selectedAccountId}
            className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70"
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
    </FixedExpenseDialog>
  );
}
