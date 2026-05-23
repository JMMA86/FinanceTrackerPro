'use client';

import { memo, useMemo, useCallback } from 'react';
import { formatMoney } from '@/lib/money';
import { ArrowUpRight, ArrowDownRight, ArrowLeftRight, TrendingUp, CreditCard, Landmark } from 'lucide-react';
import { get } from '@/lib/i18n';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TransactionRow {
  id: string;
  description: string | null;
  amountCents: number;
  currency: string;
  type: string;
  date: string | Date;
  accountId: string;
  createdAt: string | Date;
}

interface AccountBrief {
  id: string;
  name: string;
  currency: string;
}

interface TransactionTableProps {
  transactions: TransactionRow[];
  accounts: AccountBrief[];
  dictionary: Record<string, unknown>;
  locale: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTypeIcon(type: string) {
  switch (type) {
    case 'INCOME':
      return ArrowUpRight;
    case 'EXPENSE':
      return ArrowDownRight;
    case 'TRANSFER_IN':
    case 'TRANSFER_OUT':
      return ArrowLeftRight;
    case 'INVESTMENT':
      return TrendingUp;
    case 'LOAN_PAYMENT':
      return CreditCard;
    default:
      return Landmark;
  }
}

function getTypeBadgeStyles(type: string): string {
  switch (type) {
    case 'INCOME':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'EXPENSE':
      return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case 'TRANSFER_IN':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'TRANSFER_OUT':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'INVESTMENT':
      return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
    case 'LOAN_PAYMENT':
      return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
    case 'CREDIT_PAYMENT':
      return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
    default:
      return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }
}

function getTypeLabel(type: string, dictionary: Record<string, unknown>): string {
  const keyMap: Record<string, string> = {
    INCOME: 'income',
    EXPENSE: 'expense',
    TRANSFER_IN: 'transferIn',
    TRANSFER_OUT: 'transferOut',
    INVESTMENT: 'investment',
    LOAN_PAYMENT: 'loanPayment',
    CREDIT_PAYMENT: 'creditPayment',
  };
  return get(dictionary, keyMap[type] ?? type);
}

function isIncomeOrTransferIn(type: string): boolean {
  return type === 'INCOME' || type === 'TRANSFER_IN';
}

function formatDate(date: string | Date, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatDateShort(date: string | Date, locale: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
}

// ---------------------------------------------------------------------------
// Single Transaction Row (memoized)
// ---------------------------------------------------------------------------

const TransactionRowItem = memo(function TransactionRowItem({
  transaction,
  accountName,
  dictionary,
  locale,
}: {
  transaction: TransactionRow;
  accountName: string;
  dictionary: Record<string, unknown>;
  locale: string;
}) {
  const isPositive = isIncomeOrTransferIn(transaction.type);
  const TypeIcon = getTypeIcon(transaction.type);

  const formattedAmount = useMemo(
    () => formatMoney(Math.abs(transaction.amountCents), transaction.currency, locale),
    [transaction.amountCents, transaction.currency, locale]
  );

  const formattedDate = useMemo(
    () => formatDate(transaction.date, locale),
    [transaction.date, locale]
  );

  return (
    <tr className="group border-b border-white/5 hover:bg-white/[0.02] transition-colors">
      {/* Date */}
      <td className="py-3 px-4">
        <time dateTime={typeof transaction.date === 'string' ? transaction.date : transaction.date.toISOString()}
          className="text-sm text-slate-400 tabular-nums whitespace-nowrap">
          {formattedDate}
        </time>
      </td>

      {/* Description */}
      <td className="py-3 px-4">
        <span className="text-sm text-white font-medium group-hover:text-blue-200 transition-colors">
          {transaction.description || <span className="text-slate-500 italic">—</span>}
        </span>
      </td>

      {/* Type badge */}
      <td className="py-3 px-4">
        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getTypeBadgeStyles(transaction.type)}`}>
          <TypeIcon className="w-3 h-3" aria-hidden="true" />
          {getTypeLabel(transaction.type, dictionary)}
        </span>
      </td>

      {/* Account */}
      <td className="py-3 px-4">
        <span className="text-sm text-slate-400">{accountName}</span>
      </td>

      {/* Amount */}
      <td className="py-3 px-4 text-right">
        <span className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
          {isPositive ? '+' : '-'}{formattedAmount}
        </span>
      </td>
    </tr>
  );
});

// ---------------------------------------------------------------------------
// Mobile Transaction Card (memoized)
// ---------------------------------------------------------------------------

const TransactionCard = memo(function TransactionCard({
  transaction,
  accountName,
  dictionary,
  locale,
}: {
  transaction: TransactionRow;
  accountName: string;
  dictionary: Record<string, unknown>;
  locale: string;
}) {
  const isPositive = isIncomeOrTransferIn(transaction.type);
  const TypeIcon = getTypeIcon(transaction.type);

  const formattedAmount = useMemo(
    () => formatMoney(Math.abs(transaction.amountCents), transaction.currency, locale),
    [transaction.amountCents, transaction.currency, locale]
  );

  const formattedDate = useMemo(
    () => formatDateShort(transaction.date, locale),
    [transaction.date, locale]
  );

  return (
    <div className="flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-white/[0.03] transition-colors group">
      {/* Type icon */}
      <div className={`p-2 rounded-xl shrink-0 ${getTypeBadgeStyles(transaction.type)}`}>
        <TypeIcon className="w-4 h-4" aria-hidden="true" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white font-medium truncate group-hover:text-blue-200 transition-colors">
          {transaction.description || <span className="text-slate-500 italic">—</span>}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <time dateTime={typeof transaction.date === 'string' ? transaction.date : transaction.date.toISOString()}
            className="text-xs text-slate-500 tabular-nums">
            {formattedDate}
          </time>
          <span className="text-slate-600">·</span>
          <span className="text-xs text-slate-500 truncate">{accountName}</span>
        </div>
        <div className="mt-1">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getTypeBadgeStyles(transaction.type)}`}>
            <TypeIcon className="w-2.5 h-2.5" aria-hidden="true" />
            {getTypeLabel(transaction.type, dictionary)}
          </span>
        </div>
      </div>

      {/* Amount */}
      <span className={`text-sm font-semibold tabular-nums shrink-0 ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isPositive ? '+' : '-'}{formattedAmount}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Main Table Component
// ---------------------------------------------------------------------------

export const TransactionTable = memo(function TransactionTable({
  transactions,
  accounts,
  dictionary,
  locale,
}: Readonly<TransactionTableProps>) {
  // Build account lookup map
  const accountMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of accounts) {
      map.set(acc.id, acc.name);
    }
    return map;
  }, [accounts]);

  const getAccountName = useCallback(
    (accountId: string) => accountMap.get(accountId) ?? '—',
    [accountMap]
  );

  if (transactions.length === 0) {
    return (
      <div className="app-shell rounded-2xl py-16 flex flex-col items-center gap-4 text-center" aria-live="polite">
        <div className="p-4 rounded-2xl bg-slate-500/10 text-slate-400">
          <Landmark className="w-8 h-8" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">
            {get(dictionary, 'noTransactions')}
          </p>
          <p className="text-xs text-slate-400 max-w-xs">
            {get(dictionary, 'noTransactionsDesc')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell rounded-2xl overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full" role="table" aria-label={get(dictionary, 'title')}>
          <thead>
            <tr className="border-b border-white/5">
              <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {get(dictionary, 'date')}
              </th>
              <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {get(dictionary, 'description')}
              </th>
              <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {get(dictionary, 'type')}
              </th>
              <th scope="col" className="text-left py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {get(dictionary, 'account')}
              </th>
              <th scope="col" className="text-right py-3 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {get(dictionary, 'amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => (
              <TransactionRowItem
                key={tx.id}
                transaction={tx}
                accountName={getAccountName(tx.accountId)}
                dictionary={dictionary}
                locale={locale}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="md:hidden divide-y divide-white/5" aria-label={get(dictionary, 'title')}>
        {transactions.map((tx) => (
          <TransactionCard
            key={tx.id}
            transaction={tx}
            accountName={getAccountName(tx.accountId)}
            dictionary={dictionary}
            locale={locale}
          />
        ))}
      </ul>
    </div>
  );
});


