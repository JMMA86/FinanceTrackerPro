/**
 * Savings Service (Business Logic)
 * Handles reconciliation, projections, and max spendable calculations
 *
 * RULE 1: All financial calculations use Decimal.js
 * RULE 13: currentAmountCents is CACHE - reconcile from contributions
 */

import 'server-only';
import { Decimal } from 'decimal.js';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { addCents, subtractCents } from '@/lib/money';
import type { SavingsGoal } from '@prisma/client';

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
    trueAmount = addCents(trueAmount, contribution.amountCents);
  }

  const cachedAmount = goal.currentAmountCents;
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

  const remaining = subtractCents(goal.targetAmountCents, goal.currentAmountCents);
  if (remaining <= 0) {
    return formatDate(new Date(), locale); // Already completed
  }

  // Calculate months needed = remaining / monthlyContribution (keep fractional for correct ceiling)
  const monthsNeeded = new Decimal(remaining).dividedBy(goal.monthlyContributionCents).toNumber();

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
// Max Spendable Calculation
// ============================================================================

interface MaxSpendableBreakdown {
  totalIncomeCents: number;
  totalFixedExpensesCents: number;
  totalSavingsCommitmentsCents: number;
  totalVariableExpensesCents: number;
  maxSpendableCents: number;
}

/**
 * Calculate maximum spendable amount for a given month
 * Formula: Income - Fixed Expenses - Savings Commitments - Variable Expenses
 * All calculations use Decimal.js (Rule 1)
 */
export async function getMaxSpendable(
  userId: string,
  month: number,
  year: number
): Promise<MaxSpendableBreakdown> {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  // 1. Income: sum of INCOME transactions in the month
  const incomeTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      isActive: true,
      type: 'INCOME',
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    select: { amountCents: true },
  });

  let totalIncomeCents = 0;
  for (const tx of incomeTransactions) {
    totalIncomeCents = addCents(totalIncomeCents, tx.amountCents);
  }

  // 2. Fixed Expenses: expected payments due in the month
  const fixedExpensePayments = await prisma.fixedExpensePayment.findMany({
    where: {
      fixedExpense: { userId, isActive: true },
      dueDate: { gte: startOfMonth, lte: endOfMonth },
      isActive: true,
    },
    select: { expectedAmountCents: true },
  });

  let totalFixedExpensesCents = 0;
  for (const payment of fixedExpensePayments) {
    totalFixedExpensesCents = addCents(totalFixedExpensesCents, payment.expectedAmountCents);
  }

  // 3. Savings Commitments: monthly contributions from active goals
  const activeGoals = await prisma.savingsGoal.findMany({
    where: {
      userId,
      isActive: true,
      status: 'ACTIVE',
      monthlyContributionCents: { not: null },
    },
    select: { monthlyContributionCents: true },
  });

  let totalSavingsCommitmentsCents = 0;
  for (const goal of activeGoals) {
    if (goal.monthlyContributionCents) {
      totalSavingsCommitmentsCents = addCents(
        totalSavingsCommitmentsCents,
        goal.monthlyContributionCents
      );
    }
  }

  // 4. Variable Expenses: sum of EXPENSE transactions in the month
  const expenseTransactions = await prisma.transaction.findMany({
    where: {
      userId,
      isActive: true,
      type: 'EXPENSE',
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    select: { amountCents: true },
  });

  let totalVariableExpensesCents = 0;
  for (const tx of expenseTransactions) {
    // EXPENSE amounts are stored as negative, take absolute value
    totalVariableExpensesCents = addCents(totalVariableExpensesCents, Math.abs(tx.amountCents));
  }

  // Calculate max spendable using Decimal.js for precision (can be negative — caller must handle)
  const maxSpendableCents = subtractCents(
    subtractCents(
      subtractCents(totalIncomeCents, totalFixedExpensesCents),
      totalSavingsCommitmentsCents
    ),
    totalVariableExpensesCents
  );

  log.info(
    {
      userId,
      month,
      year,
      totalIncomeCents,
      totalFixedExpensesCents,
      totalSavingsCommitmentsCents,
      totalVariableExpensesCents,
      maxSpendableCents,
    },
    '[SAVINGS] Max spendable calculated'
  );

  return {
    totalIncomeCents,
    totalFixedExpensesCents,
    totalSavingsCommitmentsCents,
    totalVariableExpensesCents,
    maxSpendableCents,
  };
}

// ============================================================================
// Summary Aggregations
// ============================================================================

interface SavingsSummary {
  totalSavedCents: number;
  totalTargetCents: number;
  overallProgressPercentage: number;
  activeGoalsCount: number;
  completedGoalsCount: number;
  monthlyContributedCents: number;
}

/**
 * Get aggregated savings summary for a user
 */
export async function getSavingsSummary(
  userId: string,
  month?: number,
  year?: number
): Promise<SavingsSummary> {
  const goals = await prisma.savingsGoal.findMany({
    where: { userId, isActive: true },
    select: {
      currentAmountCents: true,
      targetAmountCents: true,
      status: true,
    },
  });

  let totalSavedCents = 0;
  let totalTargetCents = 0;
  let activeGoalsCount = 0;
  let completedGoalsCount = 0;

  for (const goal of goals) {
    totalSavedCents = addCents(totalSavedCents, goal.currentAmountCents);
    totalTargetCents = addCents(totalTargetCents, goal.targetAmountCents);

    if (goal.status === 'ACTIVE') {
      activeGoalsCount++;
    } else if (goal.status === 'COMPLETED') {
      completedGoalsCount++;
    }
  }

  const overallProgressPercentage =
    totalTargetCents > 0
      ? new Decimal(totalSavedCents)
          .dividedBy(totalTargetCents)
          .times(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
          .toNumber()
      : 0;

  // Monthly contributed (current month or specified month)
  const now = new Date();
  const targetMonth = month ?? now.getMonth() + 1;
  const targetYear = year ?? now.getFullYear();

  const startOfMonth = new Date(targetYear, targetMonth - 1, 1);
  const endOfMonth = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999);

  const monthlyContributions = await prisma.savingsContribution.findMany({
    where: {
      goal: { userId, isActive: true },
      date: { gte: startOfMonth, lte: endOfMonth },
      isActive: true,
    },
    select: { amountCents: true },
  });

  let monthlyContributedCents = 0;
  for (const contribution of monthlyContributions) {
    monthlyContributedCents = addCents(monthlyContributedCents, contribution.amountCents);
  }

  return {
    totalSavedCents,
    totalTargetCents,
    overallProgressPercentage,
    activeGoalsCount,
    completedGoalsCount,
    monthlyContributedCents,
  };
}
