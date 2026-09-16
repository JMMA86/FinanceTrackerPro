'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useForm, useWatch, type UseFormRegister } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { X, ArrowUpRight, ArrowDownRight, AlertCircle } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { createTransaction, updateTransaction } from '@/actions/transaction.actions';
import { payFixedExpense } from '@/actions/fixed-expense.actions';
import { registerLoanPayment, addLoanAdjustment } from '@/actions/loan.actions';
import { get } from '@/lib/i18n';
import { translateValidationMessage } from '@/lib/i18n/validation';
import type { Locale } from '@/lib/i18n';
import { toLocalDateTimeInput } from '@/lib/utils/date-utils';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { AccountSelect } from '@/components/transactions/AccountSelect';
import { isPocket } from '@/components/transactions/transferRules';
import { comparePaymentsByDueDate } from '@/components/fixed-expenses/constants';
import { formatMoney } from '@/lib/money';
import { getTransactionError } from '@/components/transactions/getTransactionError';
import type { AccountBrief, CategoryBrief, TransactionRow } from '@/components/transactions/types';
import type {
  FixedExpensePaymentSerialized,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';
import type { VariableExpenseDefinition } from '@/types/variable-expense';
import type { LoanPaymentOption, LoanPaymentOptionInstallment } from '@/types/loans';

// ---------------------------------------------------------------------------
// Expense nature (create + EXPENSE only)
// ---------------------------------------------------------------------------

type ExpenseNature = 'NORMAL' | 'FIXED' | 'VARIABLE' | 'LOAN';

const NATURE_OPTIONS: ReadonlyArray<{ value: ExpenseNature; labelKey: string }> = [
  { value: 'NORMAL', labelKey: 'natureNormal' },
  { value: 'FIXED', labelKey: 'natureFixed' },
  { value: 'VARIABLE', labelKey: 'natureVariable' },
  { value: 'LOAN', labelKey: 'natureLoan' },
];

/**
 * Natures offered per transaction type: EXPENSE supports all four; INCOME only
 * Normal and Loan (a receivable loan generates a receipt/income).
 */
function getNatureOptions(
  isExpense: boolean
): ReadonlyArray<{ value: ExpenseNature; labelKey: string }> {
  if (isExpense) return NATURE_OPTIONS;
  return NATURE_OPTIONS.filter((option) => option.value === 'NORMAL' || option.value === 'LOAN');
}

type Notify = (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;

interface IdempotencyKeyRef {
  current: string | null;
}

// ---------------------------------------------------------------------------
// Client-side validation schema
// ---------------------------------------------------------------------------

const CreateTransactionFormSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], {
    message: 'validation.selectType',
  }),
  accountId: z.string().min(1, 'validation.selectAccount'),
  categoryId: z.string().optional(),
  amountCents: z.number().int('validation.amountWhole').positive('validation.amountPositive'),
  description: z.string().max(500, 'validation.descriptionTooLong').optional(),
  date: z.string().optional(),
});

type CreateTransactionFormData = z.infer<typeof CreateTransactionFormSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CreateTransactionModalProps {
  accounts: AccountBrief[];
  categories: CategoryBrief[];
  dictionary: Record<string, unknown>;
  lang: Locale;
  locale?: string;
  onOpenCategoryManager?: () => void;
  /**
   * Optional callback fired after a successful create/update. Host pages that
   * own server data (e.g. variable expenses) use it to refresh their RSC.
   * Retro-compatible: the transactions page omits it.
   */
  onSuccess?: () => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const errorCls = 'mt-1 text-xs text-red-400';
const MAX_SAFE = 9_999_999_999_999;

/** Amount shown as "Disponible para gastar": available credit for cards, balance otherwise. */
function getAvailableToSpend(account: AccountBrief): number {
  return account.type === 'CREDIT_CARD'
    ? (account.availableCreditCents ?? 0)
    : account.balanceCents;
}

/** Max amount the input accepts: available credit for cards, balance for banks, unlimited when editing. */
function getAmountMaxValue(
  account: AccountBrief | null | undefined,
  isEditing: boolean,
  isExpense: boolean
): number {
  if (isEditing || !isExpense || !account) return MAX_SAFE;
  return account.type === 'CREDIT_CARD'
    ? (account.availableCreditCents ?? MAX_SAFE)
    : account.balanceCents;
}

/**
 * Resolve the pending payments of a fixed expense that are eligible for the
 * chosen transaction date: the occurrence due THIS month, plus the first one due
 * after the month (to offer "advance next month's payment").
 */
function resolveFixedPaymentTargets(
  expense: FixedExpenseWithPayments | null,
  date: Date
): FixedExpensePaymentTargets {
  if (!expense) return { monthPayment: null, nextPayment: null };

  const pending = expense.payments
    .filter((payment) => payment.paidDate == null)
    .sort(comparePaymentsByDueDate);

  const year = date.getFullYear();
  const month = date.getMonth();
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999).getTime();

  const monthPayment =
    pending.find((payment) => {
      const due = new Date(payment.dueDate);
      return due.getFullYear() === year && due.getMonth() === month;
    }) ?? null;

  const nextPayment =
    pending.find((payment) => new Date(payment.dueDate).getTime() > monthEnd) ?? null;

  return { monthPayment, nextPayment };
}

interface FixedExpensePaymentTargets {
  monthPayment: FixedExpensePaymentSerialized | null;
  nextPayment: FixedExpensePaymentSerialized | null;
}

