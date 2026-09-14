/**
 * Variable Expense Definitions — Server Actions
 *
 * CRUD for the user-defined monitored variable expenses ("Fútbol", "Salidas
 * Novia", ...). `getVariableExpenses` is also consumed by the transaction form
 * to link a new EXPENSE to a monitored definition.
 *
 * RULE 4: Soft deletes + audit trail (createdBy, lastModifiedBy, ip, userAgent)
 * RULE 5: Zod validation server-side
 */

'use server';
import 'server-only';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import { getClientInfo } from '@/lib/utils/client-info';
import { NotFoundError, UnauthorizedError, ValidationError } from '@/lib/errors/api-errors';
import type { Prisma } from '@prisma/client';
import {
  CreateVariableExpenseSchema,
  DeleteVariableExpenseSchema,
  GetVariableExpenseDetailSchema,
  GetVariableExpenseMovementsSchema,
  GetVariableExpensesOverviewSchema,
  GetVariableExpensesSchema,
  UpdateVariableExpenseSchema,
} from './variable-expense.schema';
import {
  getVariableExpenseDefinitions,
  getVariableExpenseDetail as getVariableExpenseDetailService,
  getVariableExpenseMovements as getVariableExpenseMovementsService,
  getVariableExpensesOverview as getVariableExpensesOverviewService,
  serializeVariableExpenseDefinition,
} from '@/services/variable-expense.service';

function revalidateVariableExpensePaths(): void {
  revalidatePath('/[lang]/variable-expenses', 'page');
  revalidatePath('/[lang]/transactions', 'page');
  revalidatePath('/[lang]/dashboard', 'page');
}

const CATEGORY_SELECT = { select: { id: true, name: true, color: true } } as const;

/**
 * Verify the configured category exists, is active and is either a system
 * category (`userId === null`) or owned by the user.
 */
async function validateCategory(
  client: Prisma.TransactionClient,
  categoryId: string,
  userId: string
): Promise<void> {
  const category = await client.category.findUnique({
    where: { id: categoryId },
    select: { id: true, isActive: true, userId: true },
  });

  if (!category?.isActive) throw new NotFoundError('Category', categoryId);
  if (category.userId !== null && category.userId !== userId) {
    throw new UnauthorizedError('Category does not belong to user');
  }
}

// ============================================================================
// createVariableExpense — Create a monitored definition
// ============================================================================

async function createVariableExpenseInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateVariableExpenseSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  const duplicate = await prisma.variableExpense.findFirst({
    where: { userId: session.userId, name: validated.name, isActive: true },
    select: { id: true },
  });
  if (duplicate) {
    throw new ValidationError('A variable expense with this name already exists');
  }

  await validateCategory(prisma, validated.categoryId, session.userId);

  const definition = await prisma.variableExpense.create({
    data: {
      userId: session.userId,
      name: validated.name,
      description: validated.description ?? null,
      color: validated.color ?? null,
      icon: validated.icon ?? null,
      categoryId: validated.categoryId,
      expectedTimesPerMonth: validated.expectedTimesPerMonth ?? null,
      expectedAmountCents: validated.expectedAmountCents ?? null,
      currency: validated.currency,
      createdBy: session.userId,
      lastModifiedBy: session.userId,
      ipAddress,
      userAgent,
    },
    include: { category: CATEGORY_SELECT },
  });

  log.info(
    { action: 'variableExpense.create', variableExpenseId: definition.id, userId: session.userId },
    'Variable expense definition created'
  );

  revalidateVariableExpensePaths();

  return serializeVariableExpenseDefinition(definition);
}

export const createVariableExpense = safeAction(createVariableExpenseInternal);

// ============================================================================
// updateVariableExpense — Edit own definition
// ============================================================================

