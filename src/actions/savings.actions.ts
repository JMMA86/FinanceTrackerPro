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

import { Prisma, type ApiAction, type SavingsContribution } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { subtractCents } from '@/lib/money';
import { getTrueBalanceFromTx } from '@/services/reconciliation.service';
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
  CurrencyMismatchError,
  GoalCompletedError,
  GoalCancelledError,
  GoalHasContributionsError,
  GoalTargetBelowCurrentError,
  GoalCannotCompleteError,
} from '@/lib/errors/api-errors';
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
  getMaxSpendable,
  getSavingsGoalsWithProgress,
  getSavingsSummary as getSavingsSummaryService,
  serializeContribution,
  serializeGoal,
} from '@/services/savings.service';

// ============================================================================
// 1. createSavingsGoal — Create a new savings goal
// ============================================================================

async function createSavingsGoalInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateSavingsGoalSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  // Ownership / currency validation of the optional linked account (M3):
  // it must exist and be active, belong to the session user, and match the
  // goal currency — otherwise we would silently link foreign or mixed-currency
  // money.
  if (validated.linkedAccountId) {
    const linkedAccount = await prisma.account.findUnique({
      where: { id: validated.linkedAccountId },
      select: { id: true, userId: true, isActive: true, currency: true },
    });

    if (!linkedAccount?.isActive) {
      throw new NotFoundError('Account', validated.linkedAccountId);
    }
    if (linkedAccount.userId !== session.userId) {
      throw new UnauthorizedError('Linked account does not belong to user');
    }
    if (linkedAccount.currency !== validated.currency) {
      throw new CurrencyMismatchError(validated.currency, linkedAccount.currency);
    }
  }

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
      ipAddress,
      userAgent,
    },
  });

  log.info(
    { action: 'savings.goal.create', goalId: goal.id, userId: session.userId },
    'Savings goal created'
  );

  return serializeGoal(goal);
}

export const createSavingsGoal = safeAction(createSavingsGoalInternal);

// ============================================================================
// 2. getSavingsGoals — Retrieve all goals with progress + recent contributions
// ============================================================================

async function getSavingsGoalsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetSavingsGoalsSchema.parse(input);

  // Shared read path (Rule 13 reconciliation + serialization lives in the
  // service): the page data module and this action render identical rows.
  return getSavingsGoalsWithProgress(session.userId, validated.status);
}

export const getSavingsGoals = safeAction(getSavingsGoalsInternal);

// ============================================================================
// 3. updateSavingsGoal — Edit an existing goal
// ============================================================================

async function updateSavingsGoalInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateSavingsGoalSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  const existing = await prisma.savingsGoal.findUnique({
    where: { id: validated.goalId },
  });

  if (!existing?.isActive) {
    throw new NotFoundError('SavingsGoal', validated.goalId);
  }
  if (existing.userId !== session.userId) {
    throw new UnauthorizedError('Goal does not belong to user');
  }

  const currentAmountCents = Number(existing.currentAmountCents);

  // M7: the target can never drop below what is already saved.
  if (
    validated.targetAmountCents !== undefined &&
    validated.targetAmountCents < currentAmountCents
  ) {
    throw new GoalTargetBelowCurrentError(validated.goalId);
  }

  // M7: COMPLETED is a terminal state that requires the target to be reached.
  if (validated.status === 'COMPLETED' && currentAmountCents < Number(existing.targetAmountCents)) {
    throw new GoalCannotCompleteError();
  }

  const goal = await prisma.savingsGoal.update({
    where: { id: validated.goalId },
    data: {
      name: validated.name,
      description: validated.description,
      targetAmountCents: validated.targetAmountCents,
      deadline: validated.deadline,
      // Ítem D: distinguishes `undefined` (field absent → not touched) from
      // `null` (client explicitly clears the monthly plan → persisted as NULL).
      monthlyContributionCents: validated.monthlyContributionCents,
      color: validated.color,
      status: validated.status,
      lastModifiedBy: session.userId,
      ipAddress,
      userAgent,
    },
  });

  log.info(
    { action: 'savings.goal.update', goalId: goal.id, userId: session.userId },
    'Savings goal updated'
  );

  return serializeGoal(goal);
}

export const updateSavingsGoal = safeAction(updateSavingsGoalInternal);

// ============================================================================
// 4. deleteSavingsGoal — Soft delete (only if no active contributions)
// ============================================================================

