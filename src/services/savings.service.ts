/**
 * Savings Service (Business Logic)
 * Handles reconciliation, projections, per-currency aggregation, and max
 * spendable calculations.
 *
 * RULE 1: All financial calculations use Decimal.js (via @/lib/money helpers)
 * RULE 13: currentAmountCents is CACHE - reconcile from contributions
 *
 * C1 (audit): getMaxSpendable/getSavingsSummary ALWAYS group by currency and
 * NEVER mix currencies. There is no reliable FX service — silent conversion is
 * forbidden. Each returned bucket carries its own `currency`.
 */

import 'server-only';
import { Decimal } from 'decimal.js';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { addCents, subtractCents } from '@/lib/money';
import type { Currency, SavingsGoal, SavingsGoalStatus } from '@prisma/client';
import type {
  MaxSpendableBreakdown,
  SavingsGoalWithProgress,
  SavingsSummaryResponse,
} from '@/types/savings';

// ============================================================================
// Per-currency accumulation helpers (C1)
// ============================================================================

type MoneyByCurrency = Partial<Record<Currency, number>>;

function addToCurrencyBucket(
  buckets: MoneyByCurrency,
  currency: Currency,
  amountCents: number
): void {
  buckets[currency] = addCents(buckets[currency] ?? 0, amountCents);
}

/**
 * Canonical deterministic currency order (matches the Prisma enum declaration)
 * so the per-currency breakdown is stable across calls.
 */
const CURRENCY_ORDER: Record<Currency, number> = { COP: 0, USD: 1, EUR: 2 };

/**
 * Ordered list of currencies that appeared in any bucket, so the final
 * breakdown is deterministic and every caller can pick a bucket by code.
 */
function currencyKeys(...maps: MoneyByCurrency[]): Currency[] {
  const keys = new Set<Currency>();
  for (const map of maps) {
    for (const key of Object.keys(map) as Currency[]) {
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) => CURRENCY_ORDER[a] - CURRENCY_ORDER[b]);
}

// ============================================================================
// Reconciliation (Rule 13)
// ============================================================================

/**
 * Reconcile a savings goal's cached balance against its contributions
 * Updates currentAmountCents if discrepancy found
 */
export async function reconcileGoalBalance(goalId: string): Promise<{
  success: boolean;
  cachedAmount: number;
  trueAmount: number;
  discrepancy: number;
  wasUpdated: boolean;
}> {
  const goal = await prisma.savingsGoal.findUnique({
    where: { id: goalId },
    select: { id: true, currentAmountCents: true },
  });

  if (!goal) {
    throw new Error(`SavingsGoal ${goalId} not found`);
  }

  const contributions = await prisma.savingsContribution.findMany({
    where: { goalId, isActive: true },
    select: { amountCents: true },
  });

  let trueAmount = 0;
  for (const contribution of contributions) {
    trueAmount = addCents(trueAmount, Number(contribution.amountCents));
  }

  const cachedAmount = Number(goal.currentAmountCents);
  const discrepancy = subtractCents(cachedAmount, trueAmount);

  if (discrepancy !== 0) {
    await prisma.savingsGoal.update({
      where: { id: goalId },
      data: { currentAmountCents: trueAmount },
    });

    log.warn(
      { goalId, cachedAmount, trueAmount, discrepancy },
      '[SAVINGS] Goal balance discrepancy detected and fixed'
    );

    return {
      success: true,
      cachedAmount,
      trueAmount,
      discrepancy,
      wasUpdated: true,
    };
  }

  return {
    success: true,
    cachedAmount,
    trueAmount,
    discrepancy: 0,
    wasUpdated: false,
  };
}

