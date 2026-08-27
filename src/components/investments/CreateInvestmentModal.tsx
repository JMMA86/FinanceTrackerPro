'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Check } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { createInvestmentAccount } from '@/actions/investment.actions';
import { CreateInvestmentAccountSchema } from '@/actions/investment.schema';
import type { CreateInvestmentAccountInput } from '@/actions/investment.schema';
import { get } from '@/lib/i18n';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';

const CURRENCIES = ['USD', 'EUR'] as const;

interface CreateInvestmentModalProps {
  dictionary: Record<string, unknown>;
}

export function CreateInvestmentModal({ dictionary }: Readonly<CreateInvestmentModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'create-investment';

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateInvestmentAccountInput>({
    resolver: zodResolver(CreateInvestmentAccountSchema) as Resolver<CreateInvestmentAccountInput>,
    defaultValues: {
      idempotencyKey: crypto.randomUUID(),
      currency: 'USD',
      initialBalanceCents: 0,
    },
  });

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
      idempotencyKey: crypto.randomUUID(),
      currency: 'USD',
      initialBalanceCents: 0,
    });
    const id = requestAnimationFrame(() => {
      setBalanceCents(0);
      setSubmitError(null);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  };

  const handleDialogClose = () => {
    closeModal();
  };

  async function onSubmit(data: CreateInvestmentAccountInput) {
    setSubmitError(null);
    const result = await createInvestmentAccount(data);
    if (result.success) {
      addNotification('success', 'Investment account created');
      closeModal();
    } else {
      const msg =
        result.code === 'SESSION_INVALID'
          ? get(dictionary, 'errors.sessionInvalid')
          : get(dictionary, 'errors.createFailed');
      setSubmitError(msg);
    }
  }

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="create-investment-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={handleClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{ opacity: isVisible ? 1 : 0, transition: 'opacity 220ms ease' }}
      />

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2 id="create-investment-title" className="text-base font-semibold text-white">
            {get(dictionary, 'addAccount')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4" noValidate>
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

          {/* Account name */}
          <div>
            <label htmlFor="inv-name" className={labelCls}>
              {get(dictionary, 'accountName')}
            </label>
            <input
              id="inv-name"
              type="text"
              autoComplete="off"
              placeholder={get(dictionary, 'accountNamePlaceholder')}
              aria-invalid={!!errors.name}
              className={inputCls}
              {...register('name')}
            />
            {errors.name && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Currency */}
          <div>
            <label htmlFor="inv-currency" className={labelCls}>
              {get(dictionary, 'currency')}
            </label>
            <select id="inv-currency" className={selectCls} {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-slate-800">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Initial balance */}
          <div>
            <label htmlFor="inv-balance" className={labelCls}>
              {get(dictionary, 'initialBalance')}
            </label>
            <FormattedNumericInput
              id="inv-balance"
              value={balanceCents}
              onChange={(v) => {
                setBalanceCents(v);
                setValue('initialBalanceCents', v);
              }}
              aria-invalid={!!errors.initialBalanceCents}
              className={`${inputCls} font-mono tabular-nums`}
            />
            {errors.initialBalanceCents && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {errors.initialBalanceCents.message}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
            >
              {get(dictionary, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>{get(dictionary, 'loading')}</>
              ) : (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'createAccount')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
