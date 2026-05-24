'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { updateSavingsGoal } from '@/actions/savings.actions';
import { UpdateSavingsGoalSchema } from '@/actions/savings.schema';
import type { UpdateSavingsGoalInput } from '@/actions/savings.schema';
import type { SavingsGoal } from '@prisma/client';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';

const GOAL_STATUS = ['ACTIVE', 'COMPLETED', 'CANCELLED'] as const;
const COLOR_OPTIONS = [
  { value: 'from-violet-500 to-purple-500', label: 'Púrpura' },
  { value: 'from-blue-500 to-cyan-500', label: 'Azul' },
  { value: 'from-emerald-500 to-teal-500', label: 'Verde' },
  { value: 'from-amber-500 to-orange-500', label: 'Ámbar' },
  { value: 'from-red-500 to-rose-500', label: 'Rojo' },
  { value: 'from-pink-500 to-fuchsia-500', label: 'Rosa' },
];

interface EditSavingsGoalModalProps {
  goal: SavingsGoal;
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EditSavingsGoalModal({
  goal,
  dictionary,
  locale: _locale,
  isOpen,
  onClose,
}: Readonly<EditSavingsGoalModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [targetCents, setTargetCents] = useState(0);
  const [monthlyCents, setMonthlyCents] = useState<number | undefined>(undefined);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateSavingsGoalInput>({
    resolver: zodResolver(UpdateSavingsGoalSchema) as Resolver<UpdateSavingsGoalInput>,
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
      goalId: goal.id,
      name: goal.name,
      description: goal.description ?? undefined,
      targetAmountCents: goal.targetAmountCents,
      deadline: goal.deadline ?? undefined,
      monthlyContributionCents: goal.monthlyContributionCents ?? undefined,
      color: goal.color ?? undefined,
      status: goal.status as 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | undefined,
    });
    const id = requestAnimationFrame(() => {
      setTargetCents(goal.targetAmountCents);
      setMonthlyCents(goal.monthlyContributionCents ?? undefined);
      setSubmitError(null);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset, goal]);

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

  async function onSubmit(data: UpdateSavingsGoalInput) {
    setSubmitError(null);
    try {
      const result = await updateSavingsGoal(data);
      if (result.success) {
        onClose();
      } else {
        const msg = result.code === 'SESSION_INVALID'
          ? get(dictionary, 'errors.sessionInvalid')
          : (result.error ?? get(dictionary, 'errors.updateFailed'));
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.updateFailed'));
    }
  }

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const selectCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
  const errorCls = 'mt-1 text-xs text-red-400';

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="edit-savings-goal-title"
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
          <h2 id="edit-savings-goal-title" className="text-base font-semibold text-white">
            {get(dictionary, 'updateGoal')}
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

          {/* Error alert */}
          {submitError && (
            <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
              {submitError}
            </div>
          )}

          {/* Goal name */}
          <div>
            <label htmlFor="edit-savings-name" className={labelCls}>{get(dictionary, 'goalName')}</label>
            <input
              id="edit-savings-name"
              type="text"
              autoComplete="off"
              placeholder={get(dictionary, 'goalNamePlaceholder')}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'edit-savings-name-error' : undefined}
              className={inputCls}
              {...register('name')}
            />
            {errors.name && (
              <p id="edit-savings-name-error" role="alert" className={errorCls}>{errors.name.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="edit-savings-desc" className={labelCls}>{get(dictionary, 'goalDescription')}</label>
            <textarea
              id="edit-savings-desc"
              rows={2}
              placeholder={get(dictionary, 'goalDescriptionPlaceholder')}
              className={`${inputCls} resize-none`}
              {...register('description')}
            />
          </div>

          {/* Target amount */}
          <div>
            <label htmlFor="edit-savings-target" className={labelCls}>{get(dictionary, 'targetAmount')}</label>
            <FormattedNumericInput
              id="edit-savings-target"
              value={targetCents}
              onChange={(v) => { setTargetCents(v); setValue('targetAmountCents', v); }}
              aria-invalid={!!errors.targetAmountCents}
              className={`${inputCls} font-mono tabular-nums`}
            />
            {errors.targetAmountCents && (
              <p role="alert" className={errorCls}>{errors.targetAmountCents.message}</p>
            )}
          </div>

          {/* Monthly contribution */}
          <div>
            <label htmlFor="edit-savings-monthly" className={labelCls}>
              {get(dictionary, 'monthlyContribution')}
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">{get(dictionary, 'monthlyContributionHint')}</p>
            <FormattedNumericInput
              id="edit-savings-monthly"
              value={monthlyCents ?? 0}
              onChange={(v) => { setMonthlyCents(v); setValue('monthlyContributionCents', v || undefined); }}
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="edit-savings-deadline" className={labelCls}>{get(dictionary, 'deadline')}</label>
            <p className="text-[10px] text-slate-500 mb-1.5">{get(dictionary, 'deadlineHint')}</p>
            <input
              id="edit-savings-deadline"
              type="date"
              className={inputCls}
              {...register('deadline', { setValueAs: (v: string) => v ? new Date(v) : undefined })}
            />
          </div>

          {/* Status */}
          <div>
            <label htmlFor="edit-savings-status" className={labelCls}>{get(dictionary, 'status')}</label>
            <select id="edit-savings-status" className={selectCls} {...register('status')}>
              {GOAL_STATUS.map((s) => (
                <option key={s} value={s} className="bg-slate-800">{s}</option>
              ))}
            </select>
          </div>

          {/* Color */}
          <div>
            <label className={labelCls}>{get(dictionary, 'color')}</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <label
                  key={c.value}
                  className="flex items-center gap-2 p-2 rounded-lg border border-white/10 cursor-pointer hover:bg-white/5 transition-colors has-[:checked]:ring-2 has-[:checked]:ring-violet-400"
                >
                  <input
                    type="radio"
                    value={c.value}
                    className="sr-only"
                    {...register('color')}
                  />
                  <div className={`w-5 h-5 rounded-full bg-gradient-to-r ${c.value}`} />
                  <span className="text-xs text-slate-300">{c.label}</span>
                </label>
              ))}
            </div>
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
                  {get(dictionary, 'save')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
