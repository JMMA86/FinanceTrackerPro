'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw, AlertCircle, Pencil, Undo2 } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { get } from '@/lib/i18n';
import { getInvestmentTransactions } from '@/actions/investment.actions';
import {
  EditInvestmentTradeModal,
  ReverseInvestmentTradeDialog,
  type InvestmentTransactionRow,
} from './EditInvestmentTradeModal';

interface InvestmentTransactionsListProps {
  accountId: string;
  currency: string;
  dictionary: Record<string, unknown>;
  locale?: string;
  /**
   * Active holdings of the account, used to bound the editable quantity of a
   * SELL trade. Optional so the list keeps working without a portfolio context.
   */
  holdings?: ReadonlyArray<{ symbol: string; quantity: number }>;
}

/** Transaction types whose rows expose edit/undo actions. */
function isTradeRow(tx: InvestmentTransactionRow): boolean {
  return tx.type === 'INVESTMENT';
}

/** Only BUY/SELL rows have the structured data required to edit/undo. */
function isStructuredTrade(tx: InvestmentTransactionRow): boolean {
  return tx.assetTradeType === 'BUY' || tx.assetTradeType === 'SELL';
}

/**
 * Upper bound for editing a SELL trade's quantity: the shares still held plus
 * the shares this trade originally sold (so editing it can never oversell).
 */
function getMaxEditableQuantity(
  tx: InvestmentTransactionRow,
  holdings: ReadonlyArray<{ symbol: string; quantity: number }> | undefined
): number | undefined {
  if (tx.assetTradeType !== 'SELL' || !tx.assetSymbol) return undefined;
  const remaining = holdings?.find((h) => h.symbol === tx.assetSymbol)?.quantity ?? 0;
  return remaining + (tx.assetQuantity ?? 0);
}