/**
 * Reconcile EVERY active ACTIVE/COMPLETED goal cache for a user against its
 * active contributions. CANCELLED goals are intentionally skipped: they are
 * excluded from summaries and their cached value is not surfaced anywhere.
 *
 * Runs as best-effort before every read path so each page renders reconciled
 * values. Never throws — a reconciliation failure must not break a read.
 *
 * Decision (M2): the canonical contribution set for a goal is its own
 * isActive:true contributions (goal scoped to ACTIVE/COMPLETED to match the
 * summary semantics). CANCELLED goals are left untouched.
 *
 * RULE 13 note: currentAmountCents is a CACHE. This function recomputes it
 * from the ledger (active contributions) and writes back any discrepancy via a
 * CONDITIONAL update so a concurrent contribution increment is never lost:
 *
 *   - The snapshot read captures the cached amount `C` for each goal.
 *   - The true ledger amount `T` is computed from contributions.
 *   - If `T !== C` we run `updateMany` inside a transaction with
 *     `where: { id, currentAmountCents: C }`. If another transaction already
 *     incremented the cache to `C' !== C` between our read and this write, the
 *     WHERE predicate does not match, 0 rows are updated, and the goal is left
 *     for the next read to reconcile again — the concurrent increment survives.
 *
 * Because the write uses the snapshot's cached value as its guard, no row-level
 * lock is required; this is the simplest correct fix for the read-modify-write
 * race.
 *
 * First-read self-heal: legacy/seed goals whose cache has no backing
 * contributions (e.g. a COMPLETED goal created before contributions were
 * tracked) are auto-corrected here to match the ledger (0) — this is desired
 * behavior under Rule 13 (source of truth = ledger). The seed has been updated
 * to create real backing contributions so demo data is not degraded.
 */
export async function reconcileGoalBalances(userId: string): Promise<void> {
  try {
    const goals = await prisma.savingsGoal.findMany({
      where: {
        userId,
        isActive: true,
        status: { in: ['ACTIVE', 'COMPLETED'] as SavingsGoalStatus[] },
      },
      select: { id: true, currentAmountCents: true },
    });

    if (goals.length === 0) return;

    const contributions = await prisma.savingsContribution.findMany({
      where: {
        goal: { userId, isActive: true },
        isActive: true,
      },
      select: { goalId: true, amountCents: true },
    });

    const trueByGoal = new Map<string, number>();
    for (const contribution of contributions) {
      trueByGoal.set(
        contribution.goalId,
        addCents(trueByGoal.get(contribution.goalId) ?? 0, Number(contribution.amountCents))
      );
    }

    // Collect conditional updates. The `cachedAmount` snapshot becomes the
    // guard in the WHERE clause so a concurrent increment (which changes
    // currentAmountCents) makes the write a no-op instead of overwriting it.
    const updates: Array<{ id: string; currentAmountCents: number; cachedAmount: number }> = [];
    for (const goal of goals) {
      const trueAmount = trueByGoal.get(goal.id) ?? 0;
      const cachedAmount = Number(goal.currentAmountCents);
      if (trueAmount !== cachedAmount) {
        updates.push({ id: goal.id, currentAmountCents: trueAmount, cachedAmount });
        log.warn(
          { goalId: goal.id, cachedAmount, trueAmount, userId },
          '[SAVINGS] Goal cache reconciled on read'
        );
      }
    }

    if (updates.length === 0) return;

    // Run all conditional writes atomically. Each update only applies if the
    // cached amount still equals the value we read (no concurrent change).
    await prisma.$transaction(
      updates.map((goal) =>
        prisma.savingsGoal.updateMany({
          where: { id: goal.id, currentAmountCents: goal.cachedAmount },
          data: { currentAmountCents: goal.currentAmountCents },
        })
      )
    );
  } catch (error) {
    log.error({ error, userId }, '[SAVINGS] Goal reconciliation failed on read');
  }
}

// ============================================================================
// Serialization helpers — convert Prisma BIGINT monetary fields to JS numbers
// so RSC payloads / Server Action responses stay serializable (JSON.stringify
// throws on bigint). Shared by the Server Actions and the savings page data
// module so the read path is a single source of truth.
// ============================================================================

export function serializeContribution<T extends { amountCents: bigint }>(
  contribution: T
): Omit<T, 'amountCents'> & { amountCents: number } {
  return { ...contribution, amountCents: Number(contribution.amountCents) };
}

type GoalWithSerializableMoney<
  T extends {
    targetAmountCents: bigint;
    currentAmountCents: bigint;
    monthlyContributionCents: bigint | null;
    contributions?: ReadonlyArray<{ amountCents: bigint }>;
  },
> = Omit<
  T,
  'targetAmountCents' | 'currentAmountCents' | 'monthlyContributionCents' | 'contributions'
