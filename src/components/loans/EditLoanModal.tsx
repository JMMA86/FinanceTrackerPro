'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { translateValidationMessage } from '@/lib/i18n/validation';
import { updateLoan } from '@/actions/loan.actions';
import { UpdateLoanSchema, type UpdateLoanInput } from '@/actions/loan.schema';
import type { LoanWithInstallments } from '@/types/loans';
import { getLoanError } from './getLoanError';
import { LoanDialogShell, type LoanDialogRenderApi } from './LoanDialogShell';

const LOAN_STATUS = ['ACTIVE', 'COMPLETED', 'CANCELLED', 'DEFAULTED'] as const;

interface ColorPreset {
  value: string;
  labelKey: string;
}

const COLOR_PRESETS: ColorPreset[] = [
  { value: 'from-violet-500 to-purple-500', labelKey: 'colorNames.violet' },
  { value: 'from-blue-500 to-cyan-500', labelKey: 'colorNames.blue' },
  { value: 'from-emerald-500 to-teal-500', labelKey: 'colorNames.emerald' },
  { value: 'from-amber-500 to-orange-500', labelKey: 'colorNames.amber' },
  { value: 'from-red-500 to-rose-500', labelKey: 'colorNames.red' },
  { value: 'from-pink-500 to-fuchsia-500', labelKey: 'colorNames.pink' },
];

interface EditLoanModalProps {
  loan: LoanWithInstallments;
  dictionary: Record<string, unknown>;
  isOpen: boolean;
  onClose: () => void;
}

export function EditLoanModal({ loan, dictionary, isOpen, onClose }: Readonly<EditLoanModalProps>) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);
  const [customColor, setCustomColor] = useState('#6366f1');
  const shellRef = useRef<LoanDialogRenderApi | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateLoanInput>({
    resolver: zodResolver(UpdateLoanSchema) as Resolver<UpdateLoanInput>,
  });

  useEffect(() => {
    if (!isOpen) return;
    reset({
      loanId: loan.id,
      name: loan.name,
      notes: loan.notes ?? null,
      color: loan.color ?? null,
      status: loan.status as (typeof LOAN_STATUS)[number],
    });
    const id = requestAnimationFrame(() => {
      const initialColor = loan.color ?? undefined;
      setSelectedColor(initialColor);
      if (initialColor && !COLOR_PRESETS.some((p) => p.value === initialColor)) {
        setCustomColor(initialColor);
      }
      setSubmitError(null);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset, loan]);

  async function onSubmit(data: UpdateLoanInput) {
    setSubmitError(null);
    try {
      const result = await updateLoan(data);
      if (result.success) {
        onClose();
      } else {
        const message =
          result.code === 'VALIDATION_ERROR'
            ? translateValidationMessage(result.error, dictionary) ||
              get(dictionary, 'errors.validationFailed')
            : getLoanError(result, dictionary, 'errors.updateFailed');
        setSubmitError(message);
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : get(dictionary, 'errors.updateFailed')
      );
    }
  }

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
  const errorCls = 'mt-1 text-xs text-red-400';

  return (
    <LoanDialogShell
      isOpen={isOpen}
      onClose={onClose}
      onBeforeClose={() => setSubmitError(null)}
      closeLabel={get(dictionary, 'close')}
      titleId="edit-loan-title"
      title={get(dictionary, 'updateLoan')}
      maxWidthClass="max-w-lg"
      panelClassName="max-h-[90vh] overflow-y-auto"
      closeRef={shellRef}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4" noValidate>
        <input type="hidden" {...register('loanId')} />

        {/* Error alert */}
        {submitError && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        {/* Name */}
        <div>
          <label htmlFor="edit-loan-name" className={labelCls}>
            {get(dictionary, 'name')}
          </label>
          <input
            id="edit-loan-name"
            type="text"
            autoComplete="off"
            placeholder={get(dictionary, 'namePlaceholder')}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'edit-loan-name-error' : undefined}
            className={inputCls}
            {...register('name')}
          />
          {errors.name && (
            <p id="edit-loan-name-error" role="alert" className={errorCls}>
              {translateValidationMessage(errors.name.message, dictionary)}
            </p>
          )}
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="edit-loan-notes" className={labelCls}>
            {get(dictionary, 'notes')}
          </label>
          <textarea
            id="edit-loan-notes"
            rows={2}
            className={`${inputCls} resize-none`}
            {...register('notes', { setValueAs: (v: string) => v || null })}
          />
        </div>

        {/* Status */}
        <div>
          <label htmlFor="edit-loan-status" className={labelCls}>
            {get(dictionary, 'status.label')}
          </label>
          <select id="edit-loan-status" className={selectCls} {...register('status')}>
            {LOAN_STATUS.map((s) => (
              <option key={s} value={s} className="bg-slate-800">
                {get(dictionary, `status.${s}`)}
              </option>
            ))}
          </select>
        </div>

        {/* Color */}
        <div>
          <label className={labelCls}>{get(dictionary, 'color')}</label>
          <div className="flex items-center gap-2 flex-wrap">
            {COLOR_PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                aria-label={get(dictionary, preset.labelKey)}
                onClick={() => {
                  setSelectedColor(preset.value);
                  setValue('color', preset.value);
                }}
                className={`w-7 h-7 rounded-full bg-gradient-to-r ${preset.value} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 focus-visible:ring-violet-400 ${
                  selectedColor === preset.value
                    ? 'ring-2 ring-offset-2 ring-offset-slate-900 ring-violet-400 scale-110'
                    : 'opacity-70 hover:opacity-100 hover:scale-105'
                }`}
              />
            ))}
            <label
              aria-label={get(dictionary, 'customColor')}
              className={`relative w-7 h-7 rounded-full overflow-hidden cursor-pointer transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-slate-900 has-[:focus-visible]:ring-violet-400 ${
                selectedColor && !COLOR_PRESETS.some((p) => p.value === selectedColor)
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
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer focus-visible:outline-none"
              />
            </label>
          </div>
        </div>

        {/* Actions */}
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
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
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
    </LoanDialogShell>
  );
}
