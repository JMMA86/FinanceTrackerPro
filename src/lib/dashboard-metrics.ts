/**
 * Dashboard Metrics Helpers (pure functions)
 *
 * Extracted from the dashboard read path so they can be exported and
 * unit-tested WITHOUT violating Next.js's "Server Actions must be async
 * functions" rule (a 'use server' file may only export async functions).
 * They are consumed by `src/app/[lang]/(dashboard)/dashboard/data.ts`.
 *
 * These helpers are pure and side-effect free; they use `addCents` (Decimal.js)
 * for all monetary arithmetic (CLAUDE.md Rule 1).
 */

import { addCents, subtractCents } from '@/lib/money';
import type { Currency } from '@prisma/client';

export interface TransactionData {
  id: string;
  description: string | null;
  amountCents: number;
  currency: Currency;
  type: string;
  date: Date;
  accountId: string;
  transferToAccountId: string | null;
  transferFromAccountId: string | null;
}

export interface AccountHierarchyEntry {
  id: string;
  type: string;
  parentAccountId: string | null;
}

/**
 * Returns true when a transfer stays within the same parent account
 * (parent -> its pocket, pocket -> its parent, pocket -> sibling pocket).
 */
export function isInternalTransfer(
  fromAccountId: string,
  toAccountId: string | null,
  hierarchy: Record<string, AccountHierarchyEntry>
): boolean {
  if (!toAccountId) return false;
  const from = hierarchy[fromAccountId];
  const to = hierarchy[toAccountId];
  if (!from || !to) return false;
  if (from.type === 'POCKET') {
    return (
      to.id === from.parentAccountId ||
      (to.type === 'POCKET' &&
        to.parentAccountId === from.parentAccountId &&
        from.parentAccountId !== null)
    );
  }
  return to.type === 'POCKET' && to.parentAccountId === from.id;
}

/**
 * Calculate transaction metrics for income and expenses.
 * Internal pocket transfers are excluded so moving money into a pocket does not
 * inflate the monthly income/expense figures.
 */
export function calculateTransactionMetrics(
  transactions: TransactionData[],
  startOfCurrentMonth: Date,
  startOfLastMonth: Date,
  endOfLastMonth: Date,
  hierarchy: Record<string, AccountHierarchyEntry>
): { monthlyIncome: number; monthlyExpenses: number; lastMonthExpenses: number } {
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  let lastMonthExpenses = 0;

  for (const tx of transactions) {
    const isCurrentMonth = tx.date >= startOfCurrentMonth;
    const isLastMonth = tx.date >= startOfLastMonth && tx.date <= endOfLastMonth;
    const isInternal =
      (tx.type === 'TRANSFER_OUT' &&
        isInternalTransfer(tx.accountId, tx.transferToAccountId, hierarchy)) ||
      (tx.type === 'TRANSFER_IN' &&
        isInternalTransfer(tx.accountId, tx.transferFromAccountId, hierarchy));

    const isIncome =
      !isInternal && tx.amountCents > 0 && (tx.type === 'INCOME' || tx.type === 'TRANSFER_IN');
    const isExpense =
      !isInternal && tx.amountCents < 0 && (tx.type === 'EXPENSE' || tx.type === 'TRANSFER_OUT');

    if (isCurrentMonth && isIncome) {
      monthlyIncome = addCents(monthlyIncome, tx.amountCents);
    } else if (isCurrentMonth && isExpense) {
      // Magnitude via Decimal (Rule 1) — never Math.abs over money.
      monthlyExpenses = addCents(monthlyExpenses, subtractCents(0, tx.amountCents));
    } else if (isLastMonth && isExpense) {
      lastMonthExpenses = addCents(lastMonthExpenses, subtractCents(0, tx.amountCents));
    }
  }

  return { monthlyIncome, monthlyExpenses, lastMonthExpenses };
}

// ============================================================================
// Per-currency variants (Rule 4 — currencies are never mixed)
// ============================================================================

type MoneyByCurrency = Partial<Record<Currency, number>>;

/** Per-currency income/expense metrics for the current + previous month. */
export interface CurrencyTransactionMetrics {
  monthlyIncome: MoneyByCurrency;
  monthlyExpenses: MoneyByCurrency;
  lastMonthExpenses: MoneyByCurrency;
}

function addToCurrencyBucket(
  buckets: MoneyByCurrency,
  currency: Currency,
  amountCents: number
): void {
  buckets[currency] = addCents(buckets[currency] ?? 0, amountCents);
}

function isInternalTransaction(
  tx: TransactionData,
  hierarchy: Record<string, AccountHierarchyEntry>
): boolean {
  return (
    (tx.type === 'TRANSFER_OUT' &&
      isInternalTransfer(tx.accountId, tx.transferToAccountId, hierarchy)) ||
    (tx.type === 'TRANSFER_IN' &&
      isInternalTransfer(tx.accountId, tx.transferFromAccountId, hierarchy))
  );
}

