/**
 * Savings Server Actions
 * CRUD for savings goals + contributions + max spendable calculation
 *
 * RULE 3: Atomic transactions with prisma.$transaction()
 * RULE 4: Soft deletes + audit trail (createdBy, lastModifiedBy, ipAddress, userAgent)
 * RULE 5: Zod validation server-side
 * RULE 12: Idempotency keys UUID v4
 * RULE 14: Security logging with IP and user agent
 */

'use server';
import 'server-only';

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { addCents } from '@/lib/money';
import { Decimal } from 'decimal.js';
import { getTrueBalance } from '@/services/reconciliation.service';
import { getTransactionRepository } from '@/lib/repositories';
import { getClientInfo } from '@/lib/utils/client-info';
import {
  checkApiRateLimit,
  recordApiAttempt,
  markApiAttemptSuccess,
} from '@/services/rate-limit.service';
import {
  NotFoundError,
  UnauthorizedError,
  InsufficientFundsError,
  RateLimitError,
} from '@/lib/errors/api-errors';
import type { ApiAction } from '@prisma/client';
import {
  CreateSavingsGoalSchema,
  UpdateSavingsGoalSchema,
  ContributeToGoalSchema,
  GetSavingsSummarySchema,
  CalculateMaxSpendableSchema,
  DeleteSavingsGoalSchema,
  GetSavingsGoalsSchema,
} from './savings.schema';
import {
  calculateProjectedCompletion,
  getMaxSpendable,
  getSavingsSummary as getSavingsSummaryService,
} from '@/services/savings.service';

// ============================================================================
// 1. createSavingsGoal — Create a new savings goal
// ============================================================================

async function createSavingsGoalInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateSavingsGoalSchema.parse(input);

  const goal = await prisma.savingsGoal.create({
    data: {
      userId: session.userId,
      name: validated.name,
      description: validated.description ?? null,
      type: validated.type,
      targetAmountCents: validated.targetAmountCents,
      currency: validated.currency,
      deadline: validated.deadline ?? null,
      monthlyContributionCents: validated.monthlyContributionCents ?? null,
      linkedAccountId: validated.linkedAccountId ?? null,
      color: validated.color ?? null,
      icon: validated.icon ?? null,
      createdBy: session.userId,
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'savings.goal.create', goalId: goal.id, userId: session.userId },
    'Savings goal created'
  );

  return goal;
}

export const createSavingsGoal = safeAction(createSavingsGoalInternal);

// ============================================================================
// 2. getSavingsGoals — Retrieve all goals with progress + recent contributions
// ============================================================================

