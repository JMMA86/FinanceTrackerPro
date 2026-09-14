'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { get } from '@/lib/i18n';
import { createVariableExpense, updateVariableExpense } from '@/actions/variable-expense.actions';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import type { CategoryBrief } from '@/components/transactions/types';
import type { VariableExpenseDefinition } from '@/types/variable-expense';
import { VariableExpenseDialog } from './VariableExpenseDialog';
import {
  DEFAULT_VARIABLE_EXPENSE_COLOR,
  DEFAULT_VARIABLE_EXPENSE_ICON,
  VARIABLE_EXPENSE_COLOR_PRESETS,
  VARIABLE_EXPENSE_CURRENCIES,
  VARIABLE_EXPENSE_ICONS,
} from './constants';

interface VariableExpenseDefinitionModalProps {
  isOpen: boolean;
  /** Definition to edit, or null to create a new one. */
  definition: VariableExpenseDefinition | null;
  dictionary: Record<string, unknown>;
  locale: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DefinitionSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  description: z.string().max(500, 'Description is too long').optional(),
  categoryId: z.string().min(1, 'Select a category'),
  expectedTimesPerMonth: z.number().int().min(1).max(31).optional(),
  expectedAmountCents: z.number().int().min(1).optional(),
  currency: z.enum(VARIABLE_EXPENSE_CURRENCIES),
});

type DefinitionFormData = z.infer<typeof DefinitionSchema>;

const INPUT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-transparent transition-all';
const SELECT_CLS =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-transparent transition-all appearance-none';
const LABEL_CLS = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';
const ERROR_CLS = 'mt-1 text-xs text-red-400';

/**
 * Create/edit a monitored variable-expense definition (name, description,
 * color, icon, monthly targets and currency).
 */
