/**
 * Shared Savings Domain Types
 *
 * Central contract consumed by the backend (savings.service / savings.actions)
 * and reused by the frontend so responses are NEVER cast with `as unknown as`.
 *
 * Money fields are integer cents (Rule 2) and bounded by MAX_SAFE_CENTS so they
 * safely serialize to JS numbers after BigInt conversion (see serializeGoal).
 */

import type { Currency, SavingsGoal, SavingsContribution } from '@prisma/client';

/**
 * One currency bucket of the max-spendable breakdown for a month.
 * maxSpendableCents may be negative — the caller decides how to render it.
 */
export interface MaxSpendablePerCurrency {
  currency: Currency;
  totalIncomeCents: number;
  totalFixedExpensesCents: number;
  totalSavingsCommitmentsCents: number;
  totalVariableExpensesCents: number;
  maxSpendableCents: number;
}

/**
 * getMaxSpendable() result. Currencies are NEVER merged: without a reliable FX
 * service, converting silently is forbidden (Decision Log C1).
 */
export interface MaxSpendableBreakdown {
  byCurrency: MaxSpendablePerCurrency[];
}

/**
 * One currency bucket of the aggregated savings summary for a user/month.
 */
export interface SavingsSummaryPerCurrency {
  currency: Currency;
  totalSavedCents: number;
  totalTargetCents: number;
  /** 0-100, rounded with Decimal ROUND_HALF_EVEN and clamped to 100. */
  overallProgressPercentage: number;
  activeGoalsCount: number;
  completedGoalsCount: number;
  /** Sum of isActive contributions of the month for ACTIVE/COMPLETED goals. */
  monthlyContributedCents: number;
}

/**
 * getSavingsSummary() result. Only ACTIVE and COMPLETED goals are aggregated;
 * CANCELLED goals are excluded from the summary but stay visible on the grid.
 */
export interface SavingsSummaryResponse {
  byCurrency: SavingsSummaryPerCurrency[];
}

/**
 * Serialized contribution returned by getSavingsGoals — monetary BigInt is
 * converted to a JS number on the server (see serializeContribution).
 */
export type SavingsContributionWithProgress = Omit<SavingsContribution, 'amountCents'> & {
  amountCents: number;
};

/**
 * Serialized savings goal returned by getSavingsGoals(): monetary BigInt fields
 * are JS numbers, progress fields are appended, and `contributions` holds the 5
 * most recent active contributions. Includes the extended audit fields
 * ipAddress/userAgent (Rule 14). Shared by the savings page, grid, cards and
 * modals so data is NEVER cast with `as unknown as`.
 */
export type SavingsGoalWithProgress = Omit<
  SavingsGoal,
  'targetAmountCents' | 'currentAmountCents' | 'monthlyContributionCents' | 'contributions'
> & {
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number | null;
  progressPercentage: number;
  projectedCompletion: string | null;
  contributions: SavingsContributionWithProgress[];
  linkedAccount?: { id: string; name: string; currency: string } | null;
};
