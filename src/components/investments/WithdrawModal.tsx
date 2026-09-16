'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { withdrawFromInvestment } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';
import { formatMoney, multiplyCents } from '@/lib/money';
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

interface WithdrawModalProps {
  dictionary: Record<string, unknown>;
  locale?: string;
}

export function WithdrawModal({ dictionary, locale = 'es-CO' }: Readonly<WithdrawModalProps>) {
  const activeModal = useUIStore((s) => s.activeModal);
  const modalData = useUIStore((s) => s.modalData);
  const closeModal = useUIStore((s) => s.closeModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const isOpen = activeModal === 'withdraw-investment';
  const prefillAccountId = modalData?.accountId as string | undefined;

  const { dialogRef, isVisible, handleClose, handleDialogClose } = useInvestmentModalShell(
    isOpen,
    closeModal
  );

  // Form state
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

  const sourceAccount = investmentAccounts.find((a) => a.id === selectedInvestmentAccount);

  const {
    exchangeRate,
    setExchangeRate,
    rateSource,
    setRateSource,
    fetchingRate,
    refreshExchangeRate,
  } = useExchangeRate(isOpen && sourceAccount ? sourceAccount.currency : undefined, isOpen);

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

  // Estimated receive in COP: foreign cents × COP-per-foreign rate (Rule 1).
  const estimatedCopCents =
    amountCents > 0 && exchangeRate > 0 ? multiplyCents(amountCents, exchangeRate) : 0;

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

    const result = await withdrawFromInvestment({
      idempotencyKey: crypto.randomUUID(),
      investmentAccountId: selectedInvestmentAccount,
      toBankAccountId: selectedBankAccount,
      amountCents,
      exchangeRate,
    });

    if (result.success) {
      addNotification('success', get(dictionary, 'withdraw'));
      closeModal();
    } else {
      setSubmitError(getInvestmentFxError(result.code, dictionary, 'errors.withdrawFailed'));
    }
  }

  return (
    <InvestmentModalShell
      dialogRef={dialogRef}
      isVisible={isVisible}
      onClose={handleClose}
      onDialogClose={handleDialogClose}
      titleId="withdraw-investment-title"
      title={get(dictionary, 'withdrawTitle')}
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

          {/* Source investment account */}
          <div>
            <label htmlFor="wd-from" className={modalLabelCls}>
              {get(dictionary, 'toAccount')}
            </label>
            <AccountSelect
              key={`wd-from-${modalSession}`}
              id="wd-from"
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

          {/* Destination bank/pocket COP account */}
          <div>
            <label htmlFor="wd-to" className={modalLabelCls}>
              {get(dictionary, 'fromAccount')}
            </label>
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-slate-500">{get(dictionary, 'noBankAccountsCOP')}</p>
            ) : (
              <AccountSelect
                key={`wd-to-${modalSession}`}
                id="wd-to"
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

          {/* Amount in investment currency */}
          <div>
            <label htmlFor="wd-amount" className={modalLabelCls}>
              {get(dictionary, 'withdrawAmount')}{' '}
              {sourceAccount && (
                <span className="text-slate-500 font-normal lowercase ml-1">
                  ({sourceAccount.currency})
                </span>
              )}
            </label>
            <FormattedNumericInput
              id="wd-amount"
              value={amountCents}
              onChange={setAmountCents}
              maxValue={sourceAccount?.balanceCents ?? 9_999_999_999_999}
              className={`${modalInputCls} font-mono tabular-nums`}
            />
            {sourceAccount && (
              <p className="mt-1 text-xs text-slate-400">
                {get(dictionary, 'availableBalance')}:{' '}
                <span className="font-semibold text-emerald-400 tabular-nums">
                  {formatMoney(sourceAccount.balanceCents, sourceAccount.currency, locale)}
                </span>
              </p>
            )}
          </div>

          {/* Exchange rate with live FX indicator + refresh */}
          <ExchangeRateField
            id="wd-rate"
            dictionary={dictionary}
            value={exchangeRate}
            onChange={setExchangeRate}
            rateSource={rateSource}
            fetchingRate={fetchingRate}
            canRefresh={!!sourceAccount}
            onRefresh={() => sourceAccount && refreshExchangeRate(sourceAccount.currency)}
          />

          {/* Estimated receive in COP */}
          {sourceAccount && estimatedCopCents > 0 && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
              <p className="text-xs text-emerald-300 mb-0.5">
                {get(dictionary, 'estimatedReceiveCOP')}
              </p>
              <p className="text-lg font-bold text-white tabular-nums">
                {formatMoney(estimatedCopCents, 'COP', locale)}
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
              className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" aria-hidden="true" />
              {get(dictionary, 'withdraw')}
            </button>
          </div>
        </form>
      )}
    </InvestmentModalShell>
  );
}
