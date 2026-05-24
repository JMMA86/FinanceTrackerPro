'use client';

import { useState, useCallback, useMemo } from 'react';
import { Plus, ArrowDownRight, RefreshCw, TrendingUp, Landmark, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import { updateAllAssetPrices } from '@/actions/investment.actions';
import { InvestmentAccountCard } from './InvestmentAccountCard';
import type { InvestmentAccountSummary } from './InvestmentAccountCard';
import { PortfolioHoldingsTable } from './PortfolioHoldingsTable';
import { InvestmentTransactionsList } from './InvestmentTransactionsList';
import { CreateInvestmentModal } from './CreateInvestmentModal';
import { DepositModal } from './DepositModal';
import { AssetSearchModal } from './AssetSearchModal';
import { SellAssetModal } from './SellAssetModal';

interface Holding {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCostCents: number;
  currentPriceCents: number;
  currency: string;
}

interface InvestmentDashboardProps {
  accounts: Array<Record<string, unknown>>;
  dictionary: Record<string, unknown>;
  locale?: string;
}

export function InvestmentDashboard({
  accounts: rawAccounts,
  dictionary,
  locale = 'es-CO',
}: Readonly<InvestmentDashboardProps>) {
  const router = useRouter();
  const openModal = useUIStore((s) => s.openModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [sellHolding, setSellHolding] = useState<Holding | null>(null);

  // Parse accounts from raw data
  const accounts = useMemo(
    () => rawAccounts as unknown as InvestmentAccountSummary[],
    [rawAccounts]
  );

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const holdings = useMemo(
    () => (selectedAccount?.assetHoldings ?? []) as Holding[],
    [selectedAccount]
  );

  // Summary calculations
  const totalBalanceCents = useMemo(
    () => accounts.reduce((sum, a) => sum + a.balanceCents, 0),
    [accounts]
  );

  const totalMarketValueCents = useMemo(
    () => accounts.reduce((sum, a) => {
      const holdings = (a.assetHoldings ?? []) as Array<{
        quantity: number;
        currentPriceCents: number;
      }>;
      return sum + holdings.reduce((hSum, h) => hSum + Math.round(h.quantity * h.currentPriceCents), 0);
    }, 0),
    [accounts]
  );

  const totalHoldings = useMemo(
    () => accounts.reduce((sum, a) => sum + (a.assetHoldings?.length ?? 0), 0),
    [accounts]
  );

  const handleSelectAccount = useCallback((id: string) => {
    setSelectedAccountId((prev) => (prev === id ? null : id));
  }, []);

  const handleUpdatePrices = useCallback(async () => {
    setUpdatingPrices(true);
    try {
      const res = await updateAllAssetPrices({} as Record<string, never>);
      if (res.success) {
        addNotification('success', res.data?.updated
          ? `Updated ${res.data.updated} price(s)`
          : 'No holdings to update');
        router.refresh();
      } else {
        addNotification('error', res.error ?? 'Failed to update prices');
      }
    } catch {
      addNotification('error', 'Failed to update prices');
    } finally {
      setUpdatingPrices(false);
    }
  }, [addNotification, router]);

  const handleSell = useCallback((holding: Holding) => {
    setSellHolding(holding);
    openModal('sell-asset');
  }, [openModal]);

  // Currency for selected account display
  const selectedCurrency = selectedAccount?.currency ?? 'USD';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400">
            <TrendingUp className="w-5 h-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold text-white">{get(dictionary, 'title')}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUpdatePrices}
            disabled={updatingPrices || totalHoldings === 0}
            aria-label={get(dictionary, 'updatePrices')}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-slate-300 hover:bg-white/5 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            {updatingPrices ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            )}
            {updatingPrices ? get(dictionary, 'updatingPrices') : get(dictionary, 'updatePrices')}
          </button>

          <button
            type="button"
            onClick={() => openModal('deposit-investment')}
            disabled={accounts.length === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'deposit')}
          </button>

          <button
            type="button"
            onClick={() => openModal('create-investment')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'addAccount')}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {(() => {
            const currencies = [...new Set(accounts.map((a) => a.currency))];
            const isMixed = currencies.length > 1;
            const displayCurrency = isMixed ? null : currencies[0];
            return (
              <>
                <div className="app-shell rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {get(dictionary, 'totalInvested')}
                  </p>
                  <p className="text-xl font-bold text-white tabular-nums">
                    {isMixed
                      ? get(dictionary, 'mixedCurrencies')
                      : formatMoney(totalBalanceCents, displayCurrency!, locale)}
                  </p>
                </div>
                <div className="app-shell rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {get(dictionary, 'totalMarketValue')}
                  </p>
                  <p className="text-xl font-bold text-white tabular-nums">
                    {isMixed
                      ? get(dictionary, 'mixedCurrencies')
                      : formatMoney(totalMarketValueCents, displayCurrency!, locale)}
                  </p>
                </div>
                <div className="app-shell rounded-2xl p-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {get(dictionary, 'holdings')}
                  </p>
                  <p className="text-xl font-bold text-white tabular-nums">
                    {totalHoldings} {totalHoldings === 1
                      ? get(dictionary, 'position')
                      : get(dictionary, 'positions')}
                  </p>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Empty state */}
      {accounts.length === 0 ? (
        <div className="app-shell rounded-2xl py-16 flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-2xl bg-violet-500/10 text-violet-400">
            <Landmark className="w-8 h-8" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white mb-1">{get(dictionary, 'noAccounts')}</p>
            <p className="text-xs text-slate-400 max-w-sm">{get(dictionary, 'noAccountsDesc')}</p>
          </div>
          <button
            type="button"
            onClick={() => openModal('create-investment')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'addAccount')}
          </button>
        </div>
      ) : (
        <>
          {/* Account cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {accounts.map((account) => (
              <InvestmentAccountCard
                key={account.id}
                account={account}
                isSelected={selectedAccountId === account.id}
                dictionary={dictionary}
                locale={locale}
                onSelect={handleSelectAccount}
              />
            ))}
          </div>

          {/* Selected account detail */}
          {selectedAccount && (
            <div className="space-y-6 animate-fadeIn">
              {/* Action buttons for selected account */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => openModal('buy-asset')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'buyAsset')}
                </button>
                <button
                  type="button"
                  onClick={() => openModal('deposit-investment', { accountId: selectedAccount.id })}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <ArrowDownRight className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'deposit')}
                </button>
              </div>

              {/* Portfolio Holdings Table */}
              <PortfolioHoldingsTable
                holdings={holdings}
                currency={selectedCurrency}
                dictionary={dictionary}
                locale={locale}
                onSell={handleSell}
              />

              {/* Transactions */}
              <InvestmentTransactionsList
                key={selectedAccount.id}
                accountId={selectedAccount.id}
                currency={selectedCurrency}
                dictionary={dictionary}
                locale={locale}
              />
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <CreateInvestmentModal dictionary={dictionary} />
      <DepositModal dictionary={dictionary} locale={locale} />
      <AssetSearchModal
        account={selectedAccount}
        dictionary={dictionary}
        locale={locale}
      />
      <SellAssetModal
        holding={sellHolding}
        currency={selectedCurrency}
        dictionary={dictionary}
        locale={locale}
      />
    </div>
  );
}
