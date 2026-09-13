/**
 * Fixed expenses page data module (server-only).
 *
 * The /fixed-expenses page is a Server Component that must read ALL financial
 * data once per request. Reads here are plain server functions (NOT `'use
 * server'` Server Actions) — resolving the session once and delegating to the
 * fixed-expense service avoids the redundant safeAction envelope + extra
 * getSession() per read. After a mutation the client calls router.refresh() and
 * this module re-runs.
 *
 * Errors are surfaced per block (expenses / summary) so the page keeps rendering
 * "loadFailed" states instead of crashing the whole route.
 */

import 'server-only';

import { getSession } from '@/lib/auth/session';
import {
  getFixedExpensesSummary,
  getFixedExpensesWithPayments,
} from '@/services/fixed-expense.service';
import type {
  FixedExpensesSummaryPerCurrency,
  FixedExpenseWithPayments,
} from '@/types/fixed-expense';

export interface FixedExpensesPageData {
  expenses: FixedExpenseWithPayments[];
  summaryBuckets: FixedExpensesSummaryPerCurrency[];
  /** True when the expenses read failed → page shows the i18n loadFailed state. */
  expensesError: boolean;
  summaryError: boolean;
}

/**
 * Fetch everything the /fixed-expenses page needs for a given month.
 *
 * The payment window spans from 3 months before the current month (overdue
 * lookback) through 11 months after it (rolling horizon), so the cards AND the
 * navigable calendar have a bounded, fully-loaded range — the calendar never
 * fetches on navigation.
 */
export async function getFixedExpensesPageData(
  month: number,
  year: number
): Promise<FixedExpensesPageData> {
  const session = await getSession();

  if (!session?.userId) {
    return {
      expenses: [],
      summaryBuckets: [],
      expensesError: true,
      summaryError: true,
    };
  }

  const now = new Date();
  const range = {
    from: new Date(now.getFullYear(), now.getMonth() - 3, 1, 0, 0, 0, 0),
    to: new Date(now.getFullYear(), now.getMonth() + 12, 0, 23, 59, 59, 999),
  };

  // ORDER MATTERS: getFixedExpensesWithPayments() materializes the rolling
  // payments via ensureUpcomingPayments(). The summary must NOT run in parallel
  // with it — on the first load after creating/seeding templates it could be
  // computed before those payment rows commit and report undercounted amounts
  // (self-correcting only on a later load). Await the expenses read first (with
  // per-block error capture), then compute the summary.
  const [expenses] = await Promise.allSettled([
    getFixedExpensesWithPayments(session.userId, range),
  ]);
  const [summary] = await Promise.allSettled([
    getFixedExpensesSummary(session.userId, month, year),
  ]);

  return {
    expenses: expenses.status === 'fulfilled' ? expenses.value : [],
    summaryBuckets: summary.status === 'fulfilled' ? summary.value.byCurrency : [],
    expensesError: expenses.status !== 'fulfilled',
    summaryError: summary.status !== 'fulfilled',
  };
}