async function deleteSavingsGoalInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { goalId } = DeleteSavingsGoalSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

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

  // Still blocked by the new DB-level FK ON DELETE RESTRICT; the explicit check
  // gives users a clean error before we even attempt the soft delete.
  if (existing._count.contributions > 0) {
    throw new GoalHasContributionsError();
  }

  await prisma.savingsGoal.update({
    where: { id: goalId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      lastModifiedBy: session.userId,
      ipAddress,
      userAgent,
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

  /**
   * Idempotency is verified INSIDE the transaction (Rule 12): a duplicate that
   * races past this point will fail on the unique constraint (P2002) and be
   * resolved below without touching balances. Mirrors transfer.actions.ts.
   */
  let outcome: { contribution: SavingsContribution; wasIdempotent: boolean };

  try {
    outcome = await prisma.$transaction(async (tx) => {
      // 1. In-transaction idempotency check. The lookup is scoped to the
      //    current user + goal so a key collision from ANOTHER user or goal
      //    (which cannot realistically happen since idempotencyKey is a global
      //    UUID unique constraint) is never silently treated as this request's
      //    duplicate — we would otherwise hand back a foreign contribution.
      //    The full row is fetched (no `select`) so the idempotent branch
      //    returns a complete SavingsContribution matching the declared shape.
      const existing = await tx.savingsContribution.findUnique({
        where: { idempotencyKey: validated.idempotencyKey },
      });
      if (existing?.createdBy === session.userId && existing.goalId === validated.goalId) {
        log.info(
          { action: 'savings.contribute.idempotent', contributionId: existing.id },
          'Duplicate contribution request'
        );
        return { contribution: existing, wasIdempotent: true };
      }
      // If an existing row exists but does NOT match user+goal, it is not our
      // duplicate — continue and let the create hit the unique constraint.
      if (existing) {
        log.warn(
          {
            action: 'savings.contribute.idempotency_key_collision',
            existingGoalId: existing.goalId,
            existingCreatedBy: existing.createdBy,
            requestedGoalId: validated.goalId,
            requestedUserId: session.userId,
          },
          'Idempotency key collision: existing row does not belong to this user/goal'
        );
      }

      // 2. Verify goal exists, belongs to user, is active and not terminal
      const goal = await tx.savingsGoal.findUnique({
        where: { id: validated.goalId },
        select: {
          id: true,
          name: true,
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
        throw new GoalCompletedError();
      }
      if (goal.status === 'CANCELLED') {
        throw new GoalCancelledError();
      }

      // Verify goal currency matches contribution currency
      if (validated.currency !== goal.currency) {
        throw new CurrencyMismatchError(goal.currency, validated.currency);
      }

      // 3. Lock the source account row (SELECT ... FOR UPDATE) so concurrent
      //    contributions from the same account serialize here (TOCTOU safety).
      const lockedRows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Account" WHERE id = ${validated.sourceAccountId} FOR UPDATE
      `;
      if (lockedRows.length === 0) {
        throw new NotFoundError('Account', validated.sourceAccountId);
      }

      // 4. Re-read account under the lock and verify ownership/currency
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
      if (validated.currency !== account.currency) {
        throw new CurrencyMismatchError(account.currency, validated.currency);
      }

      // 5. Source-of-truth funds check from the transactional snapshot (Rule 13)
      const sourceTrueBalance = await getTrueBalanceFromTx(tx, validated.sourceAccountId);
      if (sourceTrueBalance < validated.amountCents) {
        throw new InsufficientFundsError(validated.amountCents, sourceTrueBalance);
      }

      // 6. Create the linked EXPENSE transaction REUSING the contribution
      //    idempotency key so a network-level retry cannot double-create it.
      const transaction = await tx.transaction.create({
        data: {
          idempotencyKey: validated.idempotencyKey,
          userId: session.userId,
          accountId: validated.sourceAccountId,
          type: 'EXPENSE',
          amountCents: -validated.amountCents,
          currency: validated.currency,
          description: `Contribución a ${goal.name}`,
          date: new Date(),
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 7. Create contribution record
      const contribution = await tx.savingsContribution.create({
        data: {
          goalId: validated.goalId,
          amountCents: validated.amountCents,
          currency: validated.currency,
          sourceAccountId: validated.sourceAccountId,
          transactionId: transaction.id,
          notes: validated.notes ?? null,
          idempotencyKey: validated.idempotencyKey,
          ipAddress,
          userAgent,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      // 8. Update goal cached balance with an atomic increment, then re-read to
      //    auto-complete if the target was reached.
      await tx.savingsGoal.update({
        where: { id: validated.goalId },
        data: {
          currentAmountCents: { increment: validated.amountCents },
          lastModifiedBy: session.userId,
          ipAddress,
          userAgent,
        },
      });

      const updatedGoal = await tx.savingsGoal.findUnique({
        where: { id: validated.goalId },
        select: { id: true, status: true, currentAmountCents: true, targetAmountCents: true },
      });

      if (
        updatedGoal?.status === 'ACTIVE' &&
        Number(updatedGoal.currentAmountCents) >= Number(updatedGoal.targetAmountCents)
      ) {
        await tx.savingsGoal.update({
          where: { id: validated.goalId },
          data: { status: 'COMPLETED', lastModifiedBy: session.userId },
        });
      }

      // 9. Reduce cached source account balance (Rule 13 - maintain cache)
      const newAccountBalance = subtractCents(Number(account.balanceCents), validated.amountCents);
      await tx.account.update({
        where: { id: validated.sourceAccountId },
        data: {
          balanceCents: newAccountBalance,
          lastModifiedBy: session.userId,
        },
      });

      return { contribution, wasIdempotent: false };
    });
  } catch (error) {
    // A concurrent duplicate raced past the in-tx check and hit the unique
    // constraint on SavingsContribution.idempotencyKey OR
    // Transaction.idempotencyKey. Resolve it as an idempotent success.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const existing = await prisma.savingsContribution.findUnique({
        where: { idempotencyKey: validated.idempotencyKey },
      });
      // Only treat the existing row as OUR duplicate if it actually belongs to
      // this user AND this goal. A collision with a foreign row must NOT be
      // resolved as idempotent (we would expose another user's data) — rethrow
      // the unique-violation as a generic, safe conflict.
      if (existing?.createdBy === session.userId && existing.goalId === validated.goalId) {
        log.info(
          { action: 'savings.contribute.idempotent', contributionId: existing.id },
          'Duplicate contribution resolved after unique violation'
        );
        outcome = { contribution: existing, wasIdempotent: true };
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }

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
      contributionId: outcome.contribution.id,
      goalId: validated.goalId,
      userId: session.userId,
      amountCents: validated.amountCents,
      wasIdempotent: outcome.wasIdempotent,
    },
    'Contribution recorded'
  );

  return {
    contribution: serializeContribution(outcome.contribution),
    wasIdempotent: outcome.wasIdempotent,
  };
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
