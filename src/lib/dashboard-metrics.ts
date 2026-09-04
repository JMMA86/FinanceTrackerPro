/**
 * Dashboard Metrics Helpers (pure functions)
 *
 * Extracted from src/actions/dashboard.actions.ts so they can be exported and
 * unit-tested WITHOUT violating Next.js's "Server Actions must be async
 * functions" rule (a 'use server' file may only export async functions).
 *
 * These helpers are pure and side-effect free; they use `addCents` (Decimal.js)
 * for all monetary arithmetic (CLAUDE.md Rule 1).
 */

import { addCents } from '@/lib/money';
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
      monthlyExpenses = addCents(monthlyExpenses, Math.abs(tx.amountCents));
    } else if (isLastMonth && isExpense) {
      lastMonthExpenses = addCents(lastMonthExpenses, Math.abs(tx.amountCents));
    }
  }

  return { monthlyIncome, monthlyExpenses, lastMonthExpenses };
}