export function InvestmentTransactionsList({
  accountId,
  currency,
  dictionary,
  locale = 'es-CO',
  holdings,
}: Readonly<InvestmentTransactionsListProps>) {
  const [transactions, setTransactions] = useState<InvestmentTransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Trade currently being edited / reversed (null = dialog closed).
  const [editingTx, setEditingTx] = useState<InvestmentTransactionRow | null>(null);
  const [reversingTx, setReversingTx] = useState<InvestmentTransactionRow | null>(null);

  // Bumped to re-run the loader after an edit/undo (keeps the account view mounted).
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await getInvestmentTransactions({ accountId, page, pageSize: 20 });
        if (cancelled) return;

        if (res.success && res.data) {
          setTransactions(res.data.transactions ?? []);
          setTotalPages(res.data.totalPages ?? 1);
        } else {
          setError(res.error ?? get(dictionary, 'failedToLoadTransactions'));
        }
      } catch {
        if (!cancelled) setError(get(dictionary, 'unexpectedErrorLoading'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // `reloadKey` intentionally retriggers the loader after a mutation.
  }, [accountId, dictionary, page, reloadKey]);

  // Refresh the ledger after an edit/undo without unmounting the account view.
  const refresh = () => setReloadKey((k) => k + 1);

  const getTypeIcon = (tx: InvestmentTransactionRow) => {
    if (tx.assetTradeType === 'BUY') {
      return { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/15' };
    }
    if (tx.assetTradeType === 'SELL') {
      return { icon: ArrowDownRight, color: 'text-emerald-400', bg: 'bg-emerald-500/15' };
    }
    if (tx.type === 'TRANSFER_OUT') {
      // Withdrawal from investment → bank: negative outflow.
      return { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/15' };
    }
    if (tx.type === 'TRANSFER_IN') {
      // Deposit from bank → investment: positive inflow.
      return { icon: ArrowDownRight, color: 'text-emerald-400', bg: 'bg-emerald-500/15' };
    }
    if (tx.type === 'INVESTMENT' && tx.amountCents < 0) {
      return { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/15' };
    }
    if (tx.type === 'INVESTMENT' && tx.amountCents > 0) {
      return { icon: ArrowDownRight, color: 'text-emerald-400', bg: 'bg-emerald-500/15' };
    }
    return { icon: ArrowDownRight, color: 'text-blue-400', bg: 'bg-blue-500/15' };
  };

  const getTypeLabel = (tx: InvestmentTransactionRow): string => {
    if (tx.assetTradeType === 'BUY') return get(dictionary, 'buyLabel');
    if (tx.assetTradeType === 'SELL') return get(dictionary, 'sellLabel');
    if (tx.type === 'TRANSFER_IN') return get(dictionary, 'depositLabel');
    if (tx.type === 'TRANSFER_OUT') return get(dictionary, 'withdrawalLabel');
    if (tx.type === 'INVESTMENT' && tx.amountCents < 0) return get(dictionary, 'buyLabel');
    if (tx.type === 'INVESTMENT' && tx.amountCents > 0) return get(dictionary, 'sellLabel');
    return tx.type;
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="app-shell rounded-2xl py-8 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 text-slate-400 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-shell rounded-2xl py-8 flex items-center justify-center gap-2 text-red-400">
        <AlertCircle className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="app-shell rounded-2xl py-8 text-center">
        <p className="text-sm text-slate-400">{get(dictionary, 'noTransactions')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
        {get(dictionary, 'recentActivity')}
      </p>

      <div className="app-shell rounded-2xl divide-y divide-white/[0.06]">
        {transactions.map((tx) => {
          const { icon: Icon, color, bg } = getTypeIcon(tx);
          const absAmountCents = Math.abs(tx.amountCents);
          const isPositive = tx.amountCents > 0;
          const structuredTrade = isStructuredTrade(tx);
          const showActions = isTradeRow(tx);

          return (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div className={`p-2 rounded-xl ${bg} ${color} flex-shrink-0`}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {tx.description ?? getTypeLabel(tx)}
                </p>

                {structuredTrade && tx.assetSymbol && (
                  <p className="text-xs text-slate-400 truncate tabular-nums">
                    {tx.assetQuantity != null ? `${tx.assetQuantity} ` : ''}
                    {tx.assetSymbol}
                    {tx.assetPricePerShareCents != null
                      ? ` · ${formatMoney(tx.assetPricePerShareCents, currency, locale)}`
                      : ''}
                  </p>
                )}

                <p className="text-xs text-slate-500">
                  {new Date(tx.date).toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p
                  className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}
                >
                  {isPositive ? '+' : '-'}
                  {formatMoney(absAmountCents, currency, locale)}
                </p>
                {tx.originalCurrency && tx.originalAmountCents && (
                  <p className="text-[10px] text-slate-500 tabular-nums">
                    {formatMoney(tx.originalAmountCents, tx.originalCurrency, locale)}
                  </p>
                )}
              </div>

              {showActions && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    disabled={!structuredTrade}
                    title={structuredTrade ? undefined : get(dictionary, 'legacyTradeTooltip')}
                    aria-label={get(dictionary, 'editTradeAction')}
                    onClick={() => {
                      if (structuredTrade) setEditingTx(tx);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    disabled={!structuredTrade}
                    title={structuredTrade ? undefined : get(dictionary, 'legacyTradeTooltip')}
                    aria-label={get(dictionary, 'reverseTradeAction')}
                    onClick={() => {
                      if (structuredTrade) setReversingTx(tx);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            &larr; Prev
          </button>
          <span className="text-xs text-slate-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Edit / undo dialogs (rendered persistently so the shell can animate) */}
      <EditInvestmentTradeModal
        transaction={editingTx}
        dictionary={dictionary}
        locale={locale}
        maxQuantity={editingTx ? getMaxEditableQuantity(editingTx, holdings) : undefined}
        onClose={() => setEditingTx(null)}
        onSuccess={refresh}
      />
      <ReverseInvestmentTradeDialog
        transaction={reversingTx}
        dictionary={dictionary}
        onClose={() => setReversingTx(null)}
        onSuccess={refresh}
      />
    </div>
  );
}
