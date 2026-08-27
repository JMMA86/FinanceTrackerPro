'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, RefreshCw, AlertCircle } from 'lucide-react';
import { formatMoney } from '@/lib/money';
import { get } from '@/lib/i18n';
import { getInvestmentTransactions } from '@/actions/investment.actions';

interface Transaction {
  id: string;
  type: string;
  amountCents: number;
  currency: string;
  description: string | null;
  date: Date | string;
  transferId?: string | null;
  originalAmountCents?: number | null;
  originalCurrency?: string | null;
}

interface InvestmentTransactionsListProps {
  accountId: string;
  currency: string;
  dictionary: Record<string, unknown>;
  locale?: string;
}

export function InvestmentTransactionsList({
  accountId,
  currency,
  dictionary,
  locale = 'es-CO',
}: Readonly<InvestmentTransactionsListProps>) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

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
          setError(res.error ?? 'Failed to load transactions');
        }
      } catch {
        if (!cancelled) setError('Unexpected error loading transactions');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, page]);

  const getTypeIcon = (type: string, amountCents: number) => {
    if (type === 'INVESTMENT' && amountCents < 0) {
      return { icon: ArrowUpRight, color: 'text-red-400', bg: 'bg-red-500/15' };
    }
    if (type === 'INVESTMENT' && amountCents > 0) {
      return { icon: ArrowDownRight, color: 'text-emerald-400', bg: 'bg-emerald-500/15' };
    }
    return { icon: ArrowDownRight, color: 'text-blue-400', bg: 'bg-blue-500/15' };
  };

  const getTypeLabel = (tx: Transaction): string => {
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
          const { icon: Icon, color, bg } = getTypeIcon(tx.type, tx.amountCents);
          const absAmountCents = Math.abs(tx.amountCents);
          const isPositive = tx.amountCents > 0;

          return (
            <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
              <div className={`p-2 rounded-xl ${bg} ${color} flex-shrink-0`}>
                <Icon className="w-4 h-4" aria-hidden="true" />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {tx.description ?? getTypeLabel(tx)}
                </p>
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
    </div>
  );
}
