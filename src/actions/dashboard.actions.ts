/**
 * Dashboard Data Server Actions
 * Fetches real financial data for the dashboard
 */

'use server';
import 'server-only';

import { prisma } from '@/lib/db';
import { getTrueBalance } from '@/services/reconciliation.service';
import { getTransactionRepository } from '@/lib/repositories';
import { formatMoney } from '@/lib/money';
import { getSession } from '@/lib/auth/session';
import type { Currency } from '@prisma/client';

interface DashboardMetrics {
  totalBalance: { amount: number; formatted: string; currency: Currency };
  totalIncome: { amount: number; formatted: string; currency: Currency };
  totalExpenses: { amount: number; formatted: string; currency: Currency };
  investments: { amount: number; formatted: string; currency: Currency };
  recentTransactions: Array<{
    id: string;
    description: string | null;
    amount: number;
    currency: Currency;
    type: string;
    date: Date;
  }>;
}

function getEmptyMetrics(): DashboardMetrics {
  return {
    totalBalance: { amount: 0, formatted: '$0', currency: 'COP' },
    totalIncome: { amount: 0, formatted: '$0', currency: 'COP' },
    totalExpenses: { amount: 0, formatted: '$0', currency: 'COP' },
    investments: { amount: 0, formatted: '$0', currency: 'USD' },
    recentTransactions: [],
  };
}

function getLocale(language: string): string {
  switch (language) {
    case 'es':
      return 'es-CO';
    case 'de':
      return 'de-DE';
    default:
      return 'en-US';
  }
}

/**
 * Get dashboard metrics for current authenticated user
 */
export async function getDashboardMetrics(lang: string): Promise<DashboardMetrics> {
  const session = await getSession();
  if (!session?.userId) {
    return getEmptyMetrics();
  }

  return getDashboardMetricsByUser(session.userId, lang);
}

/**
 * Get dashboard metrics by user ID
 */
export async function getDashboardMetricsByUser(userId: string, lang: string): Promise<DashboardMetrics> {
  const transactionRepo = getTransactionRepository();

  const accounts = await prisma.account.findMany({
    where: {
      userId,
      isActive: true,
    },
    select: {
      id: true,
      balanceCents: true,
      currency: true,
      type: true,
    },
  });

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: { date: 'desc' },
    take: 10,
    select: {
      id: true,
      description: true,
      amountCents: true,
      currency: true,
      type: true,
      date: true,
    },
  });

  let totalBalance = 0;
  let totalIncome = 0;
  let totalExpenses = 0;
  let investments = 0;
  const defaultCurrency: Currency = 'COP';

  for (const account of accounts) {
    const trueBalance = await getTrueBalance(account.id, transactionRepo);
    totalBalance += trueBalance;

    if (account.type === 'INVESTMENT') {
      investments += trueBalance;
    }
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  for (const tx of transactions) {
    if (tx.date >= startOfMonth) {
      if (tx.amountCents > 0 && (tx.type === 'INCOME' || tx.type === 'TRANSFER_IN')) {
        totalIncome += tx.amountCents;
      } else if (tx.amountCents < 0 && (tx.type === 'EXPENSE' || tx.type === 'TRANSFER_OUT')) {
        totalExpenses += Math.abs(tx.amountCents);
      }
    }
}

  const locale = getLocale(lang);

  return {
    totalBalance: {
      amount: totalBalance,
      formatted: formatMoney(totalBalance, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    totalIncome: {
      amount: totalIncome,
      formatted: formatMoney(totalIncome, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    totalExpenses: {
      amount: totalExpenses,
      formatted: formatMoney(totalExpenses, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    investments: {
      amount: investments,
      formatted: formatMoney(investments, 'USD', locale),
      currency: 'USD',
    },
    recentTransactions: transactions.map((tx) => ({
      id: tx.id,
      description: tx.description,
      amount: tx.amountCents,
      currency: tx.currency,
      type: tx.type,
      date: tx.date,
    })),
  };
}