function formatLongDate(value: Date | string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Derived-state helpers (kept out of the component to limit its complexity)
// ---------------------------------------------------------------------------

function resolveEffectiveNature(isExpense: boolean, nature: ExpenseNature): ExpenseNature {
  if (isExpense) return nature;
  // Income supports only Normal or Loan (receivable receipts).
  return nature === 'LOAN' ? 'LOAN' : 'NORMAL';
}

function resolveFixedTarget(
  targets: FixedExpensePaymentTargets,
  advanceNextMonth: boolean
): FixedExpensePaymentSerialized | null {
  return targets.monthPayment ?? (advanceNextMonth ? targets.nextPayment : null);
}

function isFixedCurrencyMismatch(
  nature: ExpenseNature,
  target: FixedExpensePaymentSerialized | null,
  account: AccountBrief | undefined
): boolean {
  if (nature !== 'FIXED' || !target || !account) return false;
  return account.currency !== target.currency;
}

function resolveVariableExpenseOptions(
  definitions: VariableExpenseDefinition[],
  account: AccountBrief | undefined
): VariableExpenseDefinition[] {
  if (!account) return definitions;
  return definitions.filter((definition) => definition.currency === account.currency);
}

/** Loan movement the user can register from a selected loan. */
type LoanAction = 'PAGAR_CUOTA' | 'ABONAR_CAPITAL';

/** The installment a "pay installment" movement targets, if any. */
function resolveLoanTargetInstallment(
  loan: LoanPaymentOption | null
): LoanPaymentOptionInstallment | null {
  if (!loan) return null;
  return loan.overdueInstallment ?? loan.nextInstallment;
}

/** ACTIVE loans compatible with the chosen type and account currency. */
function resolveLoanOptions(
  loans: LoanPaymentOption[],
  account: AccountBrief | undefined,
  isExpense: boolean
): LoanPaymentOption[] {
  const expectedType = isExpense ? 'LOAN_PAYMENT' : 'LOAN_RECEIPT';
  return loans.filter((loan) => {
    if (loan.expectedTransactionType !== expectedType) return false;
    return !account || loan.currency === account.currency;
  });
}

function isLoanCurrencyMismatch(
  nature: ExpenseNature,
  target: LoanPaymentOption | null,
  account: AccountBrief | undefined
): boolean {
  if (nature !== 'LOAN' || !target || !account) return false;
  return account.currency !== target.currency;
}

/**
 * Upper bound for the loan amount input: the full outstanding balance for an
 * extra capital payment, or the target installment remainder otherwise. No cap
 * for non-loan natures.
 */
function resolveLoanAmountMaxCents(
  nature: ExpenseNature,
  action: LoanAction,
  loan: LoanPaymentOption | null
): number | undefined {
  if (nature !== 'LOAN') return undefined;
  if (action === 'ABONAR_CAPITAL') return loan?.balanceCents;
  return resolveLoanTargetInstallment(loan)?.remainingCents;
}

interface SubmitDisabledInput {
  isSubmitting: boolean;
  hasNoAccounts: boolean;
  nature: ExpenseNature;
  fixedTarget: FixedExpensePaymentSerialized | null;
  loanTarget: LoanPaymentOption | null;
  loanAction: LoanAction;
  loanAmountCents: number;
  currencyMismatch: boolean;
}

function isSubmitDisabled(input: SubmitDisabledInput): boolean {
  if (input.isSubmitting || input.hasNoAccounts) return true;
  if (input.nature === 'FIXED') return !input.fixedTarget || input.currencyMismatch;
  if (input.nature === 'LOAN') {
    if (!input.loanTarget || input.currencyMismatch) return true;
    if (input.loanAction === 'PAGAR_CUOTA') {
      return resolveLoanTargetInstallment(input.loanTarget) === null;
    }
    // Extra capital payment requires a positive amount.
    return input.loanAmountCents <= 0;
  }
  return false;
}

/** Maps fixed-payment action errors to localized messages. */
function mapFixedPayError(
  result: { code?: string; error?: string },
  dictionary: Record<string, unknown>
): string {
  if (result.code === 'FIXED_EXPENSE_ALREADY_PAID') {
    return get(dictionary, 'fixedExpenseAlreadyPaid');
  }
  return getTransactionError(result, dictionary);
}

// ---------------------------------------------------------------------------
// Submission helpers (extracted from onSubmit to reduce cognitive complexity)
// ---------------------------------------------------------------------------

interface SubmitContext {
  data: CreateTransactionFormData;
  account: AccountBrief;
  dictionary: Record<string, unknown>;
  addNotification: Notify;
  closeModal: () => void;
  onSuccess?: () => void;
  setServerError: (message: string) => void;
  setNatureError: (message: string) => void;
  setIsSubmitting: (value: boolean) => void;
}

function notifyTransactionSuccess(ctx: SubmitContext, successKey: string): void {
  ctx.setServerError('');
  ctx.addNotification('success', get(ctx.dictionary, successKey));
  ctx.closeModal();
  ctx.onSuccess?.();
}

function notifyTransactionError(
  ctx: SubmitContext,
  result: { code?: string; error?: string }
): void {
  const message = translateValidationMessage(
    getTransactionError(result, ctx.dictionary),
    ctx.dictionary
  );
  ctx.setServerError(message);
  ctx.addNotification('error', message);
}

async function submitEditedTransaction(ctx: SubmitContext, editing: TransactionRow): Promise<void> {
  // The amount sign is derived from the ORIGINAL row so it stays correct for
  // every transaction type (INCOME positive, EXPENSE/TRANSFER_OUT negative).
  const signedAmountCents = editing.amountCents < 0 ? -ctx.data.amountCents : ctx.data.amountCents;
  const result = await updateTransaction({
    transactionId: editing.id,
    description: ctx.data.description || undefined,
    amountCents: signedAmountCents,
    date: ctx.data.date ? new Date(ctx.data.date) : undefined,
    categoryId: ctx.data.categoryId || null,
  });
  ctx.setIsSubmitting(false);
  if (result.success) {
    notifyTransactionSuccess(ctx, 'updateSuccess');
    return;
  }
  notifyTransactionError(ctx, result);
}

async function submitFixedPayment(
  ctx: SubmitContext,
  fixedTarget: FixedExpensePaymentSerialized | null,
  idempotencyKeyRef: IdempotencyKeyRef
): Promise<void> {
  if (!fixedTarget) {
    ctx.setIsSubmitting(false);
    ctx.setNatureError(get(ctx.dictionary, 'noPendingPayments'));
    return;
  }
  if (ctx.account.currency !== fixedTarget.currency) {
    ctx.setIsSubmitting(false);
    ctx.setNatureError(get(ctx.dictionary, 'currencyMismatch'));
    return;
  }
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = crypto.randomUUID();
  }
  const result = await payFixedExpense({
    paymentId: fixedTarget.id,
    accountId: ctx.data.accountId,
    date: ctx.data.date ? new Date(ctx.data.date) : undefined,
    idempotencyKey: idempotencyKeyRef.current,
  });
  ctx.setIsSubmitting(false);
  if (result.success) {
    idempotencyKeyRef.current = null;
    notifyTransactionSuccess(ctx, 'createSuccess');
    return;
  }
  const message = translateValidationMessage(
    mapFixedPayError(result, ctx.dictionary),
    ctx.dictionary
  );
  ctx.setServerError(message);
  ctx.addNotification('error', message);
}

async function submitLoanMovement(
  ctx: SubmitContext,
  loanTarget: LoanPaymentOption | null,
  loanAction: LoanAction,
  idempotencyKeyRef: IdempotencyKeyRef
): Promise<void> {
  if (!loanTarget) {
    ctx.setIsSubmitting(false);
    ctx.setNatureError(get(ctx.dictionary, 'noPendingLoanInstallments'));
    return;
  }
  if (ctx.account.currency !== loanTarget.currency) {
    ctx.setIsSubmitting(false);
    ctx.setNatureError(get(ctx.dictionary, 'currencyMismatch'));
    return;
  }
  if (!idempotencyKeyRef.current) {
    idempotencyKeyRef.current = crypto.randomUUID();
  }

  const date = ctx.data.date ? new Date(ctx.data.date) : undefined;

  if (loanAction === 'ABONAR_CAPITAL') {
    const result = await addLoanAdjustment({
      loanId: loanTarget.loanId,
      type: 'EXTRA_PAYMENT',
      effectiveDate: date ?? new Date(),
      amountCents: ctx.data.amountCents,
      accountId: ctx.data.accountId,
      notes: ctx.data.description || undefined,
      idempotencyKey: idempotencyKeyRef.current,
    });
    ctx.setIsSubmitting(false);
    if (result.success) {
      idempotencyKeyRef.current = null;
      notifyTransactionSuccess(ctx, 'loanCapitalPaymentSuccess');
      return;
    }
    notifyTransactionError(ctx, result);
    return;
  }

  const target = resolveLoanTargetInstallment(loanTarget);
  if (!target) {
    ctx.setIsSubmitting(false);
    ctx.setNatureError(get(ctx.dictionary, 'noPendingLoanInstallments'));
    return;
  }

  const result = await registerLoanPayment({
    installmentId: target.installmentId,
    accountId: ctx.data.accountId,
    amountCents: ctx.data.amountCents,
    date,
    notes: ctx.data.description || undefined,
    idempotencyKey: idempotencyKeyRef.current,
  });
  ctx.setIsSubmitting(false);
  if (result.success) {
    idempotencyKeyRef.current = null;
    const successKey =
      loanTarget.expectedTransactionType === 'LOAN_RECEIPT'
        ? 'loanReceiptSuccess'
        : 'createSuccess';
    notifyTransactionSuccess(ctx, successKey);
    return;
  }
  notifyTransactionError(ctx, result);
}

