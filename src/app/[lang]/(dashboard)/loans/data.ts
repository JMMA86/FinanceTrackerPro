/**
 * Loans page data module (server-only).
 *
 * The /loans page is a Server Component that must read ALL financial data once
 * per request. Reads here are plain server functions (NOT `'use server'` Server
 * Actions) — `getLoansWithDetails` and `getLoansSummary` are exported directly
 * by the loan service, so calling the actions would add a redundant safeAction
 * envelope + an extra getSession() per read. This module resolves the session
 * once and delegates to the service, so `router.refresh()` after a mutation
 * re-runs a lightweight, correct read path.
 *
 * Both reads already serialize BigInt money to JS numbers (`LoanWithInstallments`
 * / `LoanSummaryPerCurrency`), so no extra conversion is needed here.
 *
 * Errors are surfaced per-bucket (loans / summary) so the page keeps rendering a
 * "loadFailed" state instead of crashing the whole route.
 */

import 'server-only';

import { getSession } from '@/lib/auth/session';
import { getLoansSummary, getLoansWithDetails } from '@/services/loan.service';
import type { LoanSummaryPerCurrency, LoanWithInstallments } from '@/types/loans';

export interface LoansPageData {
  loans: LoanWithInstallments[];
  summaryBuckets: LoanSummaryPerCurrency[];
  /** True when the loans read failed → page shows the i18n loadFailed state. */
  loansError: boolean;
  summaryError: boolean;
}

/**
 * Fetch everything the /loans page needs. Resolves the session ONCE and runs the
 * two reads concurrently, degrading to empty data + error flags per bucket.
 */
export async function getLoansPageData(): Promise<LoansPageData> {
  const session = await getSession();

  if (!session?.userId) {
    return {
      loans: [],
      summaryBuckets: [],
      loansError: true,
      summaryError: true,
    };
  }

  const [loans, summary] = await Promise.allSettled([
    getLoansWithDetails(session.userId),
    getLoansSummary(session.userId),
  ]);

  return {
    loans: loans.status === 'fulfilled' ? loans.value : [],
    summaryBuckets: summary.status === 'fulfilled' ? summary.value.byCurrency : [],
    loansError: loans.status !== 'fulfilled',
    summaryError: summary.status !== 'fulfilled',
  };
}
