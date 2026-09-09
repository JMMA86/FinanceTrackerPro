/**
 * Savings page data module (server-only).
 *
 * The savings page is a Server Component that must read ALL financial data
 * once per request. Reads here are plain server functions (NOT `'use server'`
 * Server Actions) — Server Actions are for mutations / client-invocable
 * endpoints, and calling them from an RSC render adds a redundant safeAction
 * envelope + one getSession() per read. This module resolves the session once
 * and delegates to the savings service directly, so `router.refresh()` after a
 * mutation re-runs a lightweight, correct read path.
 *
 * Errors are surfaced per-bucket (goals / summary / max-spendable) so the page
 * keeps rendering "loadFailed" states instead of crashing the whole route.
 */

import 'server-only';

import { getSession } from '@/lib/auth/session';
import {
  getSavingsGoalsWithProgress,
  getMaxSpendable,
  getSavingsSummary,
} from '@/services/savings.service';
import type {
  MaxSpendablePerCurrency,
  SavingsGoalWithProgress,
  SavingsSummaryPerCurrency,
} from '@/types/savings';

export interface SavingsPageData {
  goals: SavingsGoalWithProgress[];
  summaryBuckets: SavingsSummaryPerCurrency[];
  maxSpendableBuckets: MaxSpendablePerCurrency[];
  /** True when the goals read failed → page shows the i18n loadFailed state. */
  goalsError: boolean;
  summaryError: boolean;
  maxSpendableError: boolean;
}

/**
 * Fetch everything the /savings page needs for a given month.
 * Resolves the session ONCE and runs the three reads concurrently.
 */
export async function getSavingsPageData(month: number, year: number): Promise<SavingsPageData> {
  const session = await getSession();

  if (!session?.userId) {
    return {
      goals: [],
      summaryBuckets: [],
      maxSpendableBuckets: [],
      goalsError: true,
      summaryError: true,
      maxSpendableError: true,
    };
  }

  const [goals, summary, maxSpendable] = await Promise.allSettled([
    getSavingsGoalsWithProgress(session.userId),
    getSavingsSummary(session.userId, month, year),
    getMaxSpendable(session.userId, month, year),
  ]);

  return {
    goals: goals.status === 'fulfilled' ? goals.value : [],
    summaryBuckets: summary.status === 'fulfilled' ? summary.value.byCurrency : [],
    maxSpendableBuckets: maxSpendable.status === 'fulfilled' ? maxSpendable.value.byCurrency : [],
    goalsError: goals.status !== 'fulfilled',
    summaryError: summary.status !== 'fulfilled',
    maxSpendableError: maxSpendable.status !== 'fulfilled',
  };
}
