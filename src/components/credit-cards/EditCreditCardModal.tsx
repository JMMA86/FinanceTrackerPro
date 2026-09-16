'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUIStore } from '@/store/ui.store';
import { updateCreditCard } from '@/actions/credit-card.actions';
import { UpdateCreditCardSchema, type UpdateCreditCardInput } from '@/actions/credit-card.schema';
import { get } from '@/lib/i18n';
import { log } from '@/lib/logger';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { NetworkPicker } from '@/components/ui/NetworkPicker';
import { CardDesignPicker } from '@/components/accounts/CardDesignPicker';
import type { CardNetwork } from '@/components/accounts/AccountCard';
import type { CreditCard } from './credit-card.types';

const MAX_SAFE = 9_999_999_999_999;

interface EditCreditCardModalProps {
  cards: CreditCard[];
  dictionary: Record<string, unknown>;
}

export function EditCreditCardModal({ cards, dictionary }: Readonly<EditCreditCardModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'edit-credit-card';
  const cardId = (modalData?.cardId as string) ?? null;
  const card = cards.find((c) => c.id === cardId) ?? null;

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
  } = useForm<UpdateCreditCardInput>({
    resolver: zodResolver(UpdateCreditCardSchema) as Resolver<UpdateCreditCardInput>,
    defaultValues: { accountId: cardId ?? '' },
  });

  useEffect(() => {
    if (!isOpen || !card) return;
    log.info({ action: 'credit-card.edit.open', cardId: card.id }, 'Edit credit card modal opened');
    reset({
      accountId: card.id,
      name: card.name,
      creditLimitCents: card.creditLimitCents ?? 0,
      cutoffDay: card.cutoffDay ?? undefined,
      paymentDueDay: card.paymentDueDay ?? undefined,
    });
    const id = requestAnimationFrame(() => {
      setCreditLimitCents(card.creditLimitCents ?? 0);
      setCardColor(card.cardColor ?? null);
      setCardNetwork((card.cardNetwork as CardNetwork) ?? 'NONE');
      setServerError('');
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, card, reset]);

  async function onSubmit(data: UpdateCreditCardInput) {
    log.info({ action: 'credit-card.update.submit', cardId: data.accountId }, 'Card update submit');
    setServerError('');
    const result = await updateCreditCard({
      ...data,
      cardColor: cardColor ?? undefined,
      cardNetwork,
    });
    if (result.success) {
      log.info(
        { action: 'credit-card.update.success', cardId: data.accountId },
        'Credit card updated (client)'
      );
      addNotification('success', get(dictionary, 'updateSuccess'));
      closeModal();
    } else {
      log.info(
        { action: 'credit-card.update.failure', cardId: data.accountId, code: result.code },
        'Credit card update failed (client)'
      );
      const msg =
        result.code === 'SESSION_INVALID'
          ? get(dictionary, 'errors.sessionInvalid')
          : get(dictionary, 'errors.updateFailed');
      setServerError(msg);
      addNotification('error', msg);
    }
  }

  if (!card) return null;

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <ModalDialog
      open={isOpen}
      titleId="edit-credit-card-title"
      title={get(dictionary, 'edit')}
      dictionary={dictionary}
      onClose={closeModal}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <input type="hidden" {...register('accountId')} />

        <div>
          <label htmlFor="edit-cc-name" className={labelCls}>
            {get(dictionary, 'cardName')}
          </label>
          <input
            id="edit-cc-name"
            type="text"
            autoComplete="off"
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
          <label htmlFor="edit-cc-limit" className={labelCls}>
            {get(dictionary, 'creditLimit')}
          </label>
          <FormattedNumericInput
            id="edit-cc-limit"
            value={creditLimitCents}
            maxValue={MAX_SAFE}
            onChange={(v) => {
              setCreditLimitCents(v);
              setValue('creditLimitCents', v);
            }}
            aria-invalid={!!errors.creditLimitCents}
            className={`${inputCls} font-mono tabular-nums`}
          />
          {errors.creditLimitCents && (
            <p role="alert" className="mt-1 text-xs text-red-400">
              {errors.creditLimitCents.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-cc-cutoff" className={labelCls}>
              {get(dictionary, 'cutoffDay')}
            </label>
            <input
              id="edit-cc-cutoff"
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
            <label htmlFor="edit-cc-due" className={labelCls}>
              {get(dictionary, 'paymentDueDay')}
            </label>
            <input
              id="edit-cc-due"
              type="number"
              min={1}
              max={31}
              inputMode="numeric"
              aria-invalid={!!errors.paymentDueDay}
              aria-describedby={errors.paymentDueDay ? 'edit-cc-due-error' : undefined}
              className={inputCls}
              {...register('paymentDueDay', { valueAsNumber: true })}
            />
            {errors.paymentDueDay && (
              <p id="edit-cc-due-error" role="alert" className="mt-1 text-xs text-red-400">
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
            {isSubmitting ? '…' : get(dictionary, 'save')}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
