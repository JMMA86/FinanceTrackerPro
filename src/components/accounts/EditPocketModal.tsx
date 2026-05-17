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
import type { AccountCardData } from './AccountCard';

const MAX_RATE = 10_000;

function toRateHundredths(rate: number | null | undefined): number {
  return rate == null ? 0 : Math.round(Number(rate) * 100);
}

interface EditPocketModalProps {
  pockets: AccountCardData[];
  dictionary: Record<string, unknown>;
}

export function EditPocketModal({ pockets, dictionary }: Readonly<EditPocketModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'edit-pocket';
  const pocketId = (modalData?.pocketId as string) ?? null;
  const pocket = pockets.find((p) => p.id === pocketId) ?? null;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [rateHundredths, setRateHundredths] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UpdateAccountInput>({
    resolver: zodResolver(UpdateAccountSchema) as Resolver<UpdateAccountInput>,
    defaultValues: { accountId: pocketId ?? '', name: pocket?.name ?? '', interestRateEA: 0 },
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
    if (!isOpen || !pocket) return;
    log.info({ action: 'pocket.edit.open', pocketId: pocket.id }, 'Edit pocket modal opened');
    const rate = toRateHundredths(pocket.interestRateEA);
    reset({ accountId: pocket.id, name: pocket.name, interestRateEA: rate / 100 });
    const id = requestAnimationFrame(() => {
      setRateHundredths(rate);
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, pocket, reset]);

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
    log.info({ action: 'pocket.update.submit', pocketId: data.accountId }, 'Pocket update submit');
    const result = await updateBankAccount(data);
    if (result.success) {
      const newName = data.name ?? pocket?.name;
      document.dispatchEvent(new CustomEvent('finance:account-updated', {
        detail: { accountId: pocket?.id, cardColor: pocket?.cardColor, name: newName, interestRateEA: data.interestRateEA },
      }));
      log.info({ action: 'pocket.update.success', pocketId: pocket?.id }, 'Pocket updated (client)');
      addNotification('success', get(dictionary, 'updateSuccess'));
      closeModal();
    } else {
      log.info({ action: 'pocket.update.failure', pocketId: data.accountId, code: result.code }, 'Pocket update failed (client)');
      addNotification('error', get(dictionary, 'errors.updateFailed'));
    }
  }

  if (!pocket) return null;

  const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)';
  const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const panelStyle: React.CSSProperties = {
    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.93) translateY(12px)',
    opacity: isVisible ? 1 : 0,
    transition: isVisible
      ? `transform 280ms ${SPRING}, opacity 200ms ${EASE}`
      : `transform 200ms ${EASE}, opacity 180ms ${EASE}`,
  };

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <dialog ref={dialogRef} onClose={handleDialogClose} aria-labelledby="edit-pocket-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4">
      <button type="button" aria-label="Close" onClick={handleClose}
        className="fixed inset-0"
        style={{ backgroundColor: isVisible ? 'rgba(0,0,0,0.60)' : 'rgba(0,0,0,0)', backdropFilter: isVisible ? 'blur(4px)' : 'none', transition: 'background-color 220ms ease, backdrop-filter 220ms ease' }} />

      <div className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        style={panelStyle}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <div className="flex items-center gap-2">
            <h2 id="edit-pocket-title" className="text-base font-semibold text-white">
              {get(dictionary, 'edit')}
            </h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">
              {get(dictionary, 'pocket')}
            </span>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-5 space-y-4" noValidate>
          <input type="hidden" {...register('accountId')} />

          <div>
            <label htmlFor="edit-pocket-name" className={labelCls}>{get(dictionary, 'accountName')}</label>
            <input id="edit-pocket-name" type="text" autoComplete="off"
              aria-invalid={!!errors.name} className={inputCls} {...register('name')} />
            {errors.name && <p role="alert" className="mt-1 text-xs text-red-400">{errors.name.message}</p>}
          </div>

          <div>
            <label htmlFor="edit-pocket-rate" className={labelCls}>{get(dictionary, 'interestRatePocket')}</label>
            <FormattedNumericInput id="edit-pocket-rate" value={rateHundredths} suffix="%"
              maxValue={MAX_RATE}
              onChange={(v) => { setRateHundredths(v); setValue('interestRateEA', v / 100); }}
              className={`${inputCls} font-mono tabular-nums`} />
          </div>

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
