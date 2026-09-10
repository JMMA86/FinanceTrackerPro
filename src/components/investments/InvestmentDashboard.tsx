'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  Plus,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  TrendingUp,
  Landmark,
  Loader2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Decimal } from 'decimal.js';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';
import { addCents, formatMoney, multiplyCents, subtractCents } from '@/lib/money';
import { updateAllAssetPrices } from '@/actions/investment.actions';
import type { InvestmentHoldingSummary } from '@/types/investments';
import { InvestmentAccountCard } from './InvestmentAccountCard';
import type { InvestmentAccountSummary } from './InvestmentAccountCard';
import { PortfolioHoldingsTable } from './PortfolioHoldingsTable';
import { PortfolioPerformanceChart } from './PortfolioPerformanceChart';
import { InvestmentTransactionsList } from './InvestmentTransactionsList';
import { CreateInvestmentModal } from './CreateInvestmentModal';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { AssetSearchModal } from './AssetSearchModal';
import { SellAssetModal } from './SellAssetModal';

interface InvestmentDashboardProps {
  accounts: InvestmentAccountSummary[];
  dictionary: Record<string, unknown>;
  locale?: string;
}

interface CurrencyBucket {
  currency: string;
  investedCents: number;
  marketValueCents: number;
  returnCents: number;
  returnPct: number;
}