/**
 * Same classification as {@link calculateTransactionMetrics} but keeps each
 * currency in its own bucket. Internal pocket transfers are excluded so moving
 * money into a pocket does not inflate income/expenses.
 */
export function calculateTransactionMetricsByCurrency(
  transactions: TransactionData[],
  startOfCurrentMonth: Date,
  startOfLastMonth: Date,
  endOfLastMonth: Date,
  hierarchy: Record<string, AccountHierarchyEntry>
): CurrencyTransactionMetrics {
  const result: CurrencyTransactionMetrics = {
    monthlyIncome: {},
    monthlyExpenses: {},
    lastMonthExpenses: {},
  };

  for (const tx of transactions) {
    if (isInternalTransaction(tx, hierarchy)) continue;

    const isCurrentMonth = tx.date >= startOfCurrentMonth;
    const isLastMonth = tx.date >= startOfLastMonth && tx.date <= endOfLastMonth;
    const isIncome = tx.amountCents > 0 && (tx.type === 'INCOME' || tx.type === 'TRANSFER_IN');
    const isExpense = tx.amountCents < 0 && (tx.type === 'EXPENSE' || tx.type === 'TRANSFER_OUT');

    if (isCurrentMonth && isIncome) {
      addToCurrencyBucket(result.monthlyIncome, tx.currency, tx.amountCents);
    } else if (isCurrentMonth && isExpense) {
      // Magnitude via Decimal (Rule 1) — never Math.abs over money.
      addToCurrencyBucket(result.monthlyExpenses, tx.currency, subtractCents(0, tx.amountCents));
    } else if (isLastMonth && isExpense) {
      addToCurrencyBucket(result.lastMonthExpenses, tx.currency, subtractCents(0, tx.amountCents));
    }
  }

  return result;
}

type TransactionFlow = 'income' | 'expense' | 'none';

/**
 * Classify a transaction for the series aggregation of ONE currency (Rule 4).
 *
 * Returns `'none'` for other currencies, internal pocket transfers and amounts
 * that are neither income nor expense, so callers only accumulate real flows.
 */
function classifyTransaction(
  tx: TransactionData,
  currency: Currency,
  hierarchy: Record<string, AccountHierarchyEntry>
): TransactionFlow {
  if (tx.currency !== currency) return 'none';
  if (isInternalTransaction(tx, hierarchy)) return 'none';
  if (tx.amountCents > 0 && (tx.type === 'INCOME' || tx.type === 'TRANSFER_IN')) return 'income';
  if (tx.amountCents < 0 && (tx.type === 'EXPENSE' || tx.type === 'TRANSFER_OUT')) return 'expense';
  return 'none';
}

/**
 * Aggregate the income and expense magnitude of ONE month window for ONE
 * currency. Magnitudes use Decimal.js (Rule 1) — never `Math.abs` over money.
 */
function accumulateMonth(
  transactions: TransactionData[],
  hierarchy: Record<string, AccountHierarchyEntry>,
  currency: Currency,
  start: Date,
  end: Date
): { income: number; expenses: number } {
  let income = 0;
  let expenses = 0;

  for (const tx of transactions) {
    if (tx.date < start || tx.date > end) continue;

    const flow = classifyTransaction(tx, currency, hierarchy);
    if (flow === 'income') {
      income = addCents(income, tx.amountCents);
    } else if (flow === 'expense') {
      expenses = addCents(expenses, subtractCents(0, tx.amountCents));
    }
  }

  return { income, expenses };
}

/**
 * Build a monthly income/expense series for the last N months of ONE currency
 * (the base currency), oldest → newest. Only that currency is aggregated so the
 * series never mixes currencies (Rule 4).
 *
 * @param monthStarts ascending list of month start dates (last element = current
 *   month). The last bucket ends at `now`.
 */
export function buildMonthlyIncomeExpenseSeries(
  transactions: TransactionData[],
  monthStarts: Date[],
  hierarchy: Record<string, AccountHierarchyEntry>,
  currency: Currency,
  now: Date = new Date()
): { income: number[]; expenses: number[] } {
  const income: number[] = [];
  const expenses: number[] = [];

  for (let i = 0; i < monthStarts.length; i += 1) {
    const start = monthStarts[i];
    const next = monthStarts[i + 1];
    const end = next ? new Date(next.getTime() - 1) : now;

    const totals = accumulateMonth(transactions, hierarchy, currency, start, end);
    income.push(totals.income);
    expenses.push(totals.expenses);
  }

  return { income, expenses };
}