function validateVariableExpense(
  account: AccountBrief,
  definition: VariableExpenseDefinition | null,
  dictionary: Record<string, unknown>
): string | null {
  if (!definition) return get(dictionary, 'selectVariableExpense');
  if (account.currency !== definition.currency) return get(dictionary, 'currencyMismatch');
  return null;
}

async function submitNewTransaction(
  ctx: SubmitContext,
  nature: ExpenseNature,
  definition: VariableExpenseDefinition | null
): Promise<void> {
  const isVariable = nature === 'VARIABLE';
  const signedAmountCents =
    ctx.data.type === 'EXPENSE' ? -ctx.data.amountCents : ctx.data.amountCents;
  const result = await createTransaction({
    idempotencyKey: crypto.randomUUID(),
    accountId: ctx.data.accountId,
    type: ctx.data.type,
    amountCents: signedAmountCents,
    currency: ctx.account.currency,
    description: ctx.data.description || undefined,
    date: ctx.data.date ? new Date(ctx.data.date) : undefined,
    categoryId: isVariable ? undefined : ctx.data.categoryId || undefined,
    variableExpenseId: isVariable ? definition?.id : undefined,
  });
  ctx.setIsSubmitting(false);
  if (result.success) {
    notifyTransactionSuccess(ctx, 'createSuccess');
    return;
  }
  notifyTransactionError(ctx, result);
}

// ---------------------------------------------------------------------------
// Field subcomponents (split out to keep the orchestrator's complexity low)
// ---------------------------------------------------------------------------

interface NoAccountsWarningProps {
  visible: boolean;
  dictionary: Record<string, unknown>;
  lang: Locale;
}

function NoAccountsWarning({ visible, dictionary, lang }: Readonly<NoAccountsWarningProps>) {
  if (!visible) return null;
  return (
    <div className="px-6 py-4 border-b border-amber-500/20 bg-amber-500/10">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 leading-relaxed">
            {get(dictionary, 'noAccountsDesc')}
          </p>
          <Link
            href={`/${lang}/accounts`}
            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {get(dictionary, 'createAccountCta')}
          </Link>
        </div>
      </div>
    </div>
  );
}

interface TypeFieldProps {
  dictionary: Record<string, unknown>;
  isEditing: boolean;
  selectedType: 'INCOME' | 'EXPENSE';
  register: UseFormRegister<CreateTransactionFormData>;
  error?: string;
}