export function InvestmentDashboard({
  accounts,
  dictionary,
  locale = 'es-CO',
}: Readonly<InvestmentDashboardProps>) {
  const router = useRouter();
  const openModal = useUIStore((s) => s.openModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [sellHolding, setSellHolding] = useState<InvestmentHoldingSummary | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId) ?? null,
    [accounts, selectedAccountId]
  );

  const holdings = useMemo(() => selectedAccount?.assetHoldings ?? [], [selectedAccount]);

  // Summary calculations — per-currency buckets so the cards never fall back to
  // a "Múltiples monedas" label. For every currency the identity holds:
  //   Rendimiento = Valor de Mercado − Total Invertido
  // Total Invertido = cost basis of open positions (avg cost × quantity).
  const currencyBuckets = useMemo<CurrencyBucket[]>(() => {
    const map = new Map<
      string,
      { currency: string; investedCents: number; marketValueCents: number }
    >();
    // Initialize a bucket for each present currency (even without positions).
    for (const a of accounts) {
      if (!map.has(a.currency)) {
        map.set(a.currency, { currency: a.currency, investedCents: 0, marketValueCents: 0 });
      }
    }
    // Accumulate cost basis and market value from the positions.
    for (const a of accounts) {
      const b = map.get(a.currency);
      if (!b) continue;
      for (const h of a.assetHoldings ?? []) {
        b.investedCents = addCents(b.investedCents, multiplyCents(h.avgCostCents, h.quantity));
        b.marketValueCents = addCents(
          b.marketValueCents,
          multiplyCents(h.currentPriceCents, h.quantity)
        );
      }
    }
    return Array.from(map.values()).map((b) => {
      const returnCents = subtractCents(b.marketValueCents, b.investedCents);
      const returnPct =
        b.investedCents > 0
          ? new Decimal(returnCents).dividedBy(b.investedCents).times(100).toNumber()
          : 0;
      return { ...b, returnCents, returnPct };
    });
  }, [accounts]);

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
        addNotification(
          'success',
          res.data?.updated
            ? get(dictionary, 'pricesUpdated').replace('{count}', String(res.data.updated))
            : get(dictionary, 'noHoldingsToUpdate')
        );
        router.refresh();
      } else {
        addNotification('error', res.error ?? get(dictionary, 'pricesUpdateFailed'));
      }
    } catch {
      addNotification('error', get(dictionary, 'pricesUpdateFailed'));
    } finally {
      setUpdatingPrices(false);
    }
  }, [addNotification, dictionary, router]);

  const handleSell = useCallback(
    (holding: InvestmentHoldingSummary) => {
      setSellHolding(holding);
      openModal('sell-asset');
    },
    [openModal]
  );

  // Currency for selected account display
  const selectedCurrency = selectedAccount?.currency ?? 'USD';

  // Summary card rendering helpers
  const isMulti = currencyBuckets.length > 1;
  const valueTextClass = isMulti ? 'text-lg' : 'text-xl';
  // Decorative glow for the performance card: emerald when every currency is
  // positive, red when every currency is negative, neutral when mixed.
  const allPositive =
    currencyBuckets.length > 0 && currencyBuckets.every((b) => b.returnCents >= 0);
  const allNegative = currencyBuckets.length > 0 && currencyBuckets.every((b) => b.returnCents < 0);
  let glowClass = 'bg-indigo-500/15';
  if (allPositive) {
    glowClass = 'bg-emerald-500/15';
  } else if (allNegative) {
    glowClass = 'bg-red-500/15';
  }

  return (
    <div className="space-y-6">
      {/* Editorial header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-violet-500/30 to-indigo-500/10 text-violet-300 ring-1 ring-white/10 shadow-lg shadow-violet-950/30">
            <TrendingUp className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {get(dictionary, 'title')}
            </h1>
            <p className="mt-1 text-sm text-slate-400">{get(dictionary, 'titleSubtitle')}</p>
          </div>
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
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 shadow-lg shadow-violet-950/30"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'addAccount')}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {accounts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="app-shell rounded-2xl p-5 relative overflow-hidden h-full">
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-violet-500/15 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {get(dictionary, 'totalInvested')}
              </p>
              {currencyBuckets.length === 0 ? (
                <p className={`${valueTextClass} font-bold text-white tabular-nums`}>
                  {formatMoney(0, 'USD', locale)}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {currencyBuckets.map((b) => (
                    <p
                      key={b.currency}
                      className={`${valueTextClass} font-bold text-white tabular-nums`}
                    >
                      {formatMoney(b.investedCents, b.currency, locale)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="app-shell rounded-2xl p-5 relative overflow-hidden h-full">
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-emerald-500/10 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {get(dictionary, 'totalMarketValue')}
              </p>
              {currencyBuckets.length === 0 ? (
                <p className={`${valueTextClass} font-bold text-white tabular-nums`}>
                  {formatMoney(0, 'USD', locale)}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {currencyBuckets.map((b) => (
                    <p
                      key={b.currency}
                      className={`${valueTextClass} font-bold text-white tabular-nums`}
                    >
                      {formatMoney(b.marketValueCents, b.currency, locale)}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="app-shell rounded-2xl p-5 relative overflow-hidden h-full">
            <div
              className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-indigo-500/10 blur-2xl"
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {get(dictionary, 'holdings')}
              </p>
              <p className="text-xl font-bold text-white tabular-nums">
                {totalHoldings}{' '}
                {totalHoldings === 1 ? get(dictionary, 'position') : get(dictionary, 'positions')}
              </p>
            </div>
          </div>

          {/* Performance card — one line per currency, sign-colored */}
          <div className="app-shell rounded-2xl p-5 relative overflow-hidden h-full">
            <div
              className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl ${glowClass}`}
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                {get(dictionary, 'performance')}
              </p>
              {currencyBuckets.length === 0 ? (
                <p className={`${valueTextClass} font-bold text-white tabular-nums`}>
                  {formatMoney(0, 'USD', locale)}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {currencyBuckets.map((b) => {
                    const positive = b.returnCents >= 0;
                    return (
                      <p
                        key={b.currency}
                        className={`${valueTextClass} font-bold tabular-nums ${
                          positive ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {positive ? '+' : ''}
                        {formatMoney(b.returnCents, b.currency, locale)}
                        <span className="text-xs font-semibold ml-1 opacity-80">
                          ({positive ? '+' : ''}
                          {b.returnPct.toFixed(2)}%)
                        </span>
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
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
            <div key={selectedAccount.id} className="space-y-6 animate-fadeIn">
              {/* Action buttons for selected account */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openModal('buy-asset')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 shadow-lg shadow-emerald-950/30"
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
                <button
                  type="button"
                  onClick={() =>
                    openModal('withdraw-investment', { accountId: selectedAccount.id })
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-sm font-semibold text-slate-300 hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
                  {get(dictionary, 'withdraw')}
                </button>
              </div>

              {/* Portfolio performance chart */}
              <PortfolioPerformanceChart
                accountId={selectedAccount.id}
                dictionary={dictionary}
                locale={locale}
              />

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
      <WithdrawModal dictionary={dictionary} locale={locale} />
      <AssetSearchModal account={selectedAccount} dictionary={dictionary} locale={locale} />
      <SellAssetModal
        holding={sellHolding}
        currency={selectedCurrency}
        dictionary={dictionary}
        locale={locale}
      />
    </div>
  );
}
