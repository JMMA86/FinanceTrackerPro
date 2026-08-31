'use client';

import { useEffect, useRef, useState } from 'react';
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
const ACCOUNT_TYPES = ['SAVINGS', 'CHECKING', 'CASH'] as const;
const NETWORKS: { value: CardNetwork; labelKey: string }[] = [
  { value: 'NONE', labelKey: 'networks.NONE' },
  { value: 'VISA', labelKey: 'visa' },
  { value: 'MASTERCARD', labelKey: 'mastercard' },
  { value: 'AMEX', labelKey: 'amex' },
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

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [balanceCents, setBalanceCents] = useState(0);
  const [rateHundredths, setRateHundredths] = useState(0);
  const [cardColor, setCardColor] = useState<string | null>(null);
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>('NONE');
  const [isVisible, setIsVisible] = useState(false);
  // Holds a server-side error (e.g. SESSION_INVALID) rendered inline inside the
  // modal. NOTE: the global ToastViewport is a fixed z-[100] element that sits
  // BELOW the <dialog> top layer, so toasts are invisible while the modal is
  // open. This inline alert is the primary (visible) error surface; the toast
  // is kept as reinforcement in case the modal closes first.
  const [serverError, setServerError] = useState('');

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateAccountInput>({
    resolver: zodResolver(CreateAccountSchema) as Resolver<CreateAccountInput>,
    defaultValues: {
      idempotencyKey: crypto.randomUUID(),
      currency: 'COP',
      initialBalanceCents: 0,
      interestRateEA: 0,
    },
  });

  const selectedType = useWatch({ control, name: 'type' });
  const showRate = selectedType === 'SAVINGS' || selectedType === 'POCKET';

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
    log.info(
      { action: 'account.modal.open', type: isPocket ? 'POCKET' : 'ACCOUNT' },
      'Create account modal opened'
    );
    const parent = prefillParentId ? accounts.find((a) => a.id === prefillParentId) : null;
    reset({
      idempotencyKey: crypto.randomUUID(),
      currency: (parent?.currency ?? 'COP') as CreateAccountInput['currency'],
      initialBalanceCents: 0,
      interestRateEA: 0,
      ...(prefillType ? { type: prefillType as CreateAccountInput['type'] } : {}),
      ...(prefillParentId ? { parentAccountId: prefillParentId } : {}),
    });
    const id = requestAnimationFrame(() => {
      setServerError(''); // Clear any stale server error when (re)opening the modal
      setBalanceCents(0);
      setRateHundredths(0);
      setCardColor(null);
      setCardNetwork('NONE');
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, accounts, prefillParentId, prefillType, reset, isPocket]);

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 240);
  };

  const handleDialogClose = () => {
    closeModal();
  };

  async function onSubmit(data: CreateAccountInput) {
    log.info(
      {
        action: 'account.create.submit',
        type: data.type,
        parentAccountId: data.parentAccountId ?? null,
      },
      'Create account submit'
    );
    setServerError(''); // Clear any previous server error on each submit attempt
    const result = await createBankAccount({
      ...data,
      cardColor: cardColor ?? undefined,
      cardNetwork,
    });
    if (result.success) {
      log.info(
        { action: 'account.create.success', accountId: result.data?.account?.id },
        'Account created (client)'
      );
      addNotification('success', get(dictionary, 'createSuccess'));
      closeModal();
    } else {
      log.info(
        { action: 'account.create.failure', code: result.code },
        'Account create failed (client)'
      );
      const msg =
        result.code === 'SESSION_INVALID'
          ? get(dictionary, 'errors.sessionInvalid')
          : get(dictionary, 'errors.createFailed');
      // Render the error inline inside the modal: the toast below the <dialog>
      // top layer is invisible while the modal is open. Keep the toast too — it
      // becomes visible if/when the modal closes.
      setServerError(msg);
      addNotification('error', msg);
    }
  }

  const inputCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const selectCls =
    'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  const modalTitle = isPocket ? get(dictionary, 'newPocket') : get(dictionary, 'addAccount');

  let submitLabel;

  if (isSubmitting) {
    submitLabel = '…';
  } else if (isPocket) {
    submitLabel = get(dictionary, 'createPocket');
  } else {
    submitLabel = get(dictionary, 'create');
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="create-account-title"
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
          <h2 id="create-account-title" className="text-base font-semibold text-white">
            {modalTitle}
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
          <input type="hidden" {...register('idempotencyKey')} />

          {isPocket ? (
            <>
              <input type="hidden" {...register('type')} />
              <input type="hidden" {...register('currency')} />
              <input type="hidden" {...register('parentAccountId')} />
              <div>
                <label htmlFor="acc-name" className={labelCls}>
                  {get(dictionary, 'pocketName')}
                </label>
                <input
                  id="acc-name"
                  type="text"
                  autoComplete="off"
                  placeholder={get(dictionary, 'pocketNamePlaceholder')}
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
                <label htmlFor="acc-rate" className={labelCls}>
                  {get(dictionary, 'interestRatePocket')}
                </label>
                <FormattedNumericInput
                  id="acc-rate"
                  value={rateHundredths}
                  suffix="%"
                  maxValue={MAX_RATE}
                  onChange={(v) => {
                    setRateHundredths(v);
                    setValue('interestRateEA', v / 100);
                  }}
                  aria-describedby="acc-rate-hint"
                  className={`${inputCls} font-mono tabular-nums`}
                />
                <p id="acc-rate-hint" className="mt-1 text-xs text-slate-500">
                  {get(dictionary, 'interestRateHint')}
                </p>
              </div>
            </>
          ) : (
            <>
              <div>
                <label htmlFor="acc-name" className={labelCls}>
                  {get(dictionary, 'accountName')}
                </label>
                <input
                  id="acc-name"
                  type="text"
                  autoComplete="off"
                  placeholder={get(dictionary, 'accountNamePlaceholder')}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="acc-type" className={labelCls}>
                    {get(dictionary, 'accountType')}
                  </label>
                  <select
                    id="acc-type"
                    aria-invalid={!!errors.type}
                    className={selectCls}
                    {...register('type')}
                  >
                    <option value="">—</option>
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t} className="bg-slate-800">
                        {get(dictionary, `types.${t}`)}
                      </option>
                    ))}
                  </select>
                  {errors.type && (
                    <p role="alert" className="mt-1 text-xs text-red-400">
                      {errors.type.message}
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="acc-currency" className={labelCls}>
                    {get(dictionary, 'currency')}
                  </label>
                  <select id="acc-currency" className={selectCls} {...register('currency')}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c} className="bg-slate-800">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="acc-balance" className={labelCls}>
                  {get(dictionary, 'initialBalance')}
                </label>
                <FormattedNumericInput
                  id="acc-balance"
                  value={balanceCents}
                  onChange={(v) => {
                    setBalanceCents(v);
                    setValue('initialBalanceCents', v);
                  }}
                  aria-invalid={!!errors.initialBalanceCents}
                  className={`${inputCls} font-mono tabular-nums`}
                />
                {errors.initialBalanceCents && (
                  <p role="alert" className="mt-1 text-xs text-red-400">
                    {errors.initialBalanceCents.message}
                  </p>
                )}
              </div>

              {showRate && (
                <div>
                  <label htmlFor="acc-rate" className={labelCls}>
                    {get(dictionary, 'interestRate')}
                  </label>
                  <FormattedNumericInput
                    id="acc-rate"
                    value={rateHundredths}
                    suffix="%"
                    maxValue={MAX_RATE}
                    onChange={(v) => {
                      setRateHundredths(v);
                      setValue('interestRateEA', v / 100);
                    }}
                    aria-describedby="acc-rate-hint"
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                  <p id="acc-rate-hint" className="mt-1 text-xs text-slate-500">
                    {get(dictionary, 'interestRateHint')}
                  </p>
                </div>
              )}

              <div>
                <p className={labelCls}>{get(dictionary, 'paymentNetwork')}</p>
                <div className="grid grid-cols-4 gap-2">
                  {NETWORKS.map(({ value, labelKey }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setCardNetwork(value)}
                      aria-pressed={cardNetwork === value}
                      className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${
                        cardNetwork === value
                          ? 'border-blue-500/60 bg-blue-500/15 text-white'
                          : 'border-white/10 bg-white/4 text-slate-400 hover:border-white/20'
                      }`}
                    >
                      {value === 'NONE' ? (
                        <span className="text-base">—</span>
                      ) : (
                        <span className="h-4 flex items-center">
                          <NetworkLogo network={value} size="sm" />
                        </span>
                      )}
                      <span className="text-[10px]">{get(dictionary, labelKey)}</span>
                    </button>
                  ))}
                </div>
              </div>

              <CardDesignPicker
                cardColor={cardColor}
                onColorChange={setCardColor}
                dictionary={dictionary}
              />
            </>
          )}

          {/* Server error (inline — the toast is hidden below the <dialog> top layer) */}
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
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors"
            >
              {get(dictionary, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
