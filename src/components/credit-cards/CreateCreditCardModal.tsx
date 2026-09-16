'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUIStore } from '@/store/ui.store';
import { createCreditCard } from '@/actions/credit-card.actions';
import { CreateCreditCardSchema, type CreateCreditCardInput } from '@/actions/credit-card.schema';
import { get } from '@/lib/i18n';
import { log } from '@/lib/logger';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { NetworkPicker } from '@/components/ui/NetworkPicker';
import { CardDesignPicker } from '@/components/accounts/CardDesignPicker';
import type { CardNetwork } from '@/components/accounts/AccountCard';

const CURRENCIES = ['COP', 'USD', 'EUR'] as const;
const MAX_SAFE = 9_999_999_999_999;

interface CreateCreditCardModalProps {
  dictionary: Record<string, unknown>;
}

export function CreateCreditCardModal({ dictionary }: Readonly<CreateCreditCardModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'create-credit-card';

  const [creditLimitCents, setCreditLimitCents] = useState(0);
  const [cardColor, setCardColor] = useState<string | null>(null);
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>('NONE');
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateCreditCardInput>({
    resolver: zodResolver(CreateCreditCardSchema) as Resolver<CreateCreditCardInput>,
    defaultValues: {
      idempotencyKey: crypto.randomUUID(),
      currency: 'COP',
      creditLimitCents: 0,
      cutoffDay: 1,
      paymentDueDay: 15,
    },
  });

  useEffect(() => {
    if (!isOpen) return;
    log.info({ action: 'credit-card.create.open' }, 'Create credit card modal opened');
    reset({
      idempotencyKey: crypto.randomUUID(),
      currency: 'COP',
      creditLimitCents: 0,
      cutoffDay: 1,
      paymentDueDay: 15,
    });
    const id = requestAnimationFrame(() => {
      setServerError('');
      setCreditLimitCents(0);
      setCardColor(null);
      setCardNetwork('NONE');
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, reset]);

  async function onSubmit(data: CreateCreditCardInput) {
    log.info({ action: 'credit-card.create.submit' }, 'Create credit card submit');
    setServerError('');
    const result = await createCreditCard({
      ...data,
      cardColor: cardColor ?? undefined,
      cardNetwork,
    });
    if (result.success) {
      log.info(
        { action: 'credit-card.create.success', accountId: result.data?.account?.id },
        'Credit card created (client)'
      );
      addNotification('success', get(dictionary, 'createSuccess'));
      closeModal();
    } else {
      log.info(
        { action: 'credit-card.create.failure', code: result.code },
        'Credit card create failed (client)'
      );
      const msg =
        result.code === 'SESSION_INVALID'
          ? get(dictionary, 'errors.sessionInvalid')
          : get(dictionary, 'errors.createFailed');
      setServerError(msg);
      addNotification('error', msg);
    }
  }

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <ModalDialog
      open={isOpen}
      titleId="create-credit-card-title"
      title={get(dictionary, 'addCard')}
      dictionary={dictionary}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input type="hidden" {...register('idempotencyKey')} />

        <div>
          <label htmlFor="cc-name" className={labelCls}>
            {get(dictionary, 'cardName')}
          </label>
          <input
            id="cc-name"
            type="text"
            autoComplete="off"
            placeholder={get(dictionary, 'cardNamePlaceholder')}
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

        <div>
          <label htmlFor="cc-currency" className={labelCls}>
            {get(dictionary, 'currency')}
          </label>
          <select id="cc-currency" className={selectCls} {...register('currency')}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c} className="bg-slate-800">
                {c}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="cc-limit" className={labelCls}>
            {get(dictionary, 'creditLimit')}
          </label>
          <FormattedNumericInput
            id="cc-limit"
            value={creditLimitCents}
            maxValue={MAX_SAFE}
            onChange={(v) => {
              setCreditLimitCents(v);
              setValue('creditLimitCents', v);
            }}
            aria-invalid={!!errors.creditLimitCents}
            aria-describedby={errors.creditLimitCents ? 'cc-limit-error' : undefined}
            className={`${inputCls} font-mono tabular-nums`}
          />
          {errors.creditLimitCents && (
            <p id="cc-limit-error" role="alert" className="mt-1 text-xs text-red-400">
              {errors.creditLimitCents.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cc-cutoff" className={labelCls}>
              {get(dictionary, 'cutoffDay')}
            </label>
            <input
              id="cc-cutoff"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              aria-invalid={!!errors.cutoffDay}
              className={inputCls}
              {...register('cutoffDay', { valueAsNumber: true })}
            />
            {errors.cutoffDay && (
              <p role="alert" className="mt-1 text-xs text-red-400">
                {errors.cutoffDay.message}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="cc-due" className={labelCls}>
              {get(dictionary, 'paymentDueDay')}
            </label>
            <input
              id="cc-due"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              aria-invalid={!!errors.paymentDueDay}
              aria-describedby={errors.paymentDueDay ? 'cc-due-error' : undefined}
              className={inputCls}
              {...register('paymentDueDay', { valueAsNumber: true })}
            />
            {errors.paymentDueDay && (
              <p id="cc-due-error" role="alert" className="mt-1 text-xs text-red-400">
                {errors.paymentDueDay.message}
              </p>
            )}
          </div>
        </div>

        <div>
          <p className={labelCls}>{get(dictionary, 'paymentNetwork')}</p>
          <NetworkPicker value={cardNetwork} onChange={setCardNetwork} dictionary={dictionary} />
        </div>

        <CardDesignPicker
          cardColor={cardColor}
          onColorChange={setCardColor}
          dictionary={dictionary}
        />

        {/* Server error */}
        {serverError && (
          <div
            role="alert"
            className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-xl p-3"
          >
            <p className="text-sm text-red-200 font-medium">{serverError}</p>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={closeModal}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
          >
            {get(dictionary, 'cancel')}
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            {isSubmitting ? '…' : get(dictionary, 'createCard')}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
