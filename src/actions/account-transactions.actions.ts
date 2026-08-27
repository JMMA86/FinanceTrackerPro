'use server';
import 'server-only';

import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import { safeAction } from '@/lib/utils/action-wrapper';
import { UnauthorizedError, NotFoundError } from '@/lib/errors/api-errors';
import { z } from 'zod';
import { CUID } from './account.schema';

const PAGE_SIZE = 10;

const TX_TYPE = z.enum([
  'INCOME',
  'EXPENSE',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'INVESTMENT',
  'LOAN_PAYMENT',
  'CREDIT_PAYMENT',
]);

const GetTransactionsSchema = z.object({
  accountId: CUID,
  page: z.number().int().min(1).default(1),
  search: z.string().max(100).optional(),
  typeFilter: TX_TYPE.optional(),
});

async function getAccountTransactionsInternal(input: unknown) {
  const session = await getSession();
  if (!session?.userId) throw new UnauthorizedError();

  const { accountId, page, search, typeFilter } = GetTransactionsSchema.parse(input);

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { userId: true },
  });
  if (!account) throw new NotFoundError('Account', accountId);
  if (account.userId !== session.userId) throw new UnauthorizedError();

  const where = {
    accountId,
    isActive: true,
    ...(search ? { description: { contains: search, mode: 'insensitive' as const } } : {}),
    ...(typeFilter ? { type: typeFilter } : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        description: true,
        amountCents: true,
        currency: true,
        type: true,
        date: true,
      },
    }),
    prisma.transaction.count({ where }),
  ]);

  return {
    transactions,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export const getAccountTransactions = safeAction(getAccountTransactionsInternal);
