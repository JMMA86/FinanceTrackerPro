'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X, Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { createSavingsGoal } from '@/actions/savings.actions';
import { CreateSavingsGoalSchema } from '@/actions/savings.schema';
import type { CreateSavingsGoalInput } from '@/actions/savings.schema';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';

const CURRENCIES = ['COP', 'USD', 'EUR'] as const;
const GOAL_TYPES = ['ANNUAL', 'SHORT_TERM', 'EMERGENCY', 'CUSTOM'] as const;
const COLOR_PRESETS = [
  'from-violet-500 to-purple-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-amber-500 to-orange-500',
  'from-red-500 to-rose-500',
  'from-pink-500 to-fuchsia-500',
];

interface CreateSavingsGoalModalProps {
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

export function CreateSavingsGoalModal({
  dictionary,
  locale: _locale,
  isOpen,
  onClose,
}: Readonly<CreateSavingsGoalModalProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [targetCents, setTargetCents] = useState(0);
  const [monthlyCents, setMonthlyCents] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const [customColor, setCustomColor] = useState('#6366f1');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateSavingsGoalInput>({
    resolver: zodResolver(CreateSavingsGoalSchema) as Resolver<CreateSavingsGoalInput>,
    defaultValues: {
      type: 'CUSTOM',
      currency: 'COP',
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
      name: '',
      description: undefined,
      type: 'CUSTOM',
      targetAmountCents: 0,
      currency: 'COP',
      deadline: undefined,
      monthlyContributionCents: undefined,
      color: undefined,
    });
    const id = requestAnimationFrame(() => {
      setTargetCents(0);
      setMonthlyCents(0);
      setSelectedColor(undefined);
      setCustomColor('#6366f1');
      setSubmitError(null);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset]);

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

  async function onSubmit(data: CreateSavingsGoalInput) {
    setSubmitError(null);
    try {
      const result = await createSavingsGoal(data);
      if (result.success) {
        onClose();
      } else {
        const msg =
          result.code === 'SESSION_INVALID'
            ? get(dictionary, 'errors.sessionInvalid')
            : (result.error ?? get(dictionary, 'errors.createFailed'));
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.createFailed'));
    }
  }

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
  const errorCls = 'mt-1 text-xs text-red-400';

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="create-savings-goal-title"
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
          <h2 id="create-savings-goal-title" className="text-base font-semibold text-white">
            {get(dictionary, 'createGoal')}
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
          {/* Error alert */}
          {submitError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {submitError}
            </div>
          )}

          {/* Goal name */}
          <div>
            <label htmlFor="savings-name" className={labelCls}>
              {get(dictionary, 'goalName')}
            </label>
            <input
              id="savings-name"
              type="text"
              autoComplete="off"
              placeholder={get(dictionary, 'goalNamePlaceholder')}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'savings-name-error' : undefined}
              className={inputCls}
              {...register('name')}
            />
            {errors.name && (
              <p id="savings-name-error" role="alert" className={errorCls}>
                {errors.name.message}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label htmlFor="savings-desc" className={labelCls}>
              {get(dictionary, 'goalDescription')}
            </label>
            <textarea
              id="savings-desc"
              rows={2}
              placeholder={get(dictionary, 'goalDescriptionPlaceholder')}
              className={`${inputCls} resize-none`}
              {...register('description')}
            />
          </div>

          {/* Goal type */}
          <div>
            <label htmlFor="savings-type" className={labelCls}>
              {get(dictionary, 'goalType')}
            </label>
            <select id="savings-type" className={selectCls} {...register('type')}>
              {GOAL_TYPES.map((t) => (
                <option key={t} value={t} className="bg-slate-800">
                  {get(dictionary, `types.${t}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Target amount */}
          <div>
            <label htmlFor="savings-target" className={labelCls}>
              {get(dictionary, 'targetAmount')}
            </label>
            <FormattedNumericInput
              id="savings-target"
              value={targetCents}
              onChange={(v) => {
                setTargetCents(v);
                setValue('targetAmountCents', v);
              }}
              aria-invalid={!!errors.targetAmountCents}
              aria-describedby={errors.targetAmountCents ? 'savings-target-error' : undefined}
              className={`${inputCls} font-mono tabular-nums`}
            />
            {errors.targetAmountCents && (
              <p id="savings-target-error" role="alert" className={errorCls}>
                {errors.targetAmountCents.message}
              </p>
            )}
          </div>

          {/* Currency */}
          <div>
            <label htmlFor="savings-currency" className={labelCls}>
              {get(dictionary, 'currency')}
            </label>
            <select id="savings-currency" className={selectCls} {...register('currency')}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c} className="bg-slate-800">
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Monthly contribution */}
          <div>
            <label htmlFor="savings-monthly" className={labelCls}>
              {get(dictionary, 'monthlyContribution')}
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">
              {get(dictionary, 'monthlyContributionHint')}
            </p>
            <FormattedNumericInput
              id="savings-monthly"
              value={monthlyCents}
              onChange={(v) => {
                setMonthlyCents(v);
                setValue('monthlyContributionCents', v || undefined);
              }}
              className={`${inputCls} font-mono tabular-nums`}
            />
          </div>

          {/* Deadline */}
          <div>
            <label htmlFor="savings-deadline" className={labelCls}>
              {get(dictionary, 'deadline')}
            </label>
            <p className="text-[10px] text-slate-500 mb-1.5">{get(dictionary, 'deadlineHint')}</p>
            <input
              id="savings-deadline"
              type="date"
              className={inputCls}
              {...register('deadline', {
                setValueAs: (v: string) => (v ? new Date(v) : undefined),
              })}
            />
          </div>

          {/* Color */}
          <div>
            <label className={labelCls}>{get(dictionary, 'color')}</label>
            <div className="flex items-center gap-2 flex-wrap">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  aria-label={preset}
                  onClick={() => {
                    setSelectedColor(preset);
                    setValue('color', preset);
                  }}
                  className={`w-7 h-7 rounded-full bg-gradient-to-r ${preset} transition-all ${
                    selectedColor === preset
                      ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-violet-400 scale-110'
                      : 'opacity-70 hover:opacity-100 hover:scale-105'
                  }`}
                />
              ))}
              <label
                aria-label={get(dictionary, 'customColor')}
                className={`relative w-7 h-7 rounded-full overflow-hidden cursor-pointer transition-all ${
                  selectedColor && !COLOR_PRESETS.includes(selectedColor)
                    ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-violet-400 scale-110'
                    : 'opacity-70 hover:opacity-100 hover:scale-105'
                }`}
                style={{ background: customColor }}
              >
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => {
                    setCustomColor(e.target.value);
                    setSelectedColor(e.target.value);
                    setValue('color', e.target.value);
                  }}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                />
              </label>
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
                  {get(dictionary, 'createGoal')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
