'use client';

import { useEffect, useRef, useState } from 'react';
import { X, ArrowRight } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { depositToInvestment, getInvestmentAccounts } from '@/actions/investment.actions';
import { getBankAccounts } from '@/actions/account.actions';
import type { AccountCardData } from '@/components/accounts/AccountCard';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import type { InvestmentAccountSummary } from './InvestmentAccountCard';

interface DepositModalProps {
  dictionary: Record<string, unknown>;
  locale?: string;
}

export function DepositModal({ dictionary, locale = 'es-CO' }: Readonly<DepositModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'deposit-investment';
  const prefillAccountId = modalData?.accountId as string | undefined;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [investmentAccounts, setInvestmentAccounts] = useState<InvestmentAccountSummary[]>([]);
  const [bankAccounts, setBankAccounts] = useState<AccountCardData[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  // Form state - manual since we need custom numeric inputs
  const [amountCents, setAmountCents] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(3900);
  const [selectedInvestmentAccount, setSelectedInvestmentAccount] = useState('');
  const [selectedBankAccount, setSelectedBankAccount] = useState('');

  // Calculated receive amount
  const estimatedReceiveCents = exchangeRate > 0 ? Math.round(amountCents / exchangeRate) : 0;

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

    let cancelled = false;

    const id = requestAnimationFrame(() => {
      setSubmitError(null);
      setAmountCents(0);
      setExchangeRate(3900);
      setIsVisible(true);
    });

    async function load() {
      setLoadingAccounts(true);
      try {
        const [invRes, bankRes] = await Promise.all([
          getInvestmentAccounts({} as Record<string, never>),
          getBankAccounts({} as Record<string, never>),
        ]);

        if (cancelled) return;

        if (invRes.success && invRes.data) {
          const accounts = invRes.data as InvestmentAccountSummary[];
          setInvestmentAccounts(accounts);
          if (prefillAccountId && accounts.some((a) => a.id === prefillAccountId)) {
            setSelectedInvestmentAccount(prefillAccountId);
          } else if (accounts.length > 0) {
            setSelectedInvestmentAccount(accounts[0].id);
          }
        }

        if (bankRes.success && bankRes.data) {
          const banks = (bankRes.data as AccountCardData[]).filter(
            (a) => a.currency === 'COP' && ['CHECKING', 'CASH', 'SAVINGS'].includes(a.type)
          );
          setBankAccounts(banks);
          if (banks.length > 0) {
            setSelectedBankAccount(banks[0].id);
          }
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoadingAccounts(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [isOpen, prefillAccountId]);

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

  const destAccount = investmentAccounts.find((a) => a.id === selectedInvestmentAccount);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedInvestmentAccount || !selectedBankAccount) {
      setSubmitError('Please select both source and destination accounts.');
      return;
    }

    if (amountCents <= 0) {
      setSubmitError('Amount must be greater than 0.');
      return;
    }

    if (exchangeRate <= 0) {
      setSubmitError('Exchange rate must be positive.');
      return;
    }

    const result = await depositToInvestment({
      idempotencyKey: crypto.randomUUID(),
      investmentAccountId: selectedInvestmentAccount,
      fromBankAccountId: selectedBankAccount,
      amountCents,
      exchangeRate,
    });

    if (result.success) {
      addNotification('success', 'Deposit completed successfully');
      closeModal();
    } else {
      const msg = result.code === 'SESSION_INVALID'
        ? get(dictionary, 'errors.sessionInvalid')
        : get(dictionary, 'errors.depositFailed');
      setSubmitError(msg);
    }
  }

  const inputCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all';
  const selectCls = 'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-violet-500/60 focus:border-transparent transition-all appearance-none';
  const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="deposit-investment-title"
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
          <h2 id="deposit-investment-title" className="text-base font-semibold text-white">
            {get(dictionary, 'depositTitle')}
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

        {loadingAccounts ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">Loading accounts...</div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" noValidate>
            {/* Error alert */}
            {submitError && (
              <div role="alert" className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
                {submitError}
              </div>
            )}

            {/* Source bank account */}
            <div>
              <label htmlFor="dep-from" className={labelCls}>{get(dictionary, 'fromAccount')}</label>
              {bankAccounts.length === 0 ? (
                <p className="text-sm text-slate-500">No bank accounts available in COP.</p>
              ) : (
                <select
                  id="dep-from"
                  value={selectedBankAccount}
                  onChange={(e) => setSelectedBankAccount(e.target.value)}
                  className={selectCls}
                >
                  {bankAccounts.map((a) => (
                    <option key={a.id} value={a.id} className="bg-slate-800">
                      {a.name} — {formatMoney(a.balanceCents, a.currency, locale)}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Destination investment account */}
            <div>
              <label htmlFor="dep-to" className={labelCls}>{get(dictionary, 'toAccount')}</label>
              <select
                id="dep-to"
                value={selectedInvestmentAccount}
                onChange={(e) => setSelectedInvestmentAccount(e.target.value)}
                className={selectCls}
              >
                {investmentAccounts.map((a) => (
                  <option key={a.id} value={a.id} className="bg-slate-800">
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>

            {/* Amount in COP */}
            <div>
              <label htmlFor="dep-amount" className={labelCls}>{get(dictionary, 'amountCOP')}</label>
              <FormattedNumericInput
                id="dep-amount"
                value={amountCents}
                onChange={setAmountCents}
                className={`${inputCls} font-mono tabular-nums`}
              />
            </div>

            {/* Exchange rate */}
            <div>
              <label htmlFor="dep-rate" className={labelCls}>{get(dictionary, 'exchangeRate')}</label>
              <input
                id="dep-rate"
                type="number"
                inputMode="decimal"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(Number(e.target.value))}
                placeholder="3900"
                aria-describedby="dep-rate-hint"
                className={`${inputCls} font-mono tabular-nums`}
              />
              <p id="dep-rate-hint" className="mt-1 text-xs text-slate-500">{get(dictionary, 'exchangeRateHint')}</p>
            </div>

            {/* Estimated receive */}
            {destAccount && estimatedReceiveCents > 0 && (
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
                <p className="text-xs text-violet-300 mb-0.5">{get(dictionary, 'estimatedReceive')}</p>
                <p className="text-lg font-bold text-white tabular-nums">
                  {formatMoney(estimatedReceiveCents, destAccount.currency, locale)}
                </p>
              </div>
            )}

            {/* Actions */}
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
                disabled={bankAccounts.length === 0 || investmentAccounts.length === 0}
                className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
              >
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
                {get(dictionary, 'deposit')}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  );
}