async function getSavingsGoalsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetSavingsGoalsSchema.parse(input);

  const where = {
    userId: session.userId,
    isActive: true,
    ...(validated.status ? { status: validated.status } : {}),
  };

  const goals = await prisma.savingsGoal.findMany({
    where,
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

  const goalsWithProgress = goals.map((goal) => {
    const progressPercentage =
      goal.targetAmountCents > 0
        ? Math.min(
            100,
            new Decimal(goal.currentAmountCents)
              .dividedBy(goal.targetAmountCents)
              .times(100)
              .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
              .toNumber()
          )
        : 0;

    const projectedCompletion = calculateProjectedCompletion(goal, 'es-CO');

    return {
      ...goal,
      progressPercentage,
      projectedCompletion,
    };
  });

  return goalsWithProgress;
}

export const getSavingsGoals = safeAction(getSavingsGoalsInternal);

// ============================================================================
// 3. updateSavingsGoal — Edit an existing goal
// ============================================================================

async function updateSavingsGoalInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateSavingsGoalSchema.parse(input);

  const existing = await prisma.savingsGoal.findUnique({
    where: { id: validated.goalId },
  });

  if (!existing?.isActive) {
    throw new NotFoundError('SavingsGoal', validated.goalId);
  }
  if (existing.userId !== session.userId) {
    throw new UnauthorizedError('Goal does not belong to user');
  }

  const goal = await prisma.savingsGoal.update({
    where: { id: validated.goalId },
    data: {
      name: validated.name,
      description: validated.description,
      targetAmountCents: validated.targetAmountCents,
      deadline: validated.deadline,
      monthlyContributionCents: validated.monthlyContributionCents,
      color: validated.color,
      status: validated.status,
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'savings.goal.update', goalId: goal.id, userId: session.userId },
    'Savings goal updated'
  );

  return goal;
}

export const updateSavingsGoal = safeAction(updateSavingsGoalInternal);

// ============================================================================
// 4. deleteSavingsGoal — Soft delete (only if no active contributions)
// ============================================================================

async function deleteSavingsGoalInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { goalId } = DeleteSavingsGoalSchema.parse(input);

  const existing = await prisma.savingsGoal.findUnique({
    where: { id: goalId },
    include: {
      _count: {
        select: { contributions: { where: { isActive: true } } },
      },
    },
  });

  if (!existing?.isActive) {
    throw new NotFoundError('SavingsGoal', goalId);
  }
  if (existing.userId !== session.userId) {
    throw new UnauthorizedError('Goal does not belong to user');
  }

  if (existing._count.contributions > 0) {
    throw new Error('Cannot delete a goal that has contributions. Deactivate it instead.');
  }

  await prisma.savingsGoal.update({
    where: { id: goalId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'savings.goal.delete', goalId, userId: session.userId },
    'Savings goal soft-deleted'
  );

  return { success: true, goalId };
}

export const deleteSavingsGoal = safeAction(deleteSavingsGoalInternal);

// ============================================================================
// 5. contributeToGoal — Register a contribution atomically
// ============================================================================

async function contributeToGoalInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = ContributeToGoalSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  // Rate limiting (Rule 10)
  const rateLimit = await checkApiRateLimit(session.userId, 'SAVINGS_CONTRIBUTE' as ApiAction);
  if (!rateLimit.allowed) {
    log.warn(
      { action: 'savings.contribute.rate_limited', userId: session.userId, ipAddress },
      'Savings contribution rate limited'
    );
    throw new RateLimitError();
  }

  // Idempotency check (Rule 12)
  const existing = await prisma.savingsContribution.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing) {
    log.info(
      { action: 'savings.contribute.idempotent', contributionId: existing.id },
      'Duplicate contribution request'
    );
    return { contribution: existing, wasIdempotent: true };
  }

  const result = await prisma.$transaction(async (tx) => {
    // Verify goal exists, belongs to user, and is active
    const goal = await tx.savingsGoal.findUnique({
      where: { id: validated.goalId },
      select: {
        id: true,
        userId: true,
        currentAmountCents: true,
        targetAmountCents: true,
        status: true,
        isActive: true,
        currency: true,
      },
    });

    if (!goal?.isActive) {
      throw new NotFoundError('SavingsGoal', validated.goalId);
    }
    if (goal.userId !== session.userId) {
      throw new UnauthorizedError('Goal does not belong to user');
    }
    if (goal.status === 'COMPLETED') {
      throw new Error('Cannot contribute to a completed goal');
    }

    // Optional: verify source account has sufficient funds
    if (validated.sourceAccountId) {
      const account = await tx.account.findUnique({
        where: { id: validated.sourceAccountId },
        select: {
          id: true,
          userId: true,
          balanceCents: true,
          isActive: true,
          currency: true,
        },
      });

      if (!account?.isActive) {
        throw new NotFoundError('Account', validated.sourceAccountId);
      }
      if (account.userId !== session.userId) {
        throw new UnauthorizedError('Account does not belong to user');
      }

      // Use true balance for safety (Rule 13)
      const transactionRepo = getTransactionRepository();
      const trueBalance = await getTrueBalance(validated.sourceAccountId, transactionRepo);

      if (trueBalance < validated.amountCents) {
        throw new InsufficientFundsError(validated.amountCents, trueBalance);
      }
    }

    // Create contribution record
    const contribution = await tx.savingsContribution.create({
      data: {
        goalId: validated.goalId,
        amountCents: validated.amountCents,
        currency: validated.currency,
        sourceAccountId: validated.sourceAccountId ?? null,
        notes: validated.notes ?? null,
        idempotencyKey: validated.idempotencyKey,
        ipAddress,
        userAgent,
        createdBy: session.userId,
        lastModifiedBy: session.userId,
      },
    });

    // Update goal cached balance atomically (Rule 1: Decimal.js via addCents)
    const newBalance = addCents(goal.currentAmountCents, validated.amountCents);
    const shouldComplete = newBalance >= goal.targetAmountCents;

    await tx.savingsGoal.update({
      where: { id: validated.goalId },
      data: {
        currentAmountCents: newBalance,
        ...(shouldComplete ? { status: 'COMPLETED' } : {}),
        lastModifiedBy: session.userId,
      },
    });

    return contribution;
  });

  // Record successful API attempt (best-effort)
  try {
    const attemptId = await recordApiAttempt({
      userId: session.userId,
      action: 'SAVINGS_CONTRIBUTE' as ApiAction,
      ipAddress,
    });
    await markApiAttemptSuccess(attemptId);
  } catch (err) {
    log.error({ err, userId: session.userId }, 'Failed to record API attempt');
  }

  log.info(
    {
      action: 'savings.contribute',
      contributionId: result.id,
      goalId: validated.goalId,
      userId: session.userId,
      amountCents: validated.amountCents,
    },
    'Contribution recorded'
  );

  return { contribution: result, wasIdempotent: false };
}

export const contributeToGoal = safeAction(contributeToGoalInternal);

// ============================================================================
// 6. getSavingsSummary — Aggregated savings metrics
// ============================================================================

async function getSavingsSummaryInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetSavingsSummarySchema.parse(input);

  const summary = await getSavingsSummaryService(session.userId, validated.month, validated.year);

  return summary;
}

export const getSavingsSummary = safeAction(getSavingsSummaryInternal);

// ============================================================================
// 7. calculateMaxSpendable — Max spendable for a given month
// ============================================================================

async function calculateMaxSpendableInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CalculateMaxSpendableSchema.parse(input);

  const breakdown = await getMaxSpendable(session.userId, validated.month, validated.year);

  return breakdown;
}

export const calculateMaxSpendable = safeAction(calculateMaxSpendableInternal);
