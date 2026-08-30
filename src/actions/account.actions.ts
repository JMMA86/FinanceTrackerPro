'use server';
import 'server-only';

import crypto from 'node:crypto';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { log } from '@/lib/logger';
import {
  AppError,
  NotFoundError,
  UnauthorizedError,
  AccountHasBalanceError,
} from '@/lib/errors/api-errors';
import { getTrueBalance } from '@/services/reconciliation.service';
import { getTransactionRepository } from '@/lib/repositories';
import { CreateAccountSchema, DeleteAccountSchema, UpdateAccountSchema } from './account.schema';

const BANK_TYPES = ['CHECKING', 'CASH', 'SAVINGS', 'POCKET'] as const;

async function getBankAccountsInternal(_input: Record<string, never>) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const accounts = await prisma.account.findMany({
    where: { userId: session.userId, isActive: true, type: { in: [...BANK_TYPES] } },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      type: true,
      currency: true,
      balanceCents: true,
      interestRateEA: true,
      parentAccountId: true,
      cardColor: true,
      cardNetwork: true,
      createdAt: true,
      transactions: {
        where: { isActive: true },
        orderBy: { date: 'desc' },
        take: 5,
        select: {
          id: true,
          description: true,
          amountCents: true,
          currency: true,
          type: true,
          date: true,
        },
      },
    },
  });

  return accounts.map((a) => ({
    ...a,
    interestRateEA: a.interestRateEA == null ? null : Number(a.interestRateEA),
  }));
}

export const getBankAccounts = safeAction(getBankAccountsInternal);

async function createBankAccountInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = CreateAccountSchema.parse(input);

  // Verify user exists (session cookie may outlive a DB reset)
  const userExists = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, language: true },
  });
  if (!userExists) {
    throw new AppError(
      'Your session is no longer valid. Please log out and sign in again.',
      401,
      'SESSION_INVALID'
    );
  }

  const openingDescription =
    userExists.language === 'ENGLISH' ? 'Initial balance' : 'Saldo inicial';

  const existing = await prisma.account.findUnique({
    where: { idempotencyKey: validated.idempotencyKey },
  });
  if (existing) {
    log.info({ action: 'account.create.idempotent', accountId: existing.id }, 'Duplicate request');
    return { account: existing, wasIdempotent: true };
  }

  const headersList = await headers();
  const ipAddress = headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? 'unknown';
  const userAgent = headersList.get('user-agent') ?? 'unknown';

  let account;
  try {
    account = await prisma.$transaction(async (tx) => {
      const newAccount = await tx.account.create({
        data: {
          userId: session.userId,
          name: validated.name,
          type: validated.type,
          currency: validated.currency,
          balanceCents: validated.initialBalanceCents,
          interestRateEA: validated.interestRateEA,
          parentAccountId: validated.parentAccountId,
          cardColor: validated.cardColor,
          cardNetwork: validated.cardNetwork ?? 'NONE',
          idempotencyKey: validated.idempotencyKey,
          createdBy: session.userId,
          lastModifiedBy: session.userId,
        },
      });

      if (newAccount.balanceCents > 0) {
        await tx.transaction.create({
          data: {
            idempotencyKey: crypto.randomUUID(),
            userId: session.userId,
            accountId: newAccount.id,
            type: 'INCOME',
            amountCents: newAccount.balanceCents,
            currency: newAccount.currency,
            description: openingDescription,
            date: new Date(),
            ipAddress,
            userAgent,
            createdBy: session.userId,
            lastModifiedBy: session.userId,
          },
        });
      }

      return newAccount;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') {
      throw new AppError(
        'Your session is no longer valid. Please log out and sign in again.',
        401,
        'SESSION_INVALID'
      );
    }
    throw err;
  }

  log.info(
    {
      action: 'account.create',
      accountId: account.id,
      type: account.type,
      userId: session.userId,
      ipAddress,
      userAgent,
    },
    'Account created'
  );

  revalidatePath('/[lang]/accounts', 'page');
  revalidatePath('/[lang]/dashboard', 'page');
  return {
    account: {
      ...account,
      interestRateEA: account.interestRateEA == null ? null : Number(account.interestRateEA),
    },
    wasIdempotent: false,
  };
}

export const createBankAccount = safeAction(createBankAccountInternal);

async function updateBankAccountInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const validated = UpdateAccountSchema.parse(input);

  const account = await prisma.account.findUnique({ where: { id: validated.accountId } });
  if (!account?.isActive) throw new NotFoundError('Account', validated.accountId);
  if (account.userId !== session.userId) throw new UnauthorizedError();

  const updated = await prisma.account.update({
    where: { id: validated.accountId },
    data: {
      ...(validated.name !== undefined && { name: validated.name }),
      ...(validated.interestRateEA !== undefined && { interestRateEA: validated.interestRateEA }),
      ...(validated.cardColor !== undefined && { cardColor: validated.cardColor }),
      ...(validated.cardNetwork !== undefined && { cardNetwork: validated.cardNetwork }),
      lastModifiedBy: session.userId,
    },
  });

  log.info(
    { action: 'account.update', accountId: updated.id, userId: session.userId },
    'Account updated'
  );
  revalidatePath('/[lang]/accounts', 'page');
  return {
    account: {
      ...updated,
      interestRateEA: updated.interestRateEA == null ? null : Number(updated.interestRateEA),
    },
  };
}

export const updateBankAccount = safeAction(updateBankAccountInternal);

async function deleteBankAccountInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { accountId } = DeleteAccountSchema.parse(input);

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account?.isActive) throw new NotFoundError('Account', accountId);
  if (account.userId !== session.userId) throw new UnauthorizedError();

  // Regla de integridad: solo se elimina con saldo REAL 0 (Rule 13 — fuente de verdad)
  const transactionRepo = getTransactionRepository();
  const trueBalance = await getTrueBalance(accountId, transactionRepo);
  if (trueBalance !== 0) {
    throw new AccountHasBalanceError(accountId, trueBalance);
  }

  // Pockets del padre deben estar en 0
  const pockets = await prisma.account.findMany({
    where: { parentAccountId: accountId, isActive: true },
    select: { id: true, name: true },
  });
  for (const pocket of pockets) {
    const pocketBalance = await getTrueBalance(pocket.id, transactionRepo);
    if (pocketBalance !== 0) {
      throw new AppError(
        `Pocket "${pocket.name}" still has a balance. Move its funds before deleting this account`,
        400,
        'POCKET_HAS_BALANCE'
      );
    }
  }

  // Cuentas de inversión: sin asset holdings activos
  const holdingsCount = await prisma.investmentAssetHolding.count({
    where: { accountId, isActive: true },
  });
  if (holdingsCount > 0) {
    throw new AppError(
      'Sell your assets before deleting this investment account',
      400,
      'ACCOUNT_HAS_HOLDINGS'
    );
  }

  await prisma.account.update({
    where: { id: accountId },
    data: { isActive: false, deletedAt: new Date(), lastModifiedBy: session.userId },
  });

  log.info({ action: 'account.delete', accountId, userId: session.userId }, 'Account soft-deleted');
  // No revalidatePath here — the client controls refresh timing to allow close animation.
  // BankAccountsSection calls router.refresh() after the animation completes.
}

export const deleteBankAccount = safeAction(deleteBankAccountInternal);
