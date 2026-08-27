/**
 * TransactionList Component
 * Optimized with React.memo and useMemo for large lists
 *
 * Enhanced with premium styling and transitions
 */

'use client';

import { memo, useMemo } from 'react';
import { formatMoney } from '@/lib/money';
import type { Currency } from '@prisma/client';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface Transaction {
  id: string;
  description: string | null;
  amount: number;
  currency: Currency;
  type: string;
  date: Date;
}

interface TransactionListProps {
  transactions: Transaction[];
  emptyMessage?: string;
}

interface TransactionItemProps {
  transaction: Transaction;
}

// Extract single item component for memo optimization
const TransactionItem = memo(
  function TransactionItem({ transaction }: TransactionItemProps) {
    const isIncome = transaction.amount >= 0;
    const formattedAmount = useMemo(
      () => formatMoney(Math.abs(transaction.amount), transaction.currency),
      [transaction.amount, transaction.currency]
    );

    const formattedDate = useMemo(
      () =>
        new Date(transaction.date).toLocaleDateString('es-CO', {
          day: 'numeric',
          month: 'short',
        }),
      [transaction.date]
    );

    return (
      <li className="group flex items-center justify-between py-3 px-2 rounded-xl hover:bg-white/5 transition-all duration-200 -mx-2">
        <div className="flex items-center gap-3">
          <div
            className={`
          p-2 rounded-xl transition-all duration-200
          ${
            isIncome
              ? 'bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20'
              : 'bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20'
          }
        `}
          >
            {isIncome ? (
              <ArrowUpRight className="w-4 h-4" />
            ) : (
              <ArrowDownRight className="w-4 h-4" />
            )}
          </div>
          <div>
            <p className="text-white text-sm font-medium group-hover:text-blue-200 transition-colors">
              {transaction.description || transaction.type}
            </p>
            <p className="text-slate-500 text-xs">{formattedDate}</p>
          </div>
        </div>
        <span
          className={`
        text-sm font-semibold tabular-nums
        ${isIncome ? 'text-emerald-400' : 'text-rose-400'}
      `}
        >
          {isIncome ? '+' : '-'}
          {formattedAmount}
        </span>
      </li>
    );
  },
  (prev, next) => {
    // Custom comparison for deeper optimization
    return (
      prev.transaction.id === next.transaction.id &&
      prev.transaction.amount === next.transaction.amount &&
      prev.transaction.description === next.transaction.description &&
      prev.transaction.date.getTime() === next.transaction.date.getTime()
    );
  }
);

TransactionItem.displayName = 'TransactionItem';

// Main list component with memo
export const TransactionList = memo(
  function TransactionList({
    transactions,
    emptyMessage = 'No transactions yet',
  }: TransactionListProps) {
    const sortedTransactions = useMemo(
      () =>
        [...transactions]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 8), // Show only 8 most recent
      [transactions]
    );

    if (transactions.length === 0) {
      return <p className="text-slate-400">{emptyMessage}</p>;
    }

    return (
      <ul className="divide-y divide-white/5">
        {sortedTransactions.map((tx) => (
          <TransactionItem key={tx.id} transaction={tx} />
        ))}
      </ul>
    );
  },
  (prevProps, nextProps) => {
    // Shallow comparison - if same array reference, don't re-render
    return prevProps.transactions === nextProps.transactions;
  }
);

TransactionList.displayName = 'TransactionList';

export type { TransactionListProps, Transaction };