function TypeField({
  dictionary,
  isEditing,
  selectedType,
  register,
  error,
}: Readonly<TypeFieldProps>) {
  const typeOptions = [
    {
      value: 'EXPENSE' as const,
      label: get(dictionary, 'expenseLabel'),
      icon: ArrowDownRight,
      activeColor: 'rose',
    },
    {
      value: 'INCOME' as const,
      label: get(dictionary, 'incomeLabel'),
      icon: ArrowUpRight,
      activeColor: 'emerald',
    },
  ];

  return (
    <fieldset>
      <legend className={labelCls}>{get(dictionary, 'type')}</legend>
      <div className="grid grid-cols-2 gap-3">
        {typeOptions.map((opt) => {
          const isActive = selectedType === opt.value;
          const Icon = opt.icon;
          const isIncome = opt.activeColor === 'emerald';
          let borderClasses: string;
          let iconClasses: string;
          if (isActive) {
            borderClasses = isIncome
              ? 'border-emerald-500/60 bg-emerald-500/15'
              : 'border-rose-500/60 bg-rose-500/15';
            iconClasses = isIncome
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-rose-500/20 text-rose-400';
          } else {
            borderClasses = 'border-white/10 bg-white/4 hover:border-white/20';
            iconClasses = 'bg-white/5 text-slate-400';
          }
          return (
            <label
              key={opt.value}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${borderClasses} ${
                isEditing ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
              }`}
            >
              <input
                type="radio"
                value={opt.value}
                {...register('type')}
                disabled={isEditing}
                className="sr-only"
                aria-label={opt.label}
              />
              <div className={`p-1.5 rounded-lg ${iconClasses}`}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </div>
              <span
                className={`text-sm font-semibold ${isActive ? 'text-white' : 'text-slate-300'}`}
              >
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p className={errorCls} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface NatureFieldProps {
  dictionary: Record<string, unknown>;
  visible: boolean;
  options: ReadonlyArray<{ value: ExpenseNature; labelKey: string }>;
  selectedNature: ExpenseNature;
  error: string;
  onSelect: (value: ExpenseNature) => void;
}

function NatureField({
  dictionary,
  visible,
  options,
  selectedNature,
  error,
  onSelect,
}: Readonly<NatureFieldProps>) {
  if (!visible) return null;

  const gridClass =
    options.length > 2 ? 'grid grid-cols-2 sm:grid-cols-4 gap-2' : 'grid grid-cols-2 gap-2';

  return (
    <fieldset>
      <legend className={labelCls}>{get(dictionary, 'expenseNature')}</legend>
      <div className={gridClass}>
        {options.map((option) => {
          const isActive = selectedNature === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(option.value)}
              className={`px-3 py-2 rounded-xl border text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                isActive
                  ? 'border-blue-500/60 bg-blue-500/15 text-white'
                  : 'border-white/10 bg-white/4 text-slate-300 hover:border-white/20'
              }`}
            >
              {get(dictionary, option.labelKey)}
            </button>
          );
        })}
      </div>
      {error && (
        <p className={errorCls} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface AccountFieldProps {
  dictionary: Record<string, unknown>;
  isEditing: boolean;
  selectedAccountId: string;
  modalSession: number;
  onAccountChange: (accountId: string) => void;
  hasError: boolean;
  ariaDescribedBy?: string;
  error?: string;
  bankAccountOptions: AccountBrief[];
  creditCardOptions: AccountBrief[];
  pocketOptions: AccountBrief[];
  parentNameById: Record<string, string>;
  locale: string;
}

function AccountField({
  dictionary,
  isEditing,
  selectedAccountId,
  modalSession,
  onAccountChange,
  hasError,
  ariaDescribedBy,
  error,
  bankAccountOptions,
  creditCardOptions,
  pocketOptions,
  parentNameById,
  locale,
}: Readonly<AccountFieldProps>) {
  return (
    <div>
      <label htmlFor="tx-account" className={labelCls}>
        {get(dictionary, 'account')}
      </label>
      <AccountSelect
        key={`account-${modalSession}`}
        id="tx-account"
        value={selectedAccountId}
        onChange={onAccountChange}
        placeholder={get(dictionary, 'selectAccount')}
        accountsGroupLabel={get(dictionary, 'accountsGroup')}
        creditCardsGroupLabel={get(dictionary, 'creditCardsGroup')}
        pocketsGroupLabel={get(dictionary, 'pocketsGroup')}
        parentNameById={parentNameById}
        accounts={bankAccountOptions}
        creditCards={creditCardOptions}
        pockets={pocketOptions}
        showBalance
        disabled={isEditing}
        locale={locale}
        hasError={hasError}
        ariaDescribedBy={ariaDescribedBy}
      />
      {error && (
        <p id="tx-account-error" className={errorCls} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface VariableExpenseFieldProps {
  dictionary: Record<string, unknown>;
  visible: boolean;
  definitionsLoaded: boolean;
  options: VariableExpenseDefinition[];
  selectedId: string;
  onChange: (id: string) => void;
  hasError: boolean;
  ariaDescribedBy?: string;
}

function VariableExpenseField({
  dictionary,
  visible,
  definitionsLoaded,
  options,
  selectedId,
  onChange,
  hasError,
  ariaDescribedBy,
}: Readonly<VariableExpenseFieldProps>) {
  if (!visible) return null;
  return (
    <div>
      <label htmlFor="tx-variable-expense" className={labelCls}>
        {get(dictionary, 'selectVariableExpense')}
      </label>
      <select
        id="tx-variable-expense"
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={hasError}
        aria-describedby={ariaDescribedBy}
        className={`${inputCls} appearance-none`}
      >
        <option value="" disabled className="bg-slate-800">
          {definitionsLoaded
            ? get(dictionary, 'selectVariableExpense')
            : get(dictionary, 'loading')}
        </option>
        {options.map((definition) => (
          <option key={definition.id} value={definition.id} className="bg-slate-800">
            {definition.name}
          </option>
        ))}
      </select>
      {definitionsLoaded && options.length === 0 && (
        <p className="mt-1.5 text-xs text-amber-400">{get(dictionary, 'noVariableExpenses')}</p>
      )}
    </div>
  );
}

interface FixedExpenseFieldProps {
  dictionary: Record<string, unknown>;
  visible: boolean;
  definitionsLoaded: boolean;
  fixedExpenses: FixedExpenseWithPayments[];
  selectedFixedExpenseId: string;
  selectedFixedExpense: FixedExpenseWithPayments | null;
  fixedTarget: FixedExpensePaymentSerialized | null;
  nextPayment: FixedExpensePaymentSerialized | null;
  fixedCurrencyMismatch: boolean;
  advanceNextMonth: boolean;
  onTemplateChange: (id: string) => void;
  onAdvanceChange: (checked: boolean) => void;
  hasError: boolean;
  ariaDescribedBy?: string;
  locale: string;
}

function FixedExpenseField({
  dictionary,
  visible,
  definitionsLoaded,
  fixedExpenses,
  selectedFixedExpenseId,
  selectedFixedExpense,
  fixedTarget,
  nextPayment,
  fixedCurrencyMismatch,
  advanceNextMonth,
  onTemplateChange,
  onAdvanceChange,
  hasError,
  ariaDescribedBy,
  locale,
}: Readonly<FixedExpenseFieldProps>) {
  if (!visible) return null;

  // Resolved with independent statements (Sonar S3358: no nested ternaries).
  let paymentPanel: React.ReactNode;
  if (fixedTarget) {
    paymentPanel = (
      <>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">{get(dictionary, 'dueDate')}</span>
          <span className="font-semibold text-white">
            {formatLongDate(fixedTarget.dueDate, locale)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">{get(dictionary, 'autoAmount')}</span>
          <output className="font-semibold text-emerald-400 tabular-nums">
            {formatMoney(fixedTarget.expectedAmountCents, fixedTarget.currency, locale)}
          </output>
        </div>
        <p className="text-[10px] text-slate-500">{get(dictionary, 'fixedAmountAuto')}</p>
        {fixedCurrencyMismatch && (
          <p role="alert" className="text-xs text-amber-400">
            {get(dictionary, 'currencyMismatch')}
          </p>
        )}
      </>
    );
  } else if (nextPayment) {
    paymentPanel = (
      <label className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={advanceNextMonth}
          onChange={(event) => onAdvanceChange(event.target.checked)}
          className="rounded border-white/20 bg-white/5"
        />
        {get(dictionary, 'advanceNextMonth')}
      </label>
    );
  } else {
    paymentPanel = (
      <output className="block text-xs text-amber-400">
        {get(dictionary, 'noPendingPayments')}
      </output>
    );
  }

  return (
    <div>
      <label htmlFor="tx-fixed-expense" className={labelCls}>
        {get(dictionary, 'selectFixedExpense')}
      </label>
      <select
        id="tx-fixed-expense"
        value={selectedFixedExpenseId}
        onChange={(event) => onTemplateChange(event.target.value)}
        aria-invalid={hasError}
        aria-describedby={ariaDescribedBy}
        className={`${inputCls} appearance-none`}
      >
        <option value="" disabled className="bg-slate-800">
          {definitionsLoaded ? get(dictionary, 'selectFixedExpense') : get(dictionary, 'loading')}
        </option>
        {fixedExpenses.map((expense) => (
          <option key={expense.id} value={expense.id} className="bg-slate-800">
            {expense.name} — {formatMoney(expense.amountCents, expense.currency, locale)}
          </option>
        ))}
      </select>

      {definitionsLoaded && fixedExpenses.length === 0 && (
        <p className="mt-1.5 text-xs text-amber-400">{get(dictionary, 'noFixedExpenses')}</p>
      )}

      {selectedFixedExpense && (
        <div className="mt-3 bg-white/5 rounded-xl p-3 space-y-2">{paymentPanel}</div>
      )}
    </div>
  );
}

/** Replaces `{{token}}` placeholders with the provided values. */
function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}

interface LoanFieldProps {
  dictionary: Record<string, unknown>;
  visible: boolean;
  loansLoaded: boolean;
  options: LoanPaymentOption[];
  selectedId: string;
  onChange: (id: string) => void;
  selectedLoan: LoanPaymentOption | null;
  action: LoanAction;
  onActionChange: (action: LoanAction) => void;
  hasError: boolean;
  ariaDescribedBy?: string;
  locale: string;
}

function LoanField({
  dictionary,
  visible,
  loansLoaded,
  options,
  selectedId,
  onChange,
  selectedLoan,
  action,
  onActionChange,
  hasError,
  ariaDescribedBy,
  locale,
}: Readonly<LoanFieldProps>) {
  if (!visible) return null;

  const target = resolveLoanTargetInstallment(selectedLoan);
  const overdue = selectedLoan?.overdueInstallment ?? null;
  const next = selectedLoan?.nextInstallment ?? null;

  function installmentLine(key: string, installment: LoanPaymentOptionInstallment): string {
    return interpolateTemplate(get(dictionary, key), {
      number: String(installment.installmentNumber),
      date: formatLongDate(installment.dueDate, locale),
      amount: formatMoney(installment.remainingCents, selectedLoan?.currency ?? 'COP', locale),
    });
  }

  return (
    <div>
      <label htmlFor="tx-loan" className={labelCls}>
        {get(dictionary, 'selectLoan')}
      </label>
      <select
        id="tx-loan"
        value={selectedId}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={hasError}
        aria-describedby={ariaDescribedBy}
        className={`${inputCls} appearance-none`}
      >
        <option value="" disabled className="bg-slate-800">
          {loansLoaded ? get(dictionary, 'selectLoan') : get(dictionary, 'loading')}
        </option>
        {options.map((loan) => (
          <option key={loan.loanId} value={loan.loanId} className="bg-slate-800">
            {`${loan.loanName} — ${formatMoney(loan.balanceCents, loan.currency, locale)}`}
          </option>
        ))}
      </select>

      {loansLoaded && options.length === 0 && (
        <p className="mt-1.5 text-xs text-amber-400">
          {get(dictionary, 'noPendingLoanInstallments')}
        </p>
      )}

      {selectedLoan && (
        <div className="mt-3 space-y-3">
          {/* Current installment state */}
          {overdue && (
            <output className="block rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
              {installmentLine('loanStatusOverdue', overdue)}
            </output>
          )}

          {!overdue && selectedLoan.currentMonthPaid && (
            <div className="space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                {get(dictionary, 'loanStatusCurrentMonthPaid')}
              </span>
              {next && (
                <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 tabular-nums">
                  {installmentLine('loanStatusNext', next)}
                </div>
              )}
            </div>
          )}

          {!overdue && !selectedLoan.currentMonthPaid && next && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300">
              {installmentLine('loanStatusPending', next)}
            </div>
          )}

          {!overdue && !selectedLoan.currentMonthPaid && !next && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-400">
              {get(dictionary, 'loanStatusNoPending')}
            </div>
          )}

          {/* Action selector */}
          <fieldset>
            <legend className={labelCls}>{get(dictionary, 'selectLoanAction')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 ${
                  action === 'PAGAR_CUOTA'
                    ? 'border-blue-500/60 bg-blue-500/15 text-white'
                    : 'border-white/10 bg-white/4 text-slate-300'
                } ${target ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
              >
                <input
                  type="radio"
                  name="tx-loan-action"
                  value="PAGAR_CUOTA"
                  checked={action === 'PAGAR_CUOTA'}
                  disabled={!target}
                  onChange={() => onActionChange('PAGAR_CUOTA')}
                  className="sr-only"
                />
                {get(dictionary, 'loanActionPayInstallment')}
              </label>
              <label
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-all cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-400 ${
                  action === 'ABONAR_CAPITAL'
                    ? 'border-blue-500/60 bg-blue-500/15 text-white'
                    : 'border-white/10 bg-white/4 text-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="tx-loan-action"
                  value="ABONAR_CAPITAL"
                  checked={action === 'ABONAR_CAPITAL'}
                  onChange={() => onActionChange('ABONAR_CAPITAL')}
                  className="sr-only"
                />
                {get(dictionary, 'loanActionExtraCapital')}
              </label>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}

interface AmountAndCategoryFieldsProps {
  dictionary: Record<string, unknown>;
  effectiveNature: ExpenseNature;
  selectedAccount: AccountBrief | undefined;
  isEditing: boolean;
  isExpense: boolean;
  amountCents: number;
  onAmountChange: (value: number) => void;
  amountError?: string;
  amountAriaDescribedBy?: string;
  categories: CategoryBrief[];
  selectedCategoryId: string;
  register: UseFormRegister<CreateTransactionFormData>;
  onOpenCategoryManager?: () => void;
  categoryError?: string;
  locale: string;
  /** Overrides the account-derived max (e.g. a loan installment's remainder). */
  amountMaxCents?: number;
  /** Overrides the amount label key (e.g. "Extra principal payment amount"). */
  amountLabelKey?: string;
}

function AmountAndCategoryFields({
  dictionary,
  effectiveNature,
  selectedAccount,
  isEditing,
  isExpense,
  amountCents,
  onAmountChange,
  amountError,
  amountAriaDescribedBy,
  categories,
  selectedCategoryId,
  register,
  onOpenCategoryManager,
  categoryError,
  locale,
  amountMaxCents,
  amountLabelKey,
}: Readonly<AmountAndCategoryFieldsProps>) {
  if (effectiveNature === 'FIXED') return null;

  return (
    <>
      {/* Amount */}
      <div>
        <label htmlFor="tx-amount" className={labelCls}>
          {get(dictionary, amountLabelKey ?? 'amountLabel')}
          {selectedAccount && (
            <span className="text-slate-500 font-normal lowercase ml-1">
              ({selectedAccount.currency})
            </span>
          )}
        </label>
        {!isEditing && isExpense && selectedAccount && (
          <p className="mt-1 mb-3 text-xs text-slate-400">
            {get(dictionary, 'availableToSpend')}:{' '}
            <span className="font-semibold text-emerald-400 tabular-nums">
              {formatMoney(getAvailableToSpend(selectedAccount), selectedAccount.currency, locale)}
            </span>
          </p>
        )}
        <FormattedNumericInput
          id="tx-amount"
          value={amountCents}
          onChange={onAmountChange}
          maxValue={amountMaxCents ?? getAmountMaxValue(selectedAccount, isEditing, isExpense)}
          aria-invalid={!!amountError}
          aria-describedby={amountAriaDescribedBy}
          className={`${inputCls} font-mono tabular-nums text-lg`}
        />
        {amountError && (
          <p id="tx-amount-error" className={errorCls} role="alert">
            {amountError}
          </p>
        )}
      </div>

      {/* Category selector (Normal only — Variable inherits the definition's category) */}
      {effectiveNature === 'NORMAL' && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className={labelCls}>{get(dictionary, 'category')}</span>
            {onOpenCategoryManager && (
              <button
                type="button"
                onClick={onOpenCategoryManager}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg px-1.5 py-0.5"
              >
                {get(dictionary, 'manageCategories')}
              </button>
            )}
          </div>
          <fieldset className="mt-2">
            <legend className="sr-only">{get(dictionary, 'category')}</legend>
            <div className="flex flex-wrap gap-2">
              {/* No category option */}
              <label
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                  selectedCategoryId === ''
                    ? 'border-blue-500/60 bg-blue-500/15'
                    : 'border-white/10 bg-white/4 hover:border-white/20'
                }`}
              >
                <input
                  type="radio"
                  value=""
                  {...register('categoryId')}
                  className="sr-only"
                  aria-label={get(dictionary, 'selectCategory')}
                />
                <span
                  className={`text-xs font-semibold ${
                    selectedCategoryId === '' ? 'text-white' : 'text-slate-300'
                  }`}
                >
                  {get(dictionary, 'selectCategory')}
                </span>
              </label>

              {/* Active categories (system + own) */}
              {categories.map((cat) => {
                const isActive = selectedCategoryId === cat.id;
                return (
                  <label
                    key={cat.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                      isActive
                        ? 'border-blue-500/60 bg-blue-500/15'
                        : 'border-white/10 bg-white/4 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      value={cat.id}
                      {...register('categoryId')}
                      className="sr-only"
                      aria-label={cat.name}
                    />
                    <span
                      className="w-3 h-3 rounded-full inline-block shrink-0"
                      style={{ backgroundColor: cat.color ?? '#64748B' }}
                      aria-hidden="true"
                    />
                    <span
                      className={`text-xs font-semibold ${
                        isActive ? 'text-white' : 'text-slate-300'
                      }`}
                    >
                      {cat.name}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {categoryError && (
            <p className={errorCls} role="alert">
              {categoryError}
            </p>
          )}
        </div>
      )}
    </>
  );
}

interface DescriptionFieldProps {
  dictionary: Record<string, unknown>;
  register: UseFormRegister<CreateTransactionFormData>;
  error?: string;
  ariaDescribedBy?: string;
}

function DescriptionField({
  dictionary,
  register,
  error,
  ariaDescribedBy,
}: Readonly<DescriptionFieldProps>) {
  return (
    <div>
      <label htmlFor="tx-description" className={labelCls}>
        {get(dictionary, 'descriptionLabel')}
      </label>
      <textarea
        id="tx-description"
        {...register('description')}
        rows={3}
        placeholder={get(dictionary, 'descriptionPlaceholder')}
        aria-invalid={!!error}
        aria-describedby={ariaDescribedBy}
        className={`${inputCls} resize-none`}
      />
      {error && (
        <p id="tx-description-error" className={errorCls} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface DateFieldProps {
  dictionary: Record<string, unknown>;
  register: UseFormRegister<CreateTransactionFormData>;
  error?: string;
}

function DateField({ dictionary, register, error }: Readonly<DateFieldProps>) {
  return (
    <div>
      <label htmlFor="tx-date" className={labelCls}>
        {get(dictionary, 'transactionDate')}
      </label>
      <input
        id="tx-date"
        type="datetime-local"
        {...register('date')}
        aria-invalid={!!error}
        className={inputCls}
      />
      {error && (
        <p className={errorCls} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface ServerErrorAlertProps {
  message: string;
}

function ServerErrorAlert({ message }: Readonly<ServerErrorAlertProps>) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3"
    >
      <p className="text-sm text-red-200 font-medium">{message}</p>
    </div>
  );
}

interface FormActionsProps {
  dictionary: Record<string, unknown>;
  isSubmitting: boolean;
  disabled: boolean;
  onClose: () => void;
}

function FormActions({ dictionary, isSubmitting, disabled, onClose }: Readonly<FormActionsProps>) {
  const submitLabel = isSubmitting ? get(dictionary, 'creating') : get(dictionary, 'create');
  return (
    <div className="flex gap-3 pt-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
      >
        {get(dictionary, 'cancel')}
      </button>
      <button
        type="submit"
        disabled={disabled}
        aria-busy={isSubmitting}
        className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
      >
        {submitLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateTransactionModal({
  accounts,
  categories,
  dictionary,
  lang,
  locale = 'es-CO',
  onOpenCategoryManager,
  onSuccess,
}: Readonly<CreateTransactionModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'create-transaction';
  const hasNoAccounts = accounts.length === 0;

  // When the table's edit (pencil) button opens the modal it passes the row via
  // `openModal('create-transaction', { editing: transaction })`. `closeModal`
  // clears `modalData`, so reopening for a fresh create resets to create mode.
  const editingTransaction = (modalData?.editing as TransactionRow | null | undefined) ?? null;
  const isEditing = editingTransaction !== null;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountCents, setAmountCents] = useState(0);
  // Incremented every time the modal opens so inner components that need to
  // reset their local state (e.g. AccountSelect) are remounted per session.
  const [modalSession, setModalSession] = useState(0);
  // Holds a server-side error (e.g. INSUFFICIENT_FUNDS) rendered inline inside
  // the modal. NOTE: the global ToastViewport is a fixed z-[100] element that
  // sits BELOW the <dialog> top layer, so toasts are invisible while the modal
  // is open. This inline alert is the primary (visible) error surface; the
  // toast is kept as reinforcement in case the modal closes first.
  const [serverError, setServerError] = useState('');

  // Expense nature (create + EXPENSE only): Normal / Fixed / Variable.
  const [nature, setNature] = useState<ExpenseNature>('NORMAL');
  const [natureError, setNatureError] = useState('');
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpenseWithPayments[]>([]);
  const [variableExpenses, setVariableExpenses] = useState<VariableExpenseDefinition[]>([]);
  const [definitionsLoaded, setDefinitionsLoaded] = useState(false);
  const [selectedFixedExpenseId, setSelectedFixedExpenseId] = useState('');
  const [selectedVariableExpenseId, setSelectedVariableExpenseId] = useState('');
  const [advanceNextMonth, setAdvanceNextMonth] = useState(false);
  // Idempotency key for the fixed-payment path: stable across retries and only
  // cleared after a confirmed success (mirrors PayFixedExpenseModal).
  const fixedIdempotencyKeyRef = useRef<string | null>(null);

  // Loan nature state: ACTIVE loans available for payment/receipt, the selected
  // loan, the chosen movement (pay installment / extra capital) and its own
  // retry-stable idempotency key (same policy as the fixed-payment path).
  const [loansForPayment, setLoansForPayment] = useState<LoanPaymentOption[]>([]);
  const [loansLoaded, setLoansLoaded] = useState(false);
  const [selectedLoanId, setSelectedLoanId] = useState('');
  const [loanAction, setLoanAction] = useState<LoanAction>('PAGAR_CUOTA');
  const loanIdempotencyKeyRef = useRef<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<CreateTransactionFormData>({
    resolver: zodResolver(CreateTransactionFormSchema),
    defaultValues: {
      type: 'EXPENSE',
      accountId: '',
      categoryId: '',
      amountCents: 0,
      description: '',
      date: toLocalDateTimeInput(new Date()),
    },
  });

  const selectedType = useWatch({ control, name: 'type' });
  const selectedAccountId = useWatch({ control, name: 'accountId' });
  const selectedCategoryId = useWatch({ control, name: 'categoryId' });
  const selectedDateValue = useWatch({ control, name: 'date' });

  // Find selected account currency for display
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  // Split accounts into three groups for the custom selector:
  // bank accounts, credit cards (expense-only), and pockets. Credit cards are
  // valid expense accounts (a consumption) but NOT valid income accounts, so
  // the group is empty when the type is INCOME.
  const bankAccountOptions = accounts.filter((a) => !isPocket(a) && a.type !== 'CREDIT_CARD');
  const creditCardOptions = accounts.filter(
    (a) => a.type === 'CREDIT_CARD' && selectedType === 'EXPENSE'
  );
  const pocketOptions = accounts.filter(isPocket);
  // accountId -> account name map so each pocket can show its parent account.
  const parentNameById = useMemo(
    () => Object.fromEntries(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );
  const isExpense = selectedType === 'EXPENSE';

  // INCOME ignores the nature selector entirely: an income is never "fixed" or
  // "variable". Deriving (instead of resetting state) avoids a set-state effect.
  const effectiveNature = resolveEffectiveNature(isExpense, nature);

  const selectedFixedExpense =
    fixedExpenses.find((expense) => expense.id === selectedFixedExpenseId) ?? null;
  const selectedVariableDefinition =
    variableExpenses.find((definition) => definition.id === selectedVariableExpenseId) ?? null;
  const selectedLoan = loansForPayment.find((loan) => loan.loanId === selectedLoanId) ?? null;

  const fixedTargets = useMemo(
    () =>
      resolveFixedPaymentTargets(
        selectedFixedExpense,
        selectedDateValue ? new Date(selectedDateValue) : new Date()
      ),
    [selectedFixedExpense, selectedDateValue]
  );

  // "Advance next month" only makes sense when this month's occurrence is gone.
  const fixedTarget = resolveFixedTarget(fixedTargets, advanceNextMonth);
  const fixedCurrencyMismatch = isFixedCurrencyMismatch(
    effectiveNature,
    fixedTarget,
    selectedAccount
  );
  const variableExpenseOptions = resolveVariableExpenseOptions(variableExpenses, selectedAccount);
  const loanOptions = resolveLoanOptions(loansForPayment, selectedAccount, isExpense);
  const loanCurrencyMismatch = isLoanCurrencyMismatch(
    effectiveNature,
    selectedLoan,
    selectedAccount
  );
  const submitDisabled = isSubmitDisabled({
    isSubmitting,
    hasNoAccounts,
    nature: effectiveNature,
    fixedTarget,
    loanTarget: selectedLoan,
    loanAction,
    loanAmountCents: amountCents,
    currencyMismatch: fixedCurrencyMismatch || loanCurrencyMismatch,
  });

  // -----------------------------------------------------------------------
  // Modal open/close with animation
  // -----------------------------------------------------------------------

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen) {
      dialog.showModal();
    } else if (dialog.open) {
      setIsVisible(false);
      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 240);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (editingTransaction) {
      // Prefill from the row being edited. Type and account are NOT editable;
      // the type radio is mapped to INCOME/EXPENSE for the schema while the
      // original sign is preserved on submit (see onSubmit).
      reset({
        type: editingTransaction.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
        accountId: editingTransaction.accountId,
        categoryId: editingTransaction.categoryId ?? '',
        amountCents: Math.abs(editingTransaction.amountCents),
        description: editingTransaction.description ?? '',
        date: toLocalDateTimeInput(new Date(editingTransaction.date)),
      });
    } else {
      reset({
        type: 'EXPENSE',
        accountId: accounts.length === 1 ? accounts[0].id : '',
        categoryId: '',
        amountCents: 0,
        description: '',
        date: toLocalDateTimeInput(new Date()),
      });
    }

    const id = requestAnimationFrame(() => {
      setServerError(''); // Clear any stale server error when (re)opening the modal
      setAmountCents(editingTransaction ? Math.abs(editingTransaction.amountCents) : 0);
      setModalSession((s) => s + 1); // Remount AccountSelect on every open
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, accounts, reset, editingTransaction]);

  // Clamp the typed amount when switching to an account whose available amount
  // is lower than the currently typed amount. Only applies in create mode +
  // EXPENSE; for updates the server validates the true limit (allows up to
  // balance + original amount), so editing is intentionally left untouched.
  // For credit cards the cap is the available credit (limit - debt), not the
  // (negative) stored balance.
  useEffect(() => {
    if (isEditing) return;
    if (selectedType !== 'EXPENSE') return;
    if (effectiveNature === 'FIXED') return;
    if (effectiveNature === 'LOAN') return;
    const acc = accounts.find((a) => a.id === selectedAccountId);
    if (!acc) return;
    const cap =
      acc.type === 'CREDIT_CARD' ? (acc.availableCreditCents ?? MAX_SAFE) : acc.balanceCents;
    if (amountCents > cap) {
      queueMicrotask(() => {
        setAmountCents(0);
        setValue('amountCents', 0);
      });
    }
  }, [
    selectedAccountId,
    selectedType,
    amountCents,
    accounts,
    isEditing,
    setValue,
    effectiveNature,
  ]);

  // Clear the account when the type switches to INCOME and a credit card was
  // selected (cards are expense-only; leaving a card selected would break the
  // submit and confuse the "disponible" display).
  useEffect(() => {
    if (selectedType !== 'INCOME') return;
    const acc = accounts.find((a) => a.id === selectedAccountId);
    if (acc?.type === 'CREDIT_CARD') {
      setValue('accountId', '');
    }
  }, [selectedType, selectedAccountId, accounts, setValue]);

  // Lazy-load the fixed + variable definitions AND the ACTIVE loans for
  // payment when the modal opens in CREATE mode (same deferral pattern as the
  // accounts fetch). The nature resets to Normal on every fresh open.
  useEffect(() => {
    if (!isOpen || isEditing) return;
    const timer = setTimeout(() => {
      setNature('NORMAL');
      setNatureError('');
      setSelectedFixedExpenseId('');
      setSelectedVariableExpenseId('');
      setSelectedLoanId('');
      setLoanAction('PAGAR_CUOTA');
      setAdvanceNextMonth(false);
      setDefinitionsLoaded(false);
      setLoansLoaded(false);
      fixedIdempotencyKeyRef.current = null;
      loanIdempotencyKeyRef.current = null;
      void (async () => {
        try {
          const [fixedModule, variableModule, loanModule] = await Promise.all([
            import('@/actions/fixed-expense.actions'),
            import('@/actions/variable-expense.actions'),
            import('@/actions/loan.actions'),
          ]);
          const [fixedRes, variableRes, loanRes] = await Promise.all([
            fixedModule.getFixedExpenses({}),
            variableModule.getVariableExpenses({}),
            loanModule.getLoansForPayment({}),
          ]);
          setFixedExpenses(fixedRes.success && fixedRes.data ? fixedRes.data : []);
          setVariableExpenses(variableRes.success && variableRes.data ? variableRes.data : []);
          setLoansForPayment(loanRes.success && loanRes.data ? loanRes.data : []);
        } catch {
          setFixedExpenses([]);
          setVariableExpenses([]);
          setLoansForPayment([]);
        } finally {
          setDefinitionsLoaded(true);
          setLoansLoaded(true);
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, isEditing]);

  // Fixed nature: the amount is driven by the resolved payment (read-only).
  useEffect(() => {
    if (effectiveNature !== 'FIXED' || !fixedTarget) return;
    setValue('amountCents', fixedTarget.expectedAmountCents, { shouldValidate: false });
  }, [effectiveNature, fixedTarget, setValue]);

  // A variable definition must share the selected account currency; clear a
  // stale selection when the account changes (currencies are never mixed).
  useEffect(() => {
    if (effectiveNature !== 'VARIABLE' || !selectedAccount) return;
    const definition = variableExpenses.find((item) => item.id === selectedVariableExpenseId);
    if (definition && definition.currency !== selectedAccount.currency) {
      queueMicrotask(() => setSelectedVariableExpenseId(''));
    }
  }, [effectiveNature, selectedAccount, variableExpenses, selectedVariableExpenseId]);

  // Loan nature: when a loan is selected, choose the default movement
  // (pay installment when there is a target, extra capital otherwise) and seed
  // the amount (installment remainder or empty for capital). Both stay editable.
  useEffect(() => {
    if (effectiveNature !== 'LOAN' || !selectedLoan) return;
    const target = resolveLoanTargetInstallment(selectedLoan);
    const nextAction: LoanAction = target ? 'PAGAR_CUOTA' : 'ABONAR_CAPITAL';
    const nextAmount = target ? target.remainingCents : 0;
    setValue('amountCents', nextAmount, { shouldValidate: false });
    queueMicrotask(() => {
      setLoanAction(nextAction);
      setAmountCents(nextAmount);
    });
  }, [effectiveNature, selectedLoan, setValue]);

  // A selected loan must share the selected account currency.
  useEffect(() => {
    if (effectiveNature !== 'LOAN' || !selectedAccount) return;
    const current = loansForPayment.find((loan) => loan.loanId === selectedLoanId);
    if (current && current.currency !== selectedAccount.currency) {
      queueMicrotask(() => setSelectedLoanId(''));
    }
  }, [effectiveNature, selectedAccount, loansForPayment, selectedLoanId]);

  const handleClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  }, []);

  const handleDialogClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  const handleNatureSelect = useCallback(
    (value: ExpenseNature) => {
      setNature(value);
      setNatureError('');
      // Variable inherits the definition's category: drop any previously
      // selected category so it is never sent.
      if (value === 'VARIABLE') {
        setValue('categoryId', '');
      }
    },
    [setValue]
  );

  const handleAccountChange = useCallback(
    (accountId: string) => {
      setValue('accountId', accountId);
    },
    [setValue]
  );

  const handleVariableChange = useCallback((id: string) => {
    setSelectedVariableExpenseId(id);
    setNatureError('');
  }, []);

  const handleLoanChange = useCallback((id: string) => {
    setSelectedLoanId(id);
    setNatureError('');
  }, []);

  const handleLoanActionChange = useCallback(
    (nextAction: LoanAction) => {
      setLoanAction(nextAction);
      setNatureError('');
      if (!selectedLoan) return;
      if (nextAction === 'PAGAR_CUOTA') {
        const target = resolveLoanTargetInstallment(selectedLoan);
        const nextAmount = target ? target.remainingCents : 0;
        setValue('amountCents', nextAmount, { shouldValidate: false });
        setAmountCents(nextAmount);
      } else {
        setValue('amountCents', 0, { shouldValidate: false });
        setAmountCents(0);
      }
    },
    [selectedLoan, setValue]
  );

  const handleTemplateChange = useCallback((id: string) => {
    setSelectedFixedExpenseId(id);
    setAdvanceNextMonth(false);
    setNatureError('');
  }, []);

  const handleAdvanceChange = useCallback((checked: boolean) => {
    setAdvanceNextMonth(checked);
    setNatureError('');
  }, []);

  const handleAmountChange = useCallback(
    (value: number) => {
      setAmountCents(value);
      setValue('amountCents', value);
    },
    [setValue]
  );

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const onSubmit = useCallback(
    async (data: CreateTransactionFormData) => {
      // Clear any previous server error on each submit attempt
      setServerError('');
      setNatureError('');

      if (!selectedAccount) {
        addNotification('error', get(dictionary, 'selectAccount'));
        return;
      }

      setIsSubmitting(true);

      const ctx: SubmitContext = {
        data,
        account: selectedAccount,
        dictionary,
        addNotification,
        closeModal,
        onSuccess,
        setServerError,
        setNatureError,
        setIsSubmitting,
      };

      // Edit mode: type and account are immutable.
      if (editingTransaction) {
        await submitEditedTransaction(ctx, editingTransaction);
        return;
      }

      // Fixed nature: pay the resolved materialized payment.
      if (effectiveNature === 'FIXED') {
        await submitFixedPayment(ctx, fixedTarget, fixedIdempotencyKeyRef);
        return;
      }

      // Loan nature: register the chosen movement (installment payment/receipt
      // or an extra capital payment) against the selected loan.
      if (effectiveNature === 'LOAN') {
        await submitLoanMovement(ctx, selectedLoan, loanAction, loanIdempotencyKeyRef);
        return;
      }

      // Variable nature requires a monitored definition in the account currency.
      if (effectiveNature === 'VARIABLE') {
        const validationError = validateVariableExpense(
          selectedAccount,
          selectedVariableDefinition,
          dictionary
        );
        if (validationError) {
          setIsSubmitting(false);
          setNatureError(validationError);
          return;
        }
      }

      await submitNewTransaction(ctx, effectiveNature, selectedVariableDefinition);
    },
    [
      selectedAccount,
      dictionary,
      addNotification,
      closeModal,
      editingTransaction,
      onSuccess,
      effectiveNature,
      fixedTarget,
      selectedVariableDefinition,
      selectedLoan,
      loanAction,
    ]
  );

  // handleSubmit is invoked inside the DOM submit event (not during render) so
  // the ref-backed fixed-payment idempotency key is only touched in the event
  // phase (react-hooks/refs).
  const handleFormSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSubmit(onSubmit)(event);
    },
    [handleSubmit, onSubmit]
  );

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="create-transaction-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label={get(dictionary, 'cancel')}
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm cursor-default"
        style={{
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 220ms ease',
        }}
      />

      {/* Modal panel */}
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={{
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
          opacity: isVisible ? 1 : 0,
          transition: isVisible
            ? 'transform 280ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)'
            : 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2 id="create-transaction-title" className="text-base font-semibold text-white">
            {get(dictionary, isEditing ? 'editTitle' : 'createTitle')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={get(dictionary, 'cancel')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <NoAccountsWarning visible={hasNoAccounts} dictionary={dictionary} lang={lang} />

        {/* Form */}
        <form onSubmit={handleFormSubmit} className="px-6 py-5 space-y-5" noValidate>
          <TypeField
            dictionary={dictionary}
            isEditing={isEditing}
            selectedType={selectedType}
            register={register}
            error={translateValidationMessage(errors.type?.message, dictionary)}
          />

          <NatureField
            dictionary={dictionary}
            visible={!isEditing}
            options={getNatureOptions(isExpense)}
            selectedNature={effectiveNature}
            error={natureError}
            onSelect={handleNatureSelect}
          />

          <AccountField
            dictionary={dictionary}
            isEditing={isEditing}
            selectedAccountId={selectedAccountId ?? ''}
            modalSession={modalSession}
            onAccountChange={handleAccountChange}
            hasError={!!errors.accountId}
            ariaDescribedBy={errors.accountId ? 'tx-account-error' : undefined}
            error={translateValidationMessage(errors.accountId?.message, dictionary)}
            bankAccountOptions={bankAccountOptions}
            creditCardOptions={creditCardOptions}
            pocketOptions={pocketOptions}
            parentNameById={parentNameById}
            locale={locale}
          />

          <VariableExpenseField
            dictionary={dictionary}
            visible={!isEditing && effectiveNature === 'VARIABLE'}
            definitionsLoaded={definitionsLoaded}
            options={variableExpenseOptions}
            selectedId={selectedVariableExpenseId}
            onChange={handleVariableChange}
            hasError={!!natureError}
            ariaDescribedBy={natureError ? 'tx-nature-error' : undefined}
          />

          <FixedExpenseField
            dictionary={dictionary}
            visible={!isEditing && effectiveNature === 'FIXED'}
            definitionsLoaded={definitionsLoaded}
            fixedExpenses={fixedExpenses}
            selectedFixedExpenseId={selectedFixedExpenseId}
            selectedFixedExpense={selectedFixedExpense}
            fixedTarget={fixedTarget}
            nextPayment={fixedTargets.nextPayment}
            fixedCurrencyMismatch={fixedCurrencyMismatch}
            advanceNextMonth={advanceNextMonth}
            onTemplateChange={handleTemplateChange}
            onAdvanceChange={handleAdvanceChange}
            hasError={!!natureError}
            ariaDescribedBy={natureError ? 'tx-nature-error' : undefined}
            locale={locale}
          />

          <LoanField
            dictionary={dictionary}
            visible={!isEditing && effectiveNature === 'LOAN'}
            loansLoaded={loansLoaded}
            options={loanOptions}
            selectedId={selectedLoanId}
            onChange={handleLoanChange}
            selectedLoan={selectedLoan}
            action={loanAction}
            onActionChange={handleLoanActionChange}
            hasError={!!natureError}
            ariaDescribedBy={natureError ? 'tx-nature-error' : undefined}
            locale={locale}
          />

          <AmountAndCategoryFields
            dictionary={dictionary}
            effectiveNature={effectiveNature}
            selectedAccount={selectedAccount}
            isEditing={isEditing}
            isExpense={isExpense}
            amountCents={amountCents}
            onAmountChange={handleAmountChange}
            amountError={translateValidationMessage(errors.amountCents?.message, dictionary)}
            amountAriaDescribedBy={errors.amountCents ? 'tx-amount-error' : undefined}
            categories={categories}
            selectedCategoryId={selectedCategoryId ?? ''}
            register={register}
            onOpenCategoryManager={onOpenCategoryManager}
            categoryError={translateValidationMessage(errors.categoryId?.message, dictionary)}
            locale={locale}
            amountMaxCents={resolveLoanAmountMaxCents(effectiveNature, loanAction, selectedLoan)}
            amountLabelKey={
              effectiveNature === 'LOAN' && loanAction === 'ABONAR_CAPITAL'
                ? 'capitalPaymentAmount'
                : undefined
            }
          />

          <DescriptionField
            dictionary={dictionary}
            register={register}
            error={translateValidationMessage(errors.description?.message, dictionary)}
            ariaDescribedBy={errors.description ? 'tx-description-error' : undefined}
          />

          <DateField
            dictionary={dictionary}
            register={register}
            error={translateValidationMessage(errors.date?.message, dictionary)}
          />

          <ServerErrorAlert message={serverError} />

          <FormActions
            dictionary={dictionary}
            isSubmitting={isSubmitting}
            disabled={submitDisabled}
            onClose={handleClose}
          />
        </form>
      </div>
    </dialog>
  );
}
