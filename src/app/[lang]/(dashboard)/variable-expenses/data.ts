/**
 * Variable expenses page data module (server-only).
 *
 * The /variable-expenses page is a Server Component that reads ALL of its data
 * once per request. Reads here are plain server functions (NOT `'use server'`
 * Server Actions): the session is resolved once and delegated straight to the
 * service, so `router.refresh()` after a mutation re-runs a lightweight,
 * correct read path.
 *
 * Errors are surfaced per bucket (overview / definitions) so the page keeps
 * rendering error states instead of crashing the route.
 */

import 'server-only';

import { getSession } from '@/lib/auth/session';
import { log } from '@/lib/logger';
import {
  getVariableExpenseDefinitions,
  getVariableExpensesOverview,
} from '@/services/variable-expense.service';
import type {
  VariableExpenseDefinition,
  VariableExpensesOverviewResponse,
} from '@/types/variable-expense';

export interface VariableExpensesPageData {
  /** null when there is no session or the read failed. */
  overview: VariableExpensesOverviewResponse | null;
  definitions: VariableExpenseDefinition[];
  overviewError: boolean;
  definitionsError: boolean;
}

const EMPTY_PAGE_DATA: VariableExpensesPageData = {
  overview: null,
  definitions: [],
  overviewError: true,
  definitionsError: true,
};

interface Period {
  month: number;
  year: number;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function isValidMonth(month: number): boolean {
  return Number.isInteger(month) && month >= 1 && month <= 12;
}

function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Defensive validation of the requested period: an invalid month/year falls
 * back to the current one so the module is safe even when called directly
 * (page.tsx already clamps searchParams, but this module must not trust it).
 */
function resolvePeriod(month: number, year: number): Period {
  if (isValidMonth(month) && isValidYear(year)) {
    return { month, year };
  }
  const now = new Date();
  return {
    month: isValidMonth(month) ? month : now.getMonth() + 1,
    year: isValidYear(year) ? year : now.getFullYear(),
  };
}

/**
 * Fetch everything the /variable-expenses page needs for a given month.
 * Resolves the session ONCE and runs the two reads concurrently.
 */
export async function getVariableExpensesPageData(
  month: number,
  year: number
): Promise<VariableExpensesPageData> {
  const session = await getSession();

  if (!session?.userId) {
    return EMPTY_PAGE_DATA;
  }

  const userId = session.userId;
  const period = resolvePeriod(month, year);
  const [overview, definitions] = await Promise.allSettled([
    getVariableExpensesOverview(userId, period.month, period.year),
    getVariableExpenseDefinitions(userId),
  ]);

  logRejectedRead('overview', overview, userId);
  logRejectedRead('definitions', definitions, userId);

  return {
    overview: overview.status === 'fulfilled' ? overview.value : null,
    definitions: definitions.status === 'fulfilled' ? definitions.value : [],
    overviewError: overview.status !== 'fulfilled',
    definitionsError: definitions.status !== 'fulfilled',
  };
}

/** Log a failed read block without PII; the per-block flag drives the UI state. */
function logRejectedRead(
  block: 'overview' | 'definitions',
  result: PromiseSettledResult<unknown>,
  userId: string
): void {
  if (result.status === 'rejected') {
    log.error({ block, userId, error: result.reason }, '[VARIABLE_EXPENSE] Page read block failed');
  }
}
