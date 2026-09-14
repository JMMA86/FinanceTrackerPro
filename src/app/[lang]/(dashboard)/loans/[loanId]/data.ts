/**
 * Loan detail data module (server-only).
 *
 * The /loans/[loanId] route is a Server Component that must read the loan once
 * per request. Reads here are plain server functions (NOT `'use server'`
 * actions) so no redundant safeAction envelope is added. `getLoanDetail`
 * already reconciles the cached balance and serializes BigInt money to JS
 * numbers.
 *
 * `cache` memoizes the read within a single request so `generateMetadata` and
 * the page share one service call (one reconciliation) instead of two.
 */

import 'server-only';

import { cache } from 'react';
import { getSession } from '@/lib/auth/session';
import { getLoanDetail } from '@/services/loan.service';
import type { LoanWithInstallments } from '@/types/loans';

export interface LoanDetailPageData {
  loan: LoanWithInstallments | null;
  /** True when the read failed (no session or unexpected error). */
  error: boolean;
}

/**
 * Fetch a single loan aggregate for the detail route. Returns `{ loan: null }`
 * when the loan does not exist, is soft-deleted or belongs to another user.
 */
export const getLoanDetailPageData = cache(async (loanId: string): Promise<LoanDetailPageData> => {
  const session = await getSession();
  if (!session?.userId) {
    return { loan: null, error: true };
  }

  try {
    const loan = await getLoanDetail(session.userId, loanId);
    return { loan, error: false };
  } catch {
    return { loan: null, error: true };
  }
});
