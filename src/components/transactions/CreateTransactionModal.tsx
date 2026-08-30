'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { X, ArrowUpRight, ArrowDownRight, AlertCircle } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { createTransaction } from '@/actions/transaction.actions';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { getTransactionError } from '@/components/transactions/getTransactionError';
import type { AccountBrief, CategoryBrief } from '@/components/transactions/types';

// ---------------------------------------------------------------------------
// Client-side validation schema
// ---------------------------------------------------------------------------

const CreateTransactionFormSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE'], {
    message: 'Select a transaction type',
  }),
  accountId: z.string().min(1, 'Select an account'),
  categoryId: z.string().optional(),
  amountCents: z
    .number()
    .int('Amount must be a whole number')
    .positive('Amount must be greater than 0'),
  description: z.string().max(500, 'Description is too long').optional(),
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
  onOpenCategoryManager?: () => void;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
const selectCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const errorCls = 'mt-1 text-xs text-red-400';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CreateTransactionModal({
  accounts,
  categories,
  dictionary,
  lang,
  onOpenCategoryManager,
}: Readonly<CreateTransactionModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'create-transaction';
  const hasNoAccounts = accounts.length === 0;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountCents, setAmountCents] = useState(0);

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
      date: new Date().toISOString().split('T')[0],
    },
  });

  const selectedType = useWatch({ control, name: 'type' });
  const selectedAccountId = useWatch({ control, name: 'accountId' });
  const selectedCategoryId = useWatch({ control, name: 'categoryId' });

  // Find selected account currency for display
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

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
    reset({
      type: 'EXPENSE',
      accountId: accounts.length === 1 ? accounts[0].id : '',
      categoryId: '',
      amountCents: 0,
      description: '',
      date: new Date().toISOString().split('T')[0],
    });
    const id = requestAnimationFrame(() => {
      setAmountCents(0);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, accounts, reset]);

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

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const onSubmit = useCallback(
    async (data: CreateTransactionFormData) => {
      if (!selectedAccount) {
        addNotification('error', get(dictionary, 'selectAccount'));
        return;
      }

      setIsSubmitting(true);

      // Convert amount: positive for INCOME, negative for EXPENSE
      const signedAmountCents = data.type === 'EXPENSE' ? -data.amountCents : data.amountCents;

      const result = await createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: data.accountId,
        type: data.type,
        amountCents: signedAmountCents,
        currency: selectedAccount.currency,
        description: data.description || undefined,
        date: data.date ? new Date(data.date) : undefined,
        categoryId: data.categoryId || undefined,
      });

      setIsSubmitting(false);

      if (result.success) {
        addNotification('success', get(dictionary, 'createSuccess'));
        closeModal();
      } else {
        addNotification('error', getTransactionError(result, dictionary));
      }
    },
    [selectedAccount, dictionary, addNotification, closeModal]
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

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

  const submitLabel = isSubmitting ? get(dictionary, 'creating') : get(dictionary, 'create');

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
            {get(dictionary, 'createTitle')}
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

        {/* No-accounts warning (defense in depth) */}
        {hasNoAccounts && (
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
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5" noValidate>
          {/* Type selector (INCOME / EXPENSE) */}
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
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${borderClasses}`}
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      {...register('type')}
                      className="sr-only"
                      aria-label={opt.label}
                    />
                    <div className={`p-1.5 rounded-lg ${iconClasses}`}>
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </div>
                    <span
                      className={`text-sm font-semibold ${
                        isActive ? 'text-white' : 'text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </span>
                  </label>
                );
              })}
            </div>
            {errors.type && (
              <p className={errorCls} role="alert">
                {errors.type.message}
              </p>
            )}
          </fieldset>

          {/* Account */}
          <div>
            <label htmlFor="tx-account" className={labelCls}>
              {get(dictionary, 'account')}
            </label>
            <select
              id="tx-account"
              {...register('accountId')}
              required
              aria-invalid={!!errors.accountId}
              aria-describedby={errors.accountId ? 'tx-account-error' : undefined}
              className={selectCls}
            >
              <option value="" className="bg-slate-800">
                {get(dictionary, 'selectAccount')}
              </option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-slate-800">
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
            {errors.accountId && (
              <p id="tx-account-error" className={errorCls} role="alert">
                {errors.accountId.message}
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="tx-amount" className={labelCls}>
              {get(dictionary, 'amountLabel')}
              {selectedAccount && (
                <span className="text-slate-500 font-normal lowercase ml-1">
                  ({selectedAccount.currency})
                </span>
              )}
            </label>
            <FormattedNumericInput
              id="tx-amount"
              value={amountCents}
              onChange={(v) => {
                setAmountCents(v);
                setValue('amountCents', v);
              }}
              aria-invalid={!!errors.amountCents}
              aria-describedby={errors.amountCents ? 'tx-amount-error' : undefined}
              className={`${inputCls} font-mono tabular-nums text-lg`}
            />
            {errors.amountCents && (
              <p id="tx-amount-error" className={errorCls} role="alert">
                {errors.amountCents.message}
              </p>
            )}
          </div>

          {/* Category selector */}
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
            {errors.categoryId && (
              <p className={errorCls} role="alert">
                {errors.categoryId.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="tx-description" className={labelCls}>
              {get(dictionary, 'descriptionLabel')}
            </label>
            <textarea
              id="tx-description"
              {...register('description')}
              rows={3}
              placeholder={get(dictionary, 'descriptionPlaceholder')}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'tx-description-error' : undefined}
              className={`${inputCls} resize-none`}
            />
            {errors.description && (
              <p id="tx-description-error" className={errorCls} role="alert">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label htmlFor="tx-date" className={labelCls}>
              {get(dictionary, 'transactionDate')}
            </label>
            <input
              id="tx-date"
              type="date"
              {...register('date')}
              aria-invalid={!!errors.date}
              className={inputCls}
            />
            {errors.date && (
              <p className={errorCls} role="alert">
                {errors.date.message}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
            >
              {get(dictionary, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || hasNoAccounts}
              aria-busy={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