> & {
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number | null;
  contributions?: Array<
    Omit<NonNullable<T['contributions']>[number], 'amountCents'> & { amountCents: number }
  >;
};

export function serializeGoal<
  T extends {
    targetAmountCents: bigint;
    currentAmountCents: bigint;
    monthlyContributionCents: bigint | null;
    contributions?: ReadonlyArray<{ amountCents: bigint }>;
  },
>(goal: T): GoalWithSerializableMoney<T> {
  return {
    ...goal,
    targetAmountCents: Number(goal.targetAmountCents),
    currentAmountCents: Number(goal.currentAmountCents),
    monthlyContributionCents:
      goal.monthlyContributionCents == null ? null : Number(goal.monthlyContributionCents),
    contributions: goal.contributions?.map((c) => serializeContribution(c)),
  };
}

/**
 * Read a user's active savings goals with progress + recent contributions.
 * Reconciles cached balances (Rule 13) before reading so the grid serves
 * source-of-truth values. CANCELLED goals stay visible (no status filter
 * applied) but are not part of any reconciliation/summary bucket.
 *
 * Shared read path: used by the getSavingsGoals Server Action (client-facing,
 * e.g. the contribute modal) AND by the savings page data module so both
 * surfaces render identical rows.
 */
export async function getSavingsGoalsWithProgress(
  userId: string,
  status?: SavingsGoalStatus
): Promise<SavingsGoalWithProgress[]> {
  await reconcileGoalBalances(userId);

  const goals = await prisma.savingsGoal.findMany({
    where: {
      userId,
      isActive: true,
      ...(status ? { status } : {}),
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    include: {
      contributions: {
        where: { isActive: true },
        orderBy: { date: 'desc' },
        take: 5,
      },
      linkedAccount: {
        select: { id: true, name: true, currency: true },
      },
    },
  });

  return goals.map((goal) => {
    const serialized = serializeGoal(goal);
    const progressPercentage =
      serialized.targetAmountCents > 0
        ? Math.min(
            100,
            new Decimal(serialized.currentAmountCents)
              .dividedBy(serialized.targetAmountCents)
              .times(100)
              .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
              .toNumber()
          )
        : 0;

    const projectedCompletion = calculateProjectedCompletion(goal, 'es-CO');

    return {
      ...serialized,
      progressPercentage,
      projectedCompletion,
      contributions: serialized.contributions ?? [],
    };
  });
}

// ============================================================================
// Projected Completion
// ============================================================================

/**
 * Calculate projected completion date for a savings goal
 * Based on monthly contribution rate and remaining amount
 */
export function calculateProjectedCompletion(
  goal: Pick<
    SavingsGoal,
    'targetAmountCents' | 'currentAmountCents' | 'monthlyContributionCents' | 'deadline'
  >,
  locale: string = 'es-CO'
): string | null {
  if (!goal.monthlyContributionCents || goal.monthlyContributionCents <= 0) {
    return null;
  }

  const remaining = subtractCents(Number(goal.targetAmountCents), Number(goal.currentAmountCents));
  if (remaining <= 0) {
    return formatDate(new Date(), locale); // Already completed
  }

  // Calculate months needed = remaining / monthlyContribution (keep fractional for correct ceiling)
  const monthsNeeded = new Decimal(remaining)
    .dividedBy(Number(goal.monthlyContributionCents))
    .toNumber();

  if (monthsNeeded <= 0) {
    return formatDate(new Date(), locale);
  }

  const projectedDate = new Date();
  projectedDate.setMonth(projectedDate.getMonth() + Math.ceil(monthsNeeded));

  // If there's a deadline and projected exceeds it, return null (unlikely to meet)
  if (goal.deadline && projectedDate > goal.deadline) {
    return null;
  }

  return formatDate(projectedDate, locale);
}

/** Formats a date to a locale-friendly string (e.g. "15 jun 2026") */
function formatDate(date: Date, locale: string): string {
  try {
    return date.toLocaleDateString(locale === 'es-CO' ? 'es-CO' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return date.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
}

// ============================================================================
// Max Spendable Calculation (per currency — C1/C2)
// ============================================================================

interface MonthlyContributionBucket {
  amountCents: number;
  currency: Currency;
}

interface ActiveSavingsGoalRow {
  id: string;
  currency: Currency;
  monthlyContributionCents: bigint | null;
}

interface RealizedContributionRow {
  goalId: string;
  amountCents: bigint;
  goal: { currency: Currency };
}

interface ExpenseTransactionRow {
  id: string;
  amountCents: bigint;
  currency: Currency;
}

/**
 * Sum realized contributions per goal (currency-tagged) so the savings
 * commitment bucket can compare planned vs realized per goal.
 */
function aggregateRealizedByGoal(
  rows: ReadonlyArray<RealizedContributionRow>
): Map<string, MonthlyContributionBucket> {
  const realizedByGoal = new Map<string, MonthlyContributionBucket>();
  for (const row of rows) {
    const existing = realizedByGoal.get(row.goalId);
    realizedByGoal.set(row.goalId, {
      amountCents: addCents(existing?.amountCents ?? 0, Number(row.amountCents)),
      currency: row.goal.currency,
    });
  }
  return realizedByGoal;
}

/**
 * Savings commitments per currency: for ACTIVE goals the commitment is
 * max(monthly plan, realized this month); non-ACTIVE goals that received a
 * contribution this month count their realized amount (money already left the
 * budget).
 */
function aggregateCommitmentsByCurrency(
  activeGoals: ReadonlyArray<ActiveSavingsGoalRow>,
  realizedByGoal: Map<string, MonthlyContributionBucket>
): { commitmentsByCurrency: MoneyByCurrency; handledGoalIds: Set<string> } {
  const commitmentsByCurrency: MoneyByCurrency = {};
  const handledGoalIds = new Set<string>();

  // ACTIVE goals: commitment = max(monthly plan, realized this month)
  for (const goal of activeGoals) {
    handledGoalIds.add(goal.id);
    const realized = realizedByGoal.get(goal.id);
    const planned = Number(goal.monthlyContributionCents ?? 0);
    const realizedAmount = realized?.amountCents ?? 0;
    // Selection, not arithmetic: pick whichever amount is larger (Decimal-safe).
    const commitment = Math.max(planned, realizedAmount);
    if (commitment > 0) {
      addToCurrencyBucket(commitmentsByCurrency, goal.currency, commitment);
    }
  }

  // Non-ACTIVE goals (completed/cancelled mid-month) that received a
  // contribution this month: the money already left the budget — count it.
  for (const [goalId, realized] of realizedByGoal) {
    if (handledGoalIds.has(goalId)) continue;
    addToCurrencyBucket(commitmentsByCurrency, realized.currency, realized.amountCents);
  }

  return { commitmentsByCurrency, handledGoalIds };
}

/**
 * Variable expenses per currency: EXPENSE transactions of the month that are
 * neither linked to a savings contribution nor to a fixed expense payment.
 * Stored amounts are negative; the sign is converted with Decimal.js.
 */
function aggregateVariableByCurrency(
  expenseTransactions: ReadonlyArray<ExpenseTransactionRow>,
  contributionLinkedTxIds: Set<string>
): MoneyByCurrency {
  const variableByCurrency: MoneyByCurrency = {};
  for (const tx of expenseTransactions) {
    if (contributionLinkedTxIds.has(tx.id)) continue;
    // EXPENSE amounts are stored as negative: convert the sign with Decimal.js
    // (subtractCents) so we never rely on IEEE-754 Math.abs over money.
    const stored = Number(tx.amountCents);
    const magnitude = stored < 0 ? subtractCents(0, stored) : stored;
    addToCurrencyBucket(variableByCurrency, tx.currency, magnitude);
  }
  return variableByCurrency;
}

/**
 * Calculate maximum spendable amount for a given month, broken down by
 * currency. NEVER mixes currencies.
 *
 * Formula per currency: Income - Fixed - Savings Commitments - Variable
 * All calculations use Decimal.js (Rule 1)
 *
 * Bucket semantics (C2):
 * - Fixed expenses: expectedAmountCents grouped by the FIXED EXPENSE currency.
 * - Savings commitments per goal: for every ACTIVE goal of the user,
 *   max(monthlyContributionCents ?? 0, realized contributions to that goal in
 *   the month). If a goal was completed or cancelled during the month, its
 *   realized contributions are still counted (money already moved to savings).
 * - Variable expenses: EXPENSE transactions of the month EXCLUDING those
 *   linked to a SavingsContribution (they are represented by the savings
 *   commitment bucket) and those with a fixedExpensePaymentId (already covered
 *   by the fixed bucket).
 */
export async function getMaxSpendable(
  userId: string,
  month: number,
  year: number
): Promise<MaxSpendableBreakdown> {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  // 1. Income: sum of INCOME transactions in the month, per currency
  const incomeByCurrency: MoneyByCurrency = {};
  const incomeTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      isActive: true,
      type: 'INCOME',
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    select: { amountCents: true, currency: true },
  });

  for (const tx of incomeTransactions) {
    addToCurrencyBucket(incomeByCurrency, tx.currency, Number(tx.amountCents));
  }

  // 2. Fixed Expenses: expected payments due in the month, per fixed expense
  //    currency (NOT the payment row currency — the payment copies it but the
  //    FixedExpense is the ownership record).
  const fixedByCurrency: MoneyByCurrency = {};
  const fixedExpensePayments = await prisma.fixedExpensePayment.findMany({
    where: {
      fixedExpense: { userId, isActive: true },
      dueDate: { gte: startOfMonth, lte: endOfMonth },
      isActive: true,
    },
    select: {
      expectedAmountCents: true,
      fixedExpense: { select: { currency: true } },
    },
  });

  for (const payment of fixedExpensePayments) {
    addToCurrencyBucket(
      fixedByCurrency,
      payment.fixedExpense.currency,
      Number(payment.expectedAmountCents)
    );
  }

  // 3. Savings Commitments: per ACTIVE goal, max(planned, realized this month)
  const activeGoals = await prisma.savingsGoal.findMany({
    where: { userId, isActive: true, status: 'ACTIVE' },
    select: { id: true, currency: true, monthlyContributionCents: true },
  });

  // Realized contributions of the month for every visible (active) goal,
  // regardless of current status. A contribution made before the goal was
  // auto-completed or manually cancelled during the month still represents
  // money that left the budget — it must count as a commitment, otherwise it
  // would be silently dropped from the calculation (its linked EXPENSE is
  // excluded from the variable bucket below).
  const realizedRows = await prisma.savingsContribution.findMany({
    where: {
      isActive: true,
      date: { gte: startOfMonth, lte: endOfMonth },
      goal: { userId, isActive: true },
    },
    select: {
      goalId: true,
      amountCents: true,
      goal: { select: { currency: true } },
    },
  });

  const realizedByGoal = aggregateRealizedByGoal(realizedRows);

  const { commitmentsByCurrency } = aggregateCommitmentsByCurrency(activeGoals, realizedByGoal);

  // 4. Variable Expenses: EXPENSE transactions of the month that are NOT
  //    linked to a savings contribution NOR to a fixed expense payment.
  const contributionLinkedTxIds = new Set(
    (
      await prisma.savingsContribution.findMany({
        where: {
          transactionId: { not: null },
          isActive: true,
          date: { gte: startOfMonth, lte: endOfMonth },
          goal: { userId, isActive: true },
        },
        select: { transactionId: true },
      })
    )
      .map((row) => row.transactionId)
      .filter((id): id is string => id !== null)
  );

  const expenseTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      isActive: true,
      type: 'EXPENSE',
      fixedExpensePaymentId: null,
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    select: { id: true, amountCents: true, currency: true },
  });

  const variableByCurrency = aggregateVariableByCurrency(
    expenseTransactions,
    contributionLinkedTxIds
  );

  // 5. Compose per-currency breakdown
  const allCurrencies = currencyKeys(
    incomeByCurrency,
    fixedByCurrency,
    commitmentsByCurrency,
    variableByCurrency
  );

  const byCurrency = allCurrencies.map((currency) => {
    const totalIncomeCents = incomeByCurrency[currency] ?? 0;
    const totalFixedExpensesCents = fixedByCurrency[currency] ?? 0;
    const totalSavingsCommitmentsCents = commitmentsByCurrency[currency] ?? 0;
    const totalVariableExpensesCents = variableByCurrency[currency] ?? 0;

    const maxSpendableCents = subtractCents(
      subtractCents(
        subtractCents(totalIncomeCents, totalFixedExpensesCents),
        totalSavingsCommitmentsCents
      ),
      totalVariableExpensesCents
    );

    return {
      currency,
      totalIncomeCents,
      totalFixedExpensesCents,
      totalSavingsCommitmentsCents,
      totalVariableExpensesCents,
      maxSpendableCents,
    };
  });

  log.info(
    {
      userId,
      month,
      year,
      byCurrency,
    },
    '[SAVINGS] Max spendable calculated per currency'
  );

  return { byCurrency };
}