export function VariableExpenseDefinitionModal({
  isOpen,
  definition,
  dictionary,
  locale,
  onClose,
  onSuccess,
}: Readonly<VariableExpenseDefinitionModalProps>) {
  const isEditing = definition !== null;
  const [color, setColor] = useState(DEFAULT_VARIABLE_EXPENSE_COLOR);
  const [icon, setIcon] = useState(DEFAULT_VARIABLE_EXPENSE_ICON);
  const [expectedAmountCents, setExpectedAmountCents] = useState(0);
  const [categories, setCategories] = useState<CategoryBrief[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DefinitionFormData>({
    resolver: zodResolver(DefinitionSchema) as Resolver<DefinitionFormData>,
    defaultValues: {
      name: '',
      description: '',
      categoryId: '',
      expectedTimesPerMonth: undefined,
      expectedAmountCents: undefined,
      currency: 'COP',
    },
  });

  const selectedCategoryId = useWatch({ control, name: 'categoryId' });

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      reset({
        name: definition?.name ?? '',
        description: definition?.description ?? '',
        categoryId: definition?.categoryId ?? '',
        expectedTimesPerMonth: definition?.expectedTimesPerMonth ?? undefined,
        expectedAmountCents: definition?.expectedAmountCents ?? undefined,
        currency: definition?.currency ?? 'COP',
      });
      setColor(definition?.color ?? DEFAULT_VARIABLE_EXPENSE_COLOR);
      setIcon(definition?.icon ?? DEFAULT_VARIABLE_EXPENSE_ICON);
      setExpectedAmountCents(definition?.expectedAmountCents ?? 0);
      setSubmitError(null);
      void (async () => {
        try {
          const { getCategories } = await import('@/actions/category.actions');
          const result = await getCategories({});
          setCategories(
            result.success && result.data
              ? result.data.map((category) => ({
                  id: category.id,
                  name: category.name,
                  type: category.type,
                  color: category.color,
                  userId: category.userId,
                }))
              : []
          );
        } catch {
          setCategories([]);
        }
      })();
    }, 0);
    return () => clearTimeout(timer);
  }, [isOpen, definition, reset]);

  const onSubmit = useCallback(
    async (data: DefinitionFormData) => {
      setSubmitError(null);
      const payload = {
        name: data.name.trim(),
        description: data.description || undefined,
        categoryId: data.categoryId,
        color,
        icon,
        expectedTimesPerMonth: data.expectedTimesPerMonth,
        expectedAmountCents: data.expectedAmountCents,
        currency: data.currency,
      };

      const result =
        isEditing && definition
          ? await updateVariableExpense({
              variableExpenseId: definition.id,
              ...payload,
              description: data.description || null,
              expectedTimesPerMonth: data.expectedTimesPerMonth ?? null,
              expectedAmountCents: data.expectedAmountCents ?? null,
            })
          : await createVariableExpense(payload);

      if (result.success) {
        onClose();
        onSuccess();
      } else if (result.code === 'VALIDATION_ERROR') {
        setSubmitError(get(dictionary, 'errors.duplicateName'));
      } else {
        setSubmitError(get(dictionary, isEditing ? 'errors.updateFailed' : 'errors.createFailed'));
      }
    },
    [color, icon, dictionary, isEditing, definition, onClose, onSuccess]
  );

  const handleFormSubmit = useCallback(
    (event: React.SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleSubmit(onSubmit)(event);
    },
    [handleSubmit, onSubmit]
  );

  return (
    <VariableExpenseDialog
      open={isOpen}
      titleId="variable-expense-definition-title"
      title={isEditing ? get(dictionary, 'editDefinition') : get(dictionary, 'createDefinition')}
      dictionary={dictionary}
      onClose={onClose}
    >
      <form onSubmit={handleFormSubmit} className="space-y-4" noValidate>
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
          <label htmlFor="definition-name" className={LABEL_CLS}>
            {get(dictionary, 'definitionName')}
          </label>
          <input
            id="definition-name"
            type="text"
            maxLength={100}
            placeholder={get(dictionary, 'definitionNamePlaceholder')}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'definition-name-error' : undefined}
            className={INPUT_CLS}
            {...register('name')}
          />
          {errors.name && (
            <p id="definition-name-error" role="alert" className={ERROR_CLS}>
              {errors.name.message}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label htmlFor="definition-description" className={LABEL_CLS}>
            {get(dictionary, 'definitionDescription')}
          </label>
          <textarea
            id="definition-description"
            rows={2}
            maxLength={500}
            placeholder={get(dictionary, 'definitionDescriptionPlaceholder')}
            className={`${INPUT_CLS} resize-none`}
            {...register('description')}
          />
        </div>

        {/* Category (required) */}
        <fieldset>
          <legend className={LABEL_CLS}>{get(dictionary, 'category')}</legend>
          <div className="flex flex-wrap gap-2 mt-1">
            {categories.map((category) => {
              const isActive = selectedCategoryId === category.id;
              return (
                <label
                  key={category.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                    isActive
                      ? 'border-teal-500/60 bg-teal-500/15'
                      : 'border-white/10 bg-white/4 hover:border-white/20'
                  }`}
                >
                  <input
                    type="radio"
                    value={category.id}
                    {...register('categoryId')}
                    className="sr-only"
                    aria-label={category.name}
                  />
                  <span
                    className="w-3 h-3 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: category.color ?? '#64748B' }}
                    aria-hidden="true"
                  />
                  <span
                    className={`text-xs font-semibold ${
                      isActive ? 'text-white' : 'text-slate-300'
                    }`}
                  >
                    {category.name}
                  </span>
                </label>
              );
            })}
          </div>
          {errors.categoryId && (
            <p role="alert" className={ERROR_CLS}>
              {get(dictionary, 'selectCategory')}
            </p>
          )}
        </fieldset>

        {/* Expected times + amount */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="definition-times" className={LABEL_CLS}>
              {get(dictionary, 'expectedTimes')}
            </label>
            <input
              id="definition-times"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              aria-invalid={!!errors.expectedTimesPerMonth}
              aria-describedby={errors.expectedTimesPerMonth ? 'definition-times-error' : undefined}
              className={INPUT_CLS}
              {...register('expectedTimesPerMonth', {
                setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
              })}
            />
            {errors.expectedTimesPerMonth && (
              <p id="definition-times-error" role="alert" className={ERROR_CLS}>
                {errors.expectedTimesPerMonth.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="definition-amount" className={LABEL_CLS}>
              {get(dictionary, 'expectedAmount')}
            </label>
            <FormattedNumericInput
              id="definition-amount"
              value={expectedAmountCents}
              onChange={(value) => {
                setExpectedAmountCents(value);
                setValue('expectedAmountCents', value > 0 ? value : undefined, {
                  shouldValidate: true,
                });
              }}
              locale={locale}
              className={`${INPUT_CLS} font-mono tabular-nums`}
            />
          </div>
        </div>

        {/* Currency */}
        <div>
          <label htmlFor="definition-currency" className={LABEL_CLS}>
            {get(dictionary, 'currency')}
          </label>
          <select id="definition-currency" className={SELECT_CLS} {...register('currency')}>
            {VARIABLE_EXPENSE_CURRENCIES.map((currency) => (
              <option key={currency} value={currency} className="bg-slate-800">
                {currency}
              </option>
            ))}
          </select>
        </div>

        {/* Color */}
        <fieldset>
          <legend className={LABEL_CLS}>{get(dictionary, 'color')}</legend>
          <div className="flex flex-wrap items-center gap-2.5">
            {VARIABLE_EXPENSE_COLOR_PRESETS.map((preset) => (
              <label
                key={preset.value}
                className={`w-8 h-8 rounded-full cursor-pointer border-2 transition-all ${
                  color === preset.value
                    ? 'border-white scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: preset.value }}
              >
                <input
                  type="radio"
                  name="definition-color"
                  value={preset.value}
                  checked={color === preset.value}
                  onChange={() => setColor(preset.value)}
                  className="sr-only"
                  aria-label={get(dictionary, preset.labelKey)}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {/* Icon */}
        <fieldset>
          <legend className={LABEL_CLS}>{get(dictionary, 'icon')}</legend>
          <div className="flex flex-wrap gap-2">
            {VARIABLE_EXPENSE_ICONS.map((option) => {
              const isActive = icon === option.name;
              const Icon = option.Icon;
              return (
                <button
                  key={option.name}
                  type="button"
                  onClick={() => setIcon(option.name)}
                  aria-pressed={isActive}
                  aria-label={get(dictionary, option.labelKey)}
                  className={`p-2 rounded-xl border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 ${
                    isActive
                      ? 'border-teal-500/60 bg-teal-500/15 text-teal-300'
                      : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
          >
            {isSubmitting ? (
              <>{get(dictionary, 'loading')}</>
            ) : (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                {isEditing ? get(dictionary, 'save') : get(dictionary, 'createDefinition')}
              </>
            )}
          </button>
        </div>
      </form>
    </VariableExpenseDialog>
  );
}
