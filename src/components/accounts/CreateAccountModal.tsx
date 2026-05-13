'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useForm, useWatch } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { createBankAccount } from '@/actions/account.actions';
import { CreateAccountSchema, type CreateAccountInput } from '@/actions/account.schema';
import { get } from '@/lib/i18n';
import { log } from '@/lib/logger';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { CardDesignPicker } from './CardDesignPicker';
import { NetworkLogo } from './AccountCard';
import type { AccountCardData, CardNetwork } from './AccountCard';

const CURRENCIES = ['COP', 'USD', 'EUR'] as const;
// POCKET is excluded — pockets are created from within an open account
const ACCOUNT_TYPES = ['SAVINGS', 'CHECKING', 'CASH'] as const;
const NETWORKS: { value: CardNetwork; label: string }[] = [
  { value: 'NONE', label: 'Ninguna' },
  { value: 'VISA', label: 'Visa' },
  { value: 'MASTERCARD', label: 'Mastercard' },
  { value: 'AMEX', label: 'Amex' },
];
const MAX_RATE = 10_000;

interface CreateAccountModalProps {
  accounts: AccountCardData[];
  dictionary: Record<string, unknown>;
}

export function CreateAccountModal({ accounts, dictionary }: Readonly<CreateAccountModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'create-account';

  const prefillType = (modalData?.prefillType as string | undefined) ?? '';
  const prefillParentId = (modalData?.prefillParentId as string | undefined) ?? '';
  const isPocket = prefillType === 'POCKET';

  const [balanceCents, setBalanceCents] = useState(0);
  const [rateHundredths, setRateHundredths] = useState(0);
  const [cardColor, setCardColor] = useState<string | null>(null);
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>('NONE');

  const {
    register, handleSubmit, control, reset, setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateAccountInput>({
    resolver: zodResolver(CreateAccountSchema) as Resolver<CreateAccountInput>,
    defaultValues: { idempotencyKey: crypto.randomUUID(), currency: 'COP', initialBalanceCents: 0, interestRateEA: 0 },
  });

  const selectedType = useWatch({ control, name: 'type' });
  const showRate = selectedType === 'SAVINGS' || selectedType === 'POCKET';

  useEffect(() => {
    if (!isOpen) return;
    log.info({ action: 'account.modal.open', type: isPocket ? 'POCKET' : 'ACCOUNT' }, 'Create account modal opened');
    const parent = prefillParentId ? accounts.find((a) => a.id === prefillParentId) : null;
    reset({
      idempotencyKey: crypto.randomUUID(),
      currency: (parent?.currency ?? 'COP') as CreateAccountInput['currency'],
      initialBalanceCents: 0,
      interestRateEA: 0,
      ...(prefillType ? { type: prefillType as CreateAccountInput['type'] } : {}),
      ...(prefillParentId ? { parentAccountId: prefillParentId } : {}),
    });
    // Local UI state reset inside rAF to avoid direct setState in effect body
    const id = requestAnimationFrame(() => {
      setBalanceCents(0);
      setRateHundredths(0);
      setCardColor(null);
      setCardNetwork('NONE');
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, accounts, prefillParentId, prefillType, reset, isPocket]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, closeModal]);

  async function onSubmit(data: CreateAccountInput) {
    log.info(
      { action: 'account.create.submit', type: data.type, parentAccountId: data.parentAccountId ?? null },
      'Create account submit',
    );
    const result = await createBankAccount({
      ...data,
      cardColor: cardColor ?? undefined,
      cardNetwork,
    });
    if (result.success) {
      log.info({ action: 'account.create.success', accountId: result.data.account.id }, 'Account created (client)');
      addNotification('success', get(dictionary, 'createSuccess') as string);
      closeModal();
    } else {
      log.info({ action: 'account.create.failure', code: result.code }, 'Account create failed (client)');
      const msg = result.code === 'SESSION_INVALID'
        ? (get(dictionary, 'errors.sessionInvalid') as string)
        : (get(dictionary, 'errors.createFailed') as string);
      addNotification('error', msg);
    }
  }

  if (!isOpen) return null;
  if (typeof document === 'undefined') return null;

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const selectCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  const modalTitle = isPocket ? 'Nuevo bolsillo' : (get(dictionary, 'addAccount') as string);

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="create-account-title"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={closeModal}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2 id="create-account-title" className="text-base font-semibold text-white">
            {modalTitle}
          </h2>
          <button type="button" onClick={closeModal} aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4" noValidate>
          <input type="hidden" {...register('idempotencyKey')} />

          {isPocket ? (
            <>
              <input type="hidden" {...register('type')} />
              <input type="hidden" {...register('currency')} />
              <input type="hidden" {...register('parentAccountId')} />
              <div>
                <label htmlFor="acc-name" className={labelCls}>Nombre del bolsillo</label>
                <input id="acc-name" type="text" autoComplete="off" placeholder="Ej. Viajes, Mercado..."
                  aria-invalid={!!errors.name} className={inputCls} {...register('name')} />
                {errors.name && <p role="alert" className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
              </div>
              <div>
                <label htmlFor="acc-rate" className={labelCls}>{get(dictionary, 'interestRatePocket') as string}</label>
                <FormattedNumericInput id="acc-rate" value={rateHundredths} suffix="%" maxValue={MAX_RATE}
                  onChange={(v) => { setRateHundredths(v); setValue('interestRateEA', v / 100); }}
                  aria-describedby="acc-rate-hint"
                  className={`${inputCls} font-mono tabular-nums`} />
                <p id="acc-rate-hint" className="mt-1 text-xs text-slate-500">{get(dictionary, 'interestRateHint') as string}</p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="acc-name" className={labelCls}>{get(dictionary, 'accountName') as string}</label>
                <input id="acc-name" type="text" autoComplete="off" placeholder="Ej. Nómina Bancolombia"
                  aria-invalid={!!errors.name} className={inputCls} {...register('name')} />
                {errors.name && <p role="alert" className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="acc-type" className={labelCls}>{get(dictionary, 'accountType') as string}</label>
                  <select id="acc-type" aria-invalid={!!errors.type} className={selectCls} {...register('type')}>
                    <option value="">—</option>
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-slate-800">{get(dictionary, `types.${t}`) as string}</option>
                    ))}
                  </select>
                  {errors.type && <p role="alert" className="mt-1 text-xs text-red-400">{errors.type.message}</p>}
                </div>
                <div>
                  <label htmlFor="acc-currency" className={labelCls}>{get(dictionary, 'currency') as string}</label>
                  <select id="acc-currency" className={selectCls} {...register('currency')}>
                    {CURRENCIES.map((c) => <option key={c} value={c} className="bg-slate-800">{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="acc-balance" className={labelCls}>{get(dictionary, 'initialBalance') as string}</label>
                <FormattedNumericInput id="acc-balance" value={balanceCents}
                  onChange={(v) => { setBalanceCents(v); setValue('initialBalanceCents', v); }}
                  aria-invalid={!!errors.initialBalanceCents}
                  className={`${inputCls} font-mono tabular-nums`} />
                {errors.initialBalanceCents && (
                  <p role="alert" className="mt-1 text-xs text-red-400">{errors.initialBalanceCents.message}</p>
                )}
              </div>

              {showRate && (
                <div>
                  <label htmlFor="acc-rate" className={labelCls}>{get(dictionary, 'interestRate') as string}</label>
                  <FormattedNumericInput id="acc-rate" value={rateHundredths} suffix="%" maxValue={MAX_RATE}
                    onChange={(v) => { setRateHundredths(v); setValue('interestRateEA', v / 100); }}
                    aria-describedby="acc-rate-hint"
                    className={`${inputCls} font-mono tabular-nums`} />
                  <p id="acc-rate-hint" className="mt-1 text-xs text-slate-500">{get(dictionary, 'interestRateHint') as string}</p>
                </div>
              )}

              <div>
                <p className={labelCls}>Red de pago</p>
                <div className="grid grid-cols-4 gap-2">
                  {NETWORKS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCardNetwork(value)}
                      aria-pressed={cardNetwork === value}
                      className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${cardNetwork === value
                          ? 'border-blue-500/60 bg-blue-500/15 text-white'
                          : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20'
                        }`}
                    >
                      {value !== 'NONE' ? (
                        <span className="h-4 flex items-center">
                          <NetworkLogo network={value} size="sm" />
                        </span>
                      ) : (
                        <span className="text-base">—</span>
                      )}
                      <span className="text-[10px]">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <CardDesignPicker cardColor={cardColor} onColorChange={setCardColor} dictionary={dictionary} />
            </>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeModal}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors">
              {get(dictionary, 'cancel') as string}
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {isSubmitting ? '…' : isPocket ? 'Crear bolsillo' : (get(dictionary, 'create') as string)}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
