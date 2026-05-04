/**
 * TransactionList Component
 * Optimized with React.memo and useMemo for large lists
 */

'use client';

import { memo, useMemo } from 'react';
import { formatMoney } from '@/lib/money';
import type { Currency } from '@prisma/client';

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
const TransactionItem = memo(function TransactionItem({ transaction }: TransactionItemProps) {
  const isIncome = transaction.amount >= 0;
  const formattedAmount = useMemo(
    () => formatMoney(Math.abs(transaction.amount), transaction.currency),
    [transaction.amount, transaction.currency]
  );

  const formattedDate = useMemo(
    () => new Date(transaction.date).toLocaleDateString(),
    [transaction.date]
  );

  return (
    <li className="flex items-center justify-between py-2 border-b border-gray-700/50">
      <div>
        <p className="text-white text-sm">{transaction.description || transaction.type}</p>
        <p className="text-gray-500 text-xs">{formattedDate}</p>
      </div>
      <span className={`text-sm font-medium ${isIncome ? 'text-green-400' : 'text-red-400'}`}>
        {isIncome ? '+' : ''}{formattedAmount}
      </span>
    </li>
  );
}, (prev, next) => {
  // Custom comparison for deeper optimization
  return (
    prev.transaction.id === next.transaction.id &&
    prev.transaction.amount === next.transaction.amount &&
    prev.transaction.description === next.transaction.description &&
    prev.transaction.date.getTime() === next.transaction.date.getTime()
  );
});

TransactionItem.displayName = 'TransactionItem';

// Main list component with memo
export const TransactionList = memo(function TransactionList({
  transactions,
  emptyMessage = 'No transactions yet',
}: TransactionListProps) {
  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => 
      new Date(b.date).getTime() - new Date(a.date).getTime()
    ),
    [transactions]
  );

  if (transactions.length === 0) {
    return (
      <p className="text-gray-400">{emptyMessage}</p>
    );
  }

  return (
    <ul className="space-y-3">
      {sortedTransactions.map((tx) => (
        <TransactionItem key={tx.id} transaction={tx} />
      ))}
    </ul>
  );
}, (prevProps, nextProps) => {
  // Shallow comparison - if same array reference, don't re-render
  return prevProps.transactions === nextProps.transactions;
});

TransactionList.displayName = 'TransactionList';

export type { TransactionListProps, Transaction };