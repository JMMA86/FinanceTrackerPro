'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { createFixedExpense } from '@/actions/fixed-expense.actions';
import {
  CreateFixedExpenseSchema,
  type CreateFixedExpenseInput,
} from '@/actions/fixed-expense.schema';
import { FixedExpenseDialog } from './FixedExpenseDialog';
import { FixedExpenseFormFields } from './FixedExpenseFormFields';
import {
  DEFAULT_FIXED_EXPENSE_COLOR,
  DEFAULT_FIXED_EXPENSE_ICON,
  parseDateInput,
} from './constants';

interface CreateFixedExpenseModalProps {
  dictionary: Record<string, unknown>;
  locale: string;
  isOpen: boolean;
  /** Server-computed `YYYY-MM-DD` used as the start date default (no SSR drift). */
  todayDate: string;
  onClose: () => void;
}

/**
 * Create a fixed expense template. Money is entered in cents through
 * FormattedNumericInput; the shared FixedExpenseFormFields component renders
 * every input so create/edit stay in sync.
 */
export function CreateFixedExpenseModal({
  dictionary,
  locale,
  isOpen,
  todayDate,
  onClose,
}: Readonly<CreateFixedExpenseModalProps>) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);
  const [selectedColor, setSelectedColor] = useState(DEFAULT_FIXED_EXPENSE_COLOR);
  const [customColor, setCustomColor] = useState(DEFAULT_FIXED_EXPENSE_COLOR);
  const [selectedIcon, setSelectedIcon] = useState(DEFAULT_FIXED_EXPENSE_ICON);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateFixedExpenseInput>({
    resolver: zodResolver(CreateFixedExpenseSchema) as Resolver<CreateFixedExpenseInput>,
    defaultValues: {
      currency: 'COP',
      frequency: 'MONTHLY',
      amountCents: 0,
      startDate: parseDateInput(todayDate) ?? new Date(),
      color: DEFAULT_FIXED_EXPENSE_COLOR,
      icon: DEFAULT_FIXED_EXPENSE_ICON,
    },
  });

  const startDate = useWatch({ control, name: 'startDate' });
  const endDate = useWatch({ control, name: 'endDate' });
  const dayOfPayment = useWatch({ control, name: 'dayOfPayment' });

  useEffect(() => {
    if (!isOpen) return;
    reset({
      name: '',
      description: undefined,
      amountCents: 0,
      currency: 'COP',
      frequency: 'MONTHLY',
      dayOfPayment: undefined,
      startDate: parseDateInput(todayDate) ?? new Date(),
      endDate: undefined,
      color: DEFAULT_FIXED_EXPENSE_COLOR,
      icon: DEFAULT_FIXED_EXPENSE_ICON,
    });
    const id = requestAnimationFrame(() => {
      setAmountCents(0);
      setSelectedColor(DEFAULT_FIXED_EXPENSE_COLOR);
      setCustomColor(DEFAULT_FIXED_EXPENSE_COLOR);
      setSelectedIcon(DEFAULT_FIXED_EXPENSE_ICON);
      setSubmitError(null);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset, todayDate]);

  async function onSubmit(data: CreateFixedExpenseInput) {
    setSubmitError(null);
    try {
      const result = await createFixedExpense(data);
      if (result.success) {
        onClose();
      } else {
        const msg =
          result.code === 'UNAUTHORIZED'
            ? get(dictionary, 'errors.sessionInvalid')
            : (result.error ?? get(dictionary, 'errors.createFailed'));
        setSubmitError(msg);
      }
    } catch {
      setSubmitError(get(dictionary, 'errors.createFailed'));
    }
  }

  const nameField = register('name');
  const descriptionField = register('description', { setValueAs: (v: string) => v || undefined });
  const currencyField = register('currency');
  const frequencyField = register('frequency');

  return (
    <FixedExpenseDialog
      open={isOpen}
      titleId="create-fixed-expense-title"
      title={get(dictionary, 'newFixedExpense')}
      dictionary={dictionary}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
          idPrefix="fixed-expense"
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
            setValue('startDate', parseDateInput(raw) as Date, { shouldValidate: true })
          }
          endDate={endDate}
          onEndDateChange={(raw) => setValue('endDate', parseDateInput(raw))}
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
            disabled={isSubmitting || amountCents <= 0}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70"
          >
            {isSubmitting ? (
              <>{get(dictionary, 'loading')}</>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {get(dictionary, 'createExpense')}
              </>
            )}
          </button>
        </div>
      </form>
    </FixedExpenseDialog>
  );
}