async function updateVariableExpenseInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateVariableExpenseSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.variableExpense.findUnique({
      where: { id: validated.variableExpenseId },
    });

    if (!existing?.isActive) {
      throw new NotFoundError('VariableExpense', validated.variableExpenseId);
    }
    if (existing.userId !== session.userId) {
      throw new UnauthorizedError('Variable expense does not belong to user');
    }

    // Changing the currency would silently re-bucket already-linked history, so
    // it is only allowed while the definition has no active transactions.
    if (validated.currency !== undefined && validated.currency !== existing.currency) {
      const linkedTransactions = await tx.transaction.count({
        where: { variableExpenseId: validated.variableExpenseId, isActive: true },
      });
      if (linkedTransactions > 0) {
        throw new ValidationError(
          'Cannot change currency of a variable expense with linked transactions'
        );
      }
    }

    if (validated.categoryId !== undefined) {
      await validateCategory(tx, validated.categoryId, session.userId);
    }

    return tx.variableExpense.update({
      where: { id: validated.variableExpenseId },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        // null explicitly clears the target (distinct from undefined = untouched).
        ...(validated.description !== undefined && { description: validated.description }),
        ...(validated.color !== undefined && { color: validated.color }),
        ...(validated.icon !== undefined && { icon: validated.icon }),
        ...(validated.categoryId !== undefined && { categoryId: validated.categoryId }),
        ...(validated.expectedTimesPerMonth !== undefined && {
          expectedTimesPerMonth: validated.expectedTimesPerMonth,
        }),
        ...(validated.expectedAmountCents !== undefined && {
          expectedAmountCents: validated.expectedAmountCents,
        }),
        ...(validated.currency !== undefined && { currency: validated.currency }),
        lastModifiedBy: session.userId,
        ipAddress,
        userAgent,
      },
      include: { category: CATEGORY_SELECT },
    });
  });

  log.info(
    { action: 'variableExpense.update', variableExpenseId: updated.id, userId: session.userId },
    'Variable expense definition updated'
  );

  revalidateVariableExpensePaths();

  return serializeVariableExpenseDefinition(updated);
}

export const updateVariableExpense = safeAction(updateVariableExpenseInternal);

// ============================================================================
// deleteVariableExpense — Soft delete own definition
// ============================================================================

async function deleteVariableExpenseInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { variableExpenseId } = DeleteVariableExpenseSchema.parse(input);
  const { ipAddress, userAgent } = await getClientInfo();

  const existing = await prisma.variableExpense.findUnique({
    where: { id: variableExpenseId },
  });

  if (!existing?.isActive) throw new NotFoundError('VariableExpense', variableExpenseId);
  if (existing.userId !== session.userId)
    throw new UnauthorizedError('Variable expense does not belong to user');

  await prisma.variableExpense.update({
    where: { id: variableExpenseId },
    data: {
      isActive: false,
      deletedAt: new Date(),
      lastModifiedBy: session.userId,
      ipAddress,
      userAgent,
    },
  });

  log.info(
    { action: 'variableExpense.delete', variableExpenseId, userId: session.userId },
    'Variable expense definition soft-deleted'
  );

  revalidateVariableExpensePaths();

  return { success: true, variableExpenseId };
}

export const deleteVariableExpense = safeAction(deleteVariableExpenseInternal);

// ============================================================================
// getVariableExpenses — Definitions (consumed by the transaction form)
// ============================================================================

async function getVariableExpensesInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetVariableExpensesSchema.parse(input ?? {});

  return getVariableExpenseDefinitions(session.userId, validated.includeInactive ?? false);
}

export const getVariableExpenses = safeAction(getVariableExpensesInternal);

// ============================================================================
// getVariableExpensesOverview — Monthly breakdown per definition
// ============================================================================

async function getVariableExpensesOverviewInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetVariableExpensesOverviewSchema.parse(input);

  return getVariableExpensesOverviewService(session.userId, validated.month, validated.year);
}

export const getVariableExpensesOverview = safeAction(getVariableExpensesOverviewInternal);

// ============================================================================
// getVariableExpenseDetail — One definition for a month
// ============================================================================

async function getVariableExpenseDetailInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetVariableExpenseDetailSchema.parse(input);

  return getVariableExpenseDetailService(
    session.userId,
    validated.variableExpenseId,
    validated.month,
    validated.year
  );
}

export const getVariableExpenseDetail = safeAction(getVariableExpenseDetailInternal);

// ============================================================================
// getVariableExpenseMovements — Movements filtered by month and/or definition
// ============================================================================

async function getVariableExpenseMovementsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = GetVariableExpenseMovementsSchema.parse(input ?? {});

  return getVariableExpenseMovementsService(session.userId, {
    variableExpenseId: validated.variableExpenseId,
    month: validated.month,
    year: validated.year,
  });
}

export const getVariableExpenseMovements = safeAction(getVariableExpenseMovementsInternal);
