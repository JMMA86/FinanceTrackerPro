'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { X } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { updateBankAccount } from '@/actions/account.actions';
import { UpdateAccountSchema, type UpdateAccountInput } from '@/actions/account.schema';
import { get } from '@/lib/i18n';
import { log } from '@/lib/logger';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { CardDesignPicker } from './CardDesignPicker';
import { NetworkLogo } from './AccountCard';
import type { AccountCardData, CardNetwork } from './AccountCard';

const RATE_TYPES = new Set(['SAVINGS', 'POCKET']);
const MAX_RATE = 10_000;
const NETWORKS: { value: CardNetwork; labelKey: string }[] = [
  { value: 'NONE', labelKey: 'networks.NONE' },
  { value: 'VISA', labelKey: 'visa' },
  { value: 'MASTERCARD', labelKey: 'mastercard' },
  { value: 'AMEX', labelKey: 'amex' },
];

function toRateHundredths(rate: number | null | undefined): number {
  return rate == null ? 0 : Math.round(Number(rate) * 100);
}

interface EditAccountModalProps {
  accounts: AccountCardData[];
  dictionary: Record<string, unknown>;
}

export function EditAccountModal({ accounts, dictionary }: Readonly<EditAccountModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'edit-account';
  const accountId = (modalData?.accountId as string) ?? null;
  const account = accounts.find((a) => a.id === accountId) ?? null;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rateHundredths, setRateHundredths] = useState(0);
  const [cardColor, setCardColor] = useState<string | null>(null);
  const [cardNetwork, setCardNetwork] = useState<CardNetwork>('NONE');
  const [isVisible, setIsVisible] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAccountInput>({
    resolver: zodResolver(UpdateAccountSchema) as Resolver<UpdateAccountInput>,
    defaultValues: { accountId: accountId ?? '', name: account?.name ?? '', interestRateEA: 0 },
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
    if (!isOpen || !account) return;
    log.info({ action: 'account.edit.open', accountId: account.id }, 'Edit account modal opened');
    const rate = toRateHundredths(account.interestRateEA);
    const accountCardColor = account.cardColor ?? null;
    const accountCardNetwork = (account.cardNetwork as CardNetwork) ?? 'NONE';
    reset({ accountId: account.id, name: account.name, interestRateEA: rate / 100 });
    const id = requestAnimationFrame(() => {
      setRateHundredths(rate);
      setCardColor(accountCardColor);
      setCardNetwork(accountCardNetwork);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, account, reset]);

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

  async function onSubmit(data: UpdateAccountInput) {
    log.info({ action: 'account.update.submit', accountId: data.accountId }, 'Account update submit');
    const result = await updateBankAccount({ ...data, cardColor, cardNetwork });
    if (result.success) {
      document.dispatchEvent(new CustomEvent('finance:account-updated', {
        detail: { accountId: account?.id, cardColor, cardNetwork },
      }));
      log.info({ action: 'account.update.success', accountId: account?.id }, 'Account updated (client)');
      addNotification('success', get(dictionary, 'updateSuccess'));
      closeModal();
    } else {
      log.info({ action: 'account.update.failure', accountId: data.accountId, code: result.code }, 'Account update failed (client)');
      addNotification('error', get(dictionary, 'errors.updateFailed'));
    }
  }

  if (!account) return null;

  const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const panelStyle: React.CSSProperties = {
    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
    opacity: isVisible ? 1 : 0,
    transition: isVisible
      ? `transform 280ms ${SPRING}, opacity 200ms ${EASE}`
      : `transform 200ms ${EASE}, opacity 180ms ${EASE}`,
  };

  const showRate = RATE_TYPES.has(account.type);
  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <dialog ref={dialogRef} onClose={handleDialogClose} aria-labelledby="edit-account-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={handleClose}
        className="fixed inset-0"
        style={{ backgroundColor: isVisible ? 'rgba(0,0,0,0.60)' : 'rgba(0,0,0,0)', backdropFilter: isVisible ? 'blur(4px)' : 'none', transition: 'background-color 220ms ease, backdrop-filter 220ms ease' }} />

      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={panelStyle}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <h2 id="edit-account-title" className="text-base font-semibold text-white">
            {get(dictionary, 'edit')}
          </h2>
          <button type="button" onClick={handleClose} aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4" noValidate>
          <input type="hidden" {...register('accountId')} />

          <div>
            <label htmlFor="edit-name" className={labelCls}>{get(dictionary, 'accountName')}</label>
            <input id="edit-name" type="text" autoComplete="off"
              aria-invalid={!!errors.name} className={inputCls} {...register('name')} />
            {errors.name && <p role="alert" className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
          </div>

          {showRate && (
            <div>
              <label htmlFor="edit-rate" className={labelCls}>{get(dictionary, 'interestRate')}</label>
              <FormattedNumericInput id="edit-rate" value={rateHundredths} suffix="%"
                maxValue={MAX_RATE}
                onChange={(v) => { setRateHundredths(v); setValue('interestRateEA', v / 100); }}
                className={`${inputCls} font-mono tabular-nums`} />
            </div>
          )}

          <div>
            <p className={labelCls}>{get(dictionary, 'paymentNetwork')}</p>
            <div className="grid grid-cols-4 gap-2">
              {NETWORKS.map(({ value, labelKey }) => {
                const isSelected = cardNetwork === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCardNetwork(value)}
                    aria-pressed={isSelected}
                    className={`flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-all ${isSelected
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
                );
              })}
            </div>
          </div>

          <CardDesignPicker cardColor={cardColor} onColorChange={setCardColor} dictionary={dictionary} />

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20">
              {get(dictionary, 'cancel')}
            </button>
            <button type="submit" disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              {isSubmitting ? '…' : get(dictionary, 'save')}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
