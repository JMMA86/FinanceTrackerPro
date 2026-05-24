'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { contributeToGoal, getSavingsGoals } from '@/actions/savings.actions';
import { ContributeToGoalSchema } from '@/actions/savings.schema';
import type { ContributeToGoalInput } from '@/actions/savings.schema';
import type { SavingsGoal, SavingsContribution } from '@prisma/client';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { formatMoney } from '@/lib/money';

interface GoalWithProgress extends SavingsGoal {
  progressPercentage: number;
  projectedCompletion: string | null;
  contributions: SavingsContribution[];
  linkedAccount?: { id: string; name: string; currency: string } | null;
}

interface ContributeModalProps {
  goalId: string;
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

interface BankAccount {
  id: string;
  name: string;
  currency: string;
  balanceCents: number;
}

export function ContributeModal({
  goalId,
  dictionary,
  locale,
  isOpen,
  onClose,
}: Readonly<ContributeModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [goal, setGoal] = useState<GoalWithProgress | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ContributeToGoalInput>({
    resolver: zodResolver(ContributeToGoalSchema),
  });

  const loadGoal = useCallback(async () => {
    try {
      const res = await getSavingsGoals({});
      if (res.success && res.data) {
        const goals = res.data as GoalWithProgress[];
        const found = goals.find((g) => g.id === goalId);
        if (found) setGoal(found);
      }
    } catch {
      // silent
    }
  }, [goalId]);

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
      goalId,
      amountCents: 0,
      currency: goal?.currency ?? 'COP',
      notes: undefined,
      sourceAccountId: undefined,
      idempotencyKey: crypto.randomUUID(),
    });
    const id = requestAnimationFrame(() => {
      setAmountCents(0);
      setSubmitError(null);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset, goalId, goal?.currency]);

  const loadAccounts = useCallback(async () => {
    try {
      const { getBankAccounts } = await import('@/actions/account.actions');
      const res = await getBankAccounts({});
      if (res.success && res.data) {
        setAccounts(res.data as BankAccount[]);
      }
    } catch {
      // silent
    }
  }, []);

  // Fetch goal and accounts data after mount
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      loadGoal();
      loadAccounts();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, loadGoal, loadAccounts]);

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

  async function onSubmit(data: ContributeToGoalInput) {
    setSubmitError(null);
    try {
      const result = await contributeToGoal(data);
      if (result.success) {
        onClose();
      } else {
        const msg = result.code === 'SESSION_INVALID'
          ? get(dictionary, 'errors.sessionInvalid')
          : (result.error ?? get(dictionary, 'errors.contributeFailed'));
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.contributeFailed'));
    }
  }

  const remainingCents = goal ? Math.max(0, goal.targetAmountCents - goal.currentAmountCents) : 0;
  const newProgress = goal && goal.targetAmountCents > 0
    ? Math.min(100, ((goal.currentAmountCents + amountCents) / goal.targetAmountCents) * 100)
    : 0;
  const currentProgress = goal?.progressPercentage ?? 0;

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const selectCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
  const errorCls = 'mt-1 text-xs text-red-400';

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="contribute-modal-title"
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
          <h2 id="contribute-modal-title" className="text-base font-semibold text-white">
            {get(dictionary, 'contribute')}
            {goal && <span className="text-slate-400 ml-1">— {goal.name}</span>}
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
          <input type="hidden" {...register('goalId')} />
          <input type="hidden" {...register('idempotencyKey')} />
          <input type="hidden" {...register('currency')} value={goal?.currency ?? 'COP'} />

          {/* Error alert */}
          {submitError && (
            <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {submitError}
            </div>
          )}

          {/* Current progress info */}
          {goal && (
            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{get(dictionary, 'progress')} actual</span>
                <span className="font-semibold text-white tabular-nums">{currentProgress.toFixed(1)}%</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{get(dictionary, 'remaining')}</span>
                <span className="font-semibold text-amber-400 tabular-nums">
                  {formatMoney(remainingCents, goal.currency, locale)}
                </span>
              </div>
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-500"
                  style={{ width: `${currentProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label htmlFor="contribute-amount" className={labelCls}>
              {get(dictionary, 'contributionAmount')}
            </label>
            <FormattedNumericInput
              id="contribute-amount"
              value={amountCents}
              onChange={(v) => { setAmountCents(v); setValue('amountCents', v); }}
              aria-invalid={!!errors.amountCents}
              aria-describedby={errors.amountCents ? 'contribute-amount-error' : undefined}
              className={`${inputCls} font-mono tabular-nums`}
              maxValue={remainingCents}
            />
            {errors.amountCents && (
              <p id="contribute-amount-error" role="alert" className={errorCls}>{errors.amountCents.message}</p>
            )}
            {amountCents > 0 && goal && (
              <p className="mt-1.5 text-xs text-slate-400">
                {get(dictionary, 'progress')}: {currentProgress.toFixed(1)}% → <span className="text-emerald-400 font-semibold">{newProgress.toFixed(1)}%</span>
              </p>
            )}
          </div>

          {/* Source account */}
          <div>
            <label htmlFor="contribute-account" className={labelCls}>
              {get(dictionary, 'sourceAccount')}
            </label>
            <select id="contribute-account" className={selectCls} {...register('sourceAccountId')}>
              <option value="" className="bg-slate-800">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id} className="bg-slate-800">
                  {a.name} ({formatMoney(a.balanceCents, a.currency, locale)})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="contribute-notes" className={labelCls}>
              {get(dictionary, 'contributionNotes')}
            </label>
            <textarea
              id="contribute-notes"
              rows={2}
              className={`${inputCls} resize-none`}
              {...register('notes')}
            />
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
              disabled={isSubmitting || amountCents <= 0}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>{get(dictionary, 'loading')}</>
              ) : (
                <>
                  <Check className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'confirmContribute')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