// ============================================================================
// Summary Aggregations (per currency — C1)
// ============================================================================

/**
 * Get aggregated savings summary for a user, broken down by currency.
 *
 * - Filters goals to status ['ACTIVE','COMPLETED'] (CANCELLED excluded).
 * - monthlyContributedCents only counts contributions to ACTIVE/COMPLETED goals.
 * - overallProgressPercentage is Decimal ROUND_HALF_EVEN (2 dp) and clamped 0..100.
 * - Reconciles goal caches before reading so the totals are source-of-truth.
 */
export async function getSavingsSummary(
  userId: string,
  month?: number,
  year?: number
): Promise<SavingsSummaryResponse> {
  await reconcileGoalBalances(userId);

  const goals = await prisma.savingsGoal.findMany({
    where: {
      userId,
      isActive: true,
      status: { in: ['ACTIVE', 'COMPLETED'] as SavingsGoalStatus[] },
    },
    select: {
      currentAmountCents: true,
      targetAmountCents: true,
      status: true,
      currency: true,
    },
  });

  const savedByCurrency: MoneyByCurrency = {};
  const targetByCurrency: MoneyByCurrency = {};
  const activeByCurrency: Partial<Record<Currency, number>> = {};
  const completedByCurrency: Partial<Record<Currency, number>> = {};

  for (const goal of goals) {
    addToCurrencyBucket(savedByCurrency, goal.currency, Number(goal.currentAmountCents));
    addToCurrencyBucket(targetByCurrency, goal.currency, Number(goal.targetAmountCents));

    if (goal.status === 'ACTIVE') {
      activeByCurrency[goal.currency] = (activeByCurrency[goal.currency] ?? 0) + 1;
    } else if (goal.status === 'COMPLETED') {
      completedByCurrency[goal.currency] = (completedByCurrency[goal.currency] ?? 0) + 1;
    }
  }

  // Monthly contributed (current month or specified month)
  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();

  const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
  const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  const monthlyContributions = await prisma.savingsContribution.findMany({
    where: {
      goal: {
        userId,
        isActive: true,
        status: { in: ['ACTIVE', 'COMPLETED'] as SavingsGoalStatus[] },
      },
      date: { gte: startOfMonth, lte: endOfMonth },
      isActive: true,
    },
    select: { amountCents: true, currency: true },
  });

  const monthlyByCurrency: MoneyByCurrency = {};
  for (const contribution of monthlyContributions) {
    addToCurrencyBucket(monthlyByCurrency, contribution.currency, Number(contribution.amountCents));
  }

  const allCurrencies = currencyKeys(savedByCurrency, targetByCurrency, monthlyByCurrency);

  const byCurrency = allCurrencies.map((currency) => {
    const totalSavedCents = savedByCurrency[currency] ?? 0;
    const totalTargetCents = targetByCurrency[currency] ?? 0;

    const overallProgressPercentage =
      totalTargetCents > 0
        ? Math.min(
            100,
            new Decimal(totalSavedCents)
              .dividedBy(totalTargetCents)
              .times(100)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
              .toNumber()
          )
        : 0;

    return {
      currency,
      totalSavedCents,
      totalTargetCents,
      overallProgressPercentage,
      activeGoalsCount: activeByCurrency[currency] ?? 0,
      completedGoalsCount: completedByCurrency[currency] ?? 0,
      monthlyContributedCents: monthlyByCurrency[currency] ?? 0,
    };
  });

  log.info(
    { userId, month: targetMonth, year: targetYear, byCurrency },
    '[SAVINGS] Summary calculated per currency'
  );

  return { byCurrency };
}
