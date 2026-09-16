'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { depositToInvestment } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';
import { formatMoney, divideCents } from '@/lib/money';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { AccountSelect } from '@/components/transactions/AccountSelect';
import {
  ExchangeRateField,
  InvestmentModalShell,
  getInvestmentFxError,
  modalInputCls,
  modalLabelCls,
  useExchangeRate,
  useInvestmentAccountOptions,
  useInvestmentModalShell,
} from './investment-modal-shared';

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

  const { dialogRef, isVisible, handleClose, handleDialogClose } = useInvestmentModalShell(
    isOpen,
    closeModal
  );

  // Form state - manual since we need custom numeric inputs
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState(0);

  const {
    investmentAccounts,
    bankAccounts,
    loadingAccounts,
    modalSession,
    selectedInvestmentAccount,
    setSelectedInvestmentAccount,
    selectedBankAccount,
    setSelectedBankAccount,
    investmentAccountBriefs,
    bankAccountsNonPocket,
    bankPockets,
    parentNameById,
  } = useInvestmentAccountOptions(isOpen, prefillAccountId);

  const destAccount = investmentAccounts.find((a) => a.id === selectedInvestmentAccount);

  const {
    exchangeRate,
    setExchangeRate,
    rateSource,
    setRateSource,
    fetchingRate,
    refreshExchangeRate,
  } = useExchangeRate(isOpen && destAccount ? destAccount.currency : undefined, isOpen);

  // Reset form state whenever the modal is (re)opened. Deferred via rAF so the
  // setState calls are not synchronous inside the effect.
  useEffect(() => {
    if (!isOpen) return;
    const id = requestAnimationFrame(() => {
      setSubmitError(null);
      setAmountCents(0);
      setExchangeRate(3900);
      setRateSource(null);
    });
    return () => cancelAnimationFrame(id);
  }, [isOpen, setExchangeRate, setRateSource]);

  // Calculated receive amount (Rule 1: Decimal.js)
  const estimatedReceiveCents = exchangeRate > 0 ? divideCents(amountCents, exchangeRate) : 0;

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    if (!selectedInvestmentAccount || !selectedBankAccount) {
      setSubmitError(get(dictionary, 'selectBothAccounts'));
      return;
    }

    if (amountCents <= 0) {
      setSubmitError(get(dictionary, 'amountPositive'));
      return;
    }

    if (exchangeRate <= 0) {
      setSubmitError(get(dictionary, 'ratePositive'));
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
      addNotification('success', get(dictionary, 'depositCompleted'));
      closeModal();
    } else {
      setSubmitError(getInvestmentFxError(result.code, dictionary));
    }
  }

  return (
    <InvestmentModalShell
      dialogRef={dialogRef}
      isVisible={isVisible}
      onClose={handleClose}
      onDialogClose={handleDialogClose}
      titleId="deposit-investment-title"
      title={get(dictionary, 'depositTitle')}
    >
      {loadingAccounts ? (
        <div className="px-6 py-10 text-center text-sm text-slate-400">
          {get(dictionary, 'loadingAccounts')}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4" noValidate>
          {/* Error alert */}
          {submitError && (
            <div
              role="alert"
              className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400"
            >
              {submitError}
            </div>
          )}

          {/* Source bank account (grouped accounts + pockets) */}
          <div>
            <label htmlFor="dep-from" className={modalLabelCls}>
              {get(dictionary, 'fromAccount')}
            </label>
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-slate-500">{get(dictionary, 'noBankAccountsCOP')}</p>
            ) : (
              <AccountSelect
                key={`from-${modalSession}`}
                id="dep-from"
                value={selectedBankAccount}
                onChange={setSelectedBankAccount}
                placeholder={get(dictionary, 'fromAccount')}
                accountsGroupLabel={get(dictionary, 'accountsGroup')}
                pocketsGroupLabel={get(dictionary, 'pocketsGroup')}
                parentNameById={parentNameById}
                accounts={bankAccountsNonPocket}
                pockets={bankPockets}
                showBalance
                locale={locale}
              />
            )}
          </div>

          {/* Destination investment account */}
          <div>
            <label htmlFor="dep-to" className={modalLabelCls}>
              {get(dictionary, 'toAccount')}
            </label>
            <AccountSelect
              key={`to-${modalSession}`}
              id="dep-to"
              value={selectedInvestmentAccount}
              onChange={setSelectedInvestmentAccount}
              placeholder={get(dictionary, 'toAccount')}
              accountsGroupLabel={get(dictionary, 'investmentAccountsGroup')}
              pocketsGroupLabel={get(dictionary, 'investmentAccountsGroup')}
              accounts={investmentAccountBriefs}
              pockets={[]}
              showBalance
              locale={locale}
            />
          </div>

          {/* Amount in COP */}
          <div>
            <label htmlFor="dep-amount" className={modalLabelCls}>
              {get(dictionary, 'amountCOP')}
            </label>
            <FormattedNumericInput
              id="dep-amount"
              value={amountCents}
              onChange={setAmountCents}
              className={`${modalInputCls} font-mono tabular-nums`}
            />
          </div>

          {/* Exchange rate with live FX indicator + refresh */}
          <ExchangeRateField
            id="dep-rate"
            dictionary={dictionary}
            value={exchangeRate}
            onChange={setExchangeRate}
            rateSource={rateSource}
            fetchingRate={fetchingRate}
            canRefresh={!!destAccount}
            onRefresh={() => destAccount && refreshExchangeRate(destAccount.currency)}
          />

          {/* Estimated receive */}
          {destAccount && estimatedReceiveCents > 0 && (
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-3">
              <p className="text-xs text-violet-300 mb-0.5">
                {get(dictionary, 'estimatedReceive')}
              </p>
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
    </InvestmentModalShell>
  );
}
