'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { updateFixedExpense } from '@/actions/fixed-expense.actions';
import {
  UpdateFixedExpenseSchema,
  type UpdateFixedExpenseInput,
} from '@/actions/fixed-expense.schema';
import type { FixedExpenseWithPayments } from '@/types/fixed-expense';
import { FixedExpenseDialog } from './FixedExpenseDialog';
import { FixedExpenseFormFields } from './FixedExpenseFormFields';
import {
  DEFAULT_FIXED_EXPENSE_COLOR,
  DEFAULT_FIXED_EXPENSE_ICON,
  parseDateInput,
} from './constants';

interface EditFixedExpenseModalProps {
  expense: FixedExpenseWithPayments;
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Edit a fixed expense template. The end date can be cleared (sent as null to
 * the server); changing frequency/amount/day reschedules the materialized
 * payments server-side. The shared FixedExpenseFormFields component renders
 * every input so create/edit stay in sync.
 */
export function EditFixedExpenseModal({
  expense,
  dictionary,
  locale,
  isOpen,
  onClose,
}: Readonly<EditFixedExpenseModalProps>) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(expense.amountCents);
  const [selectedColor, setSelectedColor] = useState(expense.color ?? DEFAULT_FIXED_EXPENSE_COLOR);
  const [customColor, setCustomColor] = useState(expense.color ?? DEFAULT_FIXED_EXPENSE_COLOR);
  const [selectedIcon, setSelectedIcon] = useState(expense.icon ?? DEFAULT_FIXED_EXPENSE_ICON);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateFixedExpenseInput>({
    resolver: zodResolver(UpdateFixedExpenseSchema) as Resolver<UpdateFixedExpenseInput>,
  });

  const startDate = useWatch({ control, name: 'startDate' });
  const endDate = useWatch({ control, name: 'endDate' });
  const dayOfPayment = useWatch({ control, name: 'dayOfPayment' });

  useEffect(() => {
    if (!isOpen) return;
    const initialColor = expense.color ?? DEFAULT_FIXED_EXPENSE_COLOR;
    const initialIcon = expense.icon ?? DEFAULT_FIXED_EXPENSE_ICON;
    reset({
      fixedExpenseId: expense.id,
      name: expense.name,
      description: expense.description ?? undefined,
      amountCents: expense.amountCents,
      currency: expense.currency,
      frequency: expense.frequency,
      dayOfPayment: expense.dayOfPayment ?? undefined,
      startDate: new Date(expense.startDate),
      endDate: expense.endDate ? new Date(expense.endDate) : null,
      color: initialColor,
      icon: initialIcon,
    });
    const id = requestAnimationFrame(() => {
      setAmountCents(expense.amountCents);
      setSelectedColor(initialColor);
      setCustomColor(initialColor);
      setSelectedIcon(initialIcon);
      setSubmitError(null);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset, expense]);

  async function onSubmit(data: UpdateFixedExpenseInput) {
    setSubmitError(null);
    try {
      const result = await updateFixedExpense(data);
      if (result.success) {
        onClose();
      } else {
        const msg =
          result.code === 'UNAUTHORIZED'
            ? get(dictionary, 'errors.sessionInvalid')
            : (result.error ?? get(dictionary, 'errors.updateFailed'));
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.updateFailed'));
    }
  }

  const nameField = register('name');
  const descriptionField = register('description', { setValueAs: (v: string) => v || undefined });
  const currencyField = register('currency');
  const frequencyField = register('frequency');

  return (
    <FixedExpenseDialog
      open={isOpen}
      titleId="edit-fixed-expense-title"
      title={get(dictionary, 'editFixedExpense')}
      dictionary={dictionary}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input type="hidden" {...register('fixedExpenseId')} />

        {/* Error alert */}
        {submitError && (
          <div
            role="alert"
            className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
          >
            {submitError}
          </div>
        )}

        <FixedExpenseFormFields
          dictionary={dictionary}
          locale={locale}
          idPrefix="edit-fixed-expense"
          nameField={nameField}
          descriptionField={descriptionField}
          currencyField={currencyField}
          frequencyField={frequencyField}
          amountCents={amountCents}
          onAmountChange={(value) => {
            setAmountCents(value);
            setValue('amountCents', value, { shouldValidate: true });
          }}
          dayOfPayment={dayOfPayment}
          onDayOfPaymentChange={(value) =>
            setValue('dayOfPayment', value, { shouldValidate: true })
          }
          startDate={startDate}
          onStartDateChange={(raw) =>
            setValue('startDate', parseDateInput(raw), { shouldValidate: true })
          }
          endDate={endDate}
          onEndDateChange={(raw) => setValue('endDate', parseDateInput(raw) ?? null)}
          selectedColor={selectedColor}
          customColor={customColor}
          onColorChange={(value) => {
            setSelectedColor(value);
            setValue('color', value);
          }}
          onCustomColorChange={(value) => {
            setCustomColor(value);
            setSelectedColor(value);
            setValue('color', value);
          }}
          selectedIcon={selectedIcon}
          onIconChange={(value) => {
            setSelectedIcon(value);
            setValue('icon', value);
          }}
          nameError={errors.name?.message}
          amountError={errors.amountCents?.message}
          dayOfPaymentError={errors.dayOfPayment?.message}
          startDateError={errors.startDate?.message}
          endDateError={errors.endDate?.message}
        />

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
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
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
    </FixedExpenseDialog>
  );
}
