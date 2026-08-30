'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { X } from 'lucide-react';
import { transferBetweenAccounts } from '@/actions/transfer.actions';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';
import { toLocalDateTimeInput } from '@/lib/utils/date-utils';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { getTransactionError } from '@/components/transactions/getTransactionError';
import type { AccountBrief } from '@/components/transactions/types';

// ---------------------------------------------------------------------------
// Client-side validation schema
// ---------------------------------------------------------------------------

export const TransferFormSchema = z
  .object({
    fromAccountId: z.string().min(1, 'Select a source account'),
    toAccountId: z.string().min(1, 'Select a destination account'),
    amountCents: z
      .number()
      .int('Amount must be a whole number')
      .positive('Amount must be greater than 0'),
    description: z.string().max(500, 'Description is too long').optional(),
    date: z.string().optional(),
  })
  .refine((data) => data.fromAccountId !== data.toAccountId, {
    message: 'Source and destination accounts must be different',
    path: ['toAccountId'],
  });

type TransferFormData = z.infer<typeof TransferFormSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TransferModalProps {
  open: boolean;
  accounts: AccountBrief[];
  userId: string;
  dictionary: Record<string, unknown>;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Styles (consistent with CreateTransactionModal)
// ---------------------------------------------------------------------------

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
const selectCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none disabled:opacity-50 disabled:cursor-not-allowed';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const errorCls = 'mt-1 text-xs text-red-400';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TransferModal({
  open,
  accounts,
  userId,
  dictionary,
  onClose,
}: Readonly<TransferModalProps>) {
  const addNotification = useUIStore((s) => s.addNotification);

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [amountCents, setAmountCents] = useState(0);
  // Holds a server-side error (e.g. INSUFFICIENT_FUNDS) rendered inline inside
  // the modal. NOTE: the global ToastViewport is a fixed z-[100] element that
  // sits BELOW the <dialog> top layer, so toasts are invisible while the modal
  // is open. This inline alert is the primary (visible) error surface; the
  // toast is kept as reinforcement in case the modal closes first.
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    formState: { errors },
  } = useForm<TransferFormData>({
    resolver: zodResolver(TransferFormSchema),
    defaultValues: {
      fromAccountId: '',
      toAccountId: '',
      amountCents: 0,
      description: '',
      date: toLocalDateTimeInput(new Date()),
    },
  });

  const selectedFromAccountId = useWatch({ control, name: 'fromAccountId' });
  const selectedToAccountId = useWatch({ control, name: 'toAccountId' });

  // The source account drives the amount label currency.
  const selectedFromAccount = accounts.find((a) => a.id === selectedFromAccountId);
  // The destination must never equal the source (the server enforces this too).
  const destinationAccounts = accounts.filter((a) => a.id !== selectedFromAccountId);
  // Defense in depth: the header hides the button with < 2 accounts, but the
  // submit also stays disabled here. A missing userId keeps it disabled too.
  const canSubmit = userId.length > 0 && accounts.length >= 2;

  // -----------------------------------------------------------------------
  // Modal open/close with animation (same pattern as CreateTransactionModal)
  // -----------------------------------------------------------------------

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else if (dialog.open) {
      setIsVisible(false);
      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 240);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const id = requestAnimationFrame(() => {
      // Fresh form + no stale server error when (re)opening the modal
      setServerError('');
      setAmountCents(0);
      reset({
        fromAccountId: '',
        toAccountId: '',
        amountCents: 0,
        description: '',
        date: toLocalDateTimeInput(new Date()),
      });
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [open, reset]);

  // If the source account changes to the currently selected destination, the
  // destination is cleared so the user re-selects a distinct account.
  useEffect(() => {
    if (selectedFromAccountId && selectedToAccountId === selectedFromAccountId) {
      setValue('toAccountId', '');
    }
  }, [selectedFromAccountId, selectedToAccountId, setValue]);

  const handleClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  }, []);

  const handleDialogClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const onSubmit = useCallback(
    async (data: TransferFormData) => {
      // Clear any previous server error on each submit attempt
      setServerError('');

      if (!selectedFromAccount) {
        addNotification('error', get(dictionary, 'selectTransferFrom'));
        return;
      }

      // The server validates the userId against the session; without it the
      // request would fail with UNAUTHORIZED. Guard here for a clean UX.
      if (!userId) {
        addNotification('error', get(dictionary, 'transferUnauthorized'));
        return;
      }

      setIsSubmitting(true);

      const result = await transferBetweenAccounts({
        idempotencyKey: crypto.randomUUID(),
        fromAccountId: data.fromAccountId,
        toAccountId: data.toAccountId,
        amountCents: data.amountCents,
        currency: selectedFromAccount.currency,
        description: data.description || undefined,
        date: data.date ? new Date(data.date) : undefined,
        userId,
      });

      setIsSubmitting(false);

      if (result.success) {
        setServerError('');
        addNotification('success', get(dictionary, 'transferSuccess'));
        onClose();
      } else {
        // Render the error inline inside the modal: the toast below the
        // <dialog> top layer is invisible while the modal is open. Keep the
        // toast too — it becomes visible if/when the modal closes.
        const message = getTransactionError(result, dictionary);
        setServerError(message);
        addNotification('error', message);
      }
    },
    [selectedFromAccount, dictionary, addNotification, onClose, userId]
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const submitLabel = isSubmitting
    ? get(dictionary, 'transferring')
    : get(dictionary, 'transferButton');

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="transfer-title"
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
          <h2 id="transfer-title" className="text-base font-semibold text-white">
            {get(dictionary, 'transferTitle')}
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

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-5" noValidate>
          {/* Source account */}
          <div>
            <label htmlFor="transfer-from" className={labelCls}>
              {get(dictionary, 'transferFrom')}
            </label>
            <select
              id="transfer-from"
              {...register('fromAccountId')}
              required
              aria-invalid={!!errors.fromAccountId}
              aria-describedby={errors.fromAccountId ? 'transfer-from-error' : undefined}
              className={selectCls}
            >
              <option value="" className="bg-slate-800">
                {get(dictionary, 'selectTransferFrom')}
              </option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-slate-800">
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
            {errors.fromAccountId && (
              <p id="transfer-from-error" className={errorCls} role="alert">
                {errors.fromAccountId.message}
              </p>
            )}
          </div>

          {/* Destination account (excludes the source; disabled until source picked) */}
          <div>
            <label htmlFor="transfer-to" className={labelCls}>
              {get(dictionary, 'transferTo')}
            </label>
            <select
              id="transfer-to"
              {...register('toAccountId')}
              required
              disabled={!selectedFromAccountId}
              aria-invalid={!!errors.toAccountId}
              aria-describedby={errors.toAccountId ? 'transfer-to-error' : undefined}
              className={selectCls}
            >
              <option value="" className="bg-slate-800">
                {get(dictionary, 'selectTransferTo')}
              </option>
              {destinationAccounts.map((acc) => (
                <option key={acc.id} value={acc.id} className="bg-slate-800">
                  {acc.name} ({acc.currency})
                </option>
              ))}
            </select>
            {errors.toAccountId && (
              <p id="transfer-to-error" className={errorCls} role="alert">
                {errors.toAccountId.message}
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label htmlFor="transfer-amount" className={labelCls}>
              {get(dictionary, 'transferAmount')}{' '}
              {selectedFromAccount && (
                <span className="text-slate-500 font-normal lowercase ml-1">
                  ({selectedFromAccount.currency})
                </span>
              )}
            </label>
            <FormattedNumericInput
              id="transfer-amount"
              value={amountCents}
              onChange={(v) => {
                setAmountCents(v);
                setValue('amountCents', v);
              }}
              aria-invalid={!!errors.amountCents}
              aria-describedby={errors.amountCents ? 'transfer-amount-error' : undefined}
              className={`${inputCls} font-mono tabular-nums text-lg`}
            />
            {errors.amountCents && (
              <p id="transfer-amount-error" className={errorCls} role="alert">
                {errors.amountCents.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="transfer-description" className={labelCls}>
              {get(dictionary, 'transferDescription')}
            </label>
            <input
              id="transfer-description"
              type="text"
              {...register('description')}
              maxLength={500}
              placeholder={get(dictionary, 'transferDescriptionPlaceholder')}
              aria-invalid={!!errors.description}
              aria-describedby={errors.description ? 'transfer-description-error' : undefined}
              className={inputCls}
            />
            {errors.description && (
              <p id="transfer-description-error" className={errorCls} role="alert">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label htmlFor="transfer-date" className={labelCls}>
              {get(dictionary, 'transactionDate')}
            </label>
            <input
              id="transfer-date"
              type="datetime-local"
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

          {/* Server error (inline — the toast is hidden below the <dialog> top layer) */}
          {serverError && (
            <div
              role="alert"
              className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3"
            >
              <p className="text-sm text-red-200 font-medium">{serverError}</p>
            </div>
          )}

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
              disabled={isSubmitting || !canSubmit}
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
