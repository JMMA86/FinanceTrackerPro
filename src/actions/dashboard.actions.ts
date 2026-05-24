/**
 * Dashboard Data Server Actions
 * Fetches real financial data for the dashboard - 15 Financial Metrics
 */

'use server';
import 'server-only';

import { prisma } from '@/lib/db';
import { getTrueBalance } from '@/services/reconciliation.service';
import { getMaxSpendable, getSavingsSummary } from '@/services/savings.service';
import { getTransactionRepository } from '@/lib/repositories';
import { formatMoney, addCents, subtractCents } from '@/lib/money';
import Decimal from 'decimal.js';
import { getSession } from '@/lib/auth/session';
import type { Currency } from '@prisma/client';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

interface DistributionItem {
  categoryKey: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface DashboardMetrics {
  // Resumen Ejecutivo
  netWorth: { amount: number; formatted: string; currency: Currency };
  maxSpendable: { amount: number; formatted: string; currency: Currency };
  savingsComparison: { amount: number; formatted: string; isPositive: boolean; percentage: number };

  // Liquidez
  totalCash: { amount: number; formatted: string; currency: Currency };
  savings: { amount: number; formatted: string; currency: Currency };
  receivables: { amount: number; formatted: string; currency: Currency };

  // Deudas
  creditCardDebt: { amount: number; formatted: string; currency: Currency };
  creditAvailable: { amount: number; formatted: string; currency: Currency };
  externalDebts: { amount: number; formatted: string; currency: Currency };

  // Inversiones
  investments: { amount: number; formatted: string; currency: Currency };
  maxInterestRate: { amount: number; formatted: string };
  dollarRate: { amount: number; formatted: string };

  // Gastos
  monthlyExpenses: { amount: number; formatted: string; currency: Currency };
  pendingFixedExpenses: { amount: number; formatted: string; currency: Currency };

  // Savings
  activeSavingsGoals: number;
  totalSavedCents: { amount: number; formatted: string; currency: Currency };
  savingsProgress: number;

  // Distribución patrimonial
  netWorthDistribution: DistributionItem[];

  // Sparkline data for trend visualization
  sparklines: Record<string, number[]>;

  // Transacciones recientes
  recentTransactions: Array<{
    id: string;
    description: string | null;
    amount: number;
    currency: Currency;
    type: string;
    date: Date;
  }>;
}

interface AccountData {
  id: string;
  name: string;
  balanceCents: number;
  currency: Currency;
  type: string;
  creditLimitCents: number | null;
  interestRateEA: number | Decimal | null;
}

interface LoanData {
  id: string;
  name: string;
  balanceCents: number;
}

interface TransactionData {
  id: string;
  description: string | null;
  amountCents: number;
  currency: Currency;
  type: string;
  date: Date;
}

interface FixedExpenseData {
  expectedAmountCents: number;
  currency: Currency;
}

interface AccountMetricsResult {
  netWorth: number;
  totalCash: number;
  savingsBalance: number;
  investmentsBalance: number;
  creditCardDebt: number;
  creditLimitTotal: number;
  maxInterestRate: number;
  distribution: Record<string, number>;
}

function getEmptyMetrics(): DashboardMetrics {
  const defaultCurrency: Currency = 'COP';
  return {
    // Resumen Ejecutivo
    netWorth: { amount: 0, formatted: '$0', currency: defaultCurrency },
    maxSpendable: { amount: 0, formatted: '$0', currency: defaultCurrency },
    savingsComparison: { amount: 0, formatted: '0%', isPositive: true, percentage: 0 },
    // Liquidez
    totalCash: { amount: 0, formatted: '$0', currency: defaultCurrency },
    savings: { amount: 0, formatted: '$0', currency: defaultCurrency },
    receivables: { amount: 0, formatted: '$0', currency: defaultCurrency },
    // Deudas
    creditCardDebt: { amount: 0, formatted: '$0', currency: defaultCurrency },
    creditAvailable: { amount: 0, formatted: '$0', currency: defaultCurrency },
    externalDebts: { amount: 0, formatted: '$0', currency: defaultCurrency },
    // Inversiones
    investments: { amount: 0, formatted: '$0', currency: 'USD' },
    maxInterestRate: { amount: 0, formatted: '0.00%' },
    dollarRate: { amount: 0, formatted: '--' },
    // Gastos
    monthlyExpenses: { amount: 0, formatted: '$0', currency: defaultCurrency },
    pendingFixedExpenses: { amount: 0, formatted: '$0', currency: defaultCurrency },
    // Savings
    activeSavingsGoals: 0,
    totalSavedCents: { amount: 0, formatted: '$0', currency: defaultCurrency },
    savingsProgress: 0,
    // Distribución
    netWorthDistribution: [],
    // Sparklines
    sparklines: {},
    // Transacciones
    recentTransactions: [],
  };
}

function getLocale(language: string): string {
  if (language === 'es') {
    return 'es-CO';
  }
  return 'en-US';
}

// ===== Helper Functions =====

/**
 * Process accounts and calculate account-related metrics
 */
async function calculateAccountMetrics(
  accounts: AccountData[],
  transactionRepo: ReturnType<typeof getTransactionRepository>
): Promise<AccountMetricsResult> {
  const result: AccountMetricsResult = {
    netWorth: 0,
    totalCash: 0,
    savingsBalance: 0,
    investmentsBalance: 0,
    creditCardDebt: 0,
    creditLimitTotal: 0,
    maxInterestRate: 0,
    distribution: {
      savings: 0,
      investments: 0,
      creditCards: 0,
      pocket: 0,
    },
  };

  for (const account of accounts) {
    const trueBalance = await getTrueBalance(account.id, transactionRepo);
    const accountType = account.type;

    if (accountType === 'CREDIT_CARD') {
      processCreditCardAccount(account, trueBalance, result);
    } else {
      processAssetAccount(account, trueBalance, result);
    }
  }

  return result;
}

function processCreditCardAccount(
  account: AccountData,
  trueBalance: number,
  result: AccountMetricsResult
): void {
  const absBalance = Math.abs(trueBalance);

  if (trueBalance < 0) {
    // Negative balance = money owed
    result.creditCardDebt = addCents(result.creditCardDebt, absBalance);
    result.netWorth = subtractCents(result.netWorth, absBalance);
    result.distribution.creditCards = addCents(result.distribution.creditCards, absBalance);
  } else {
    // Positive balance = credit in favor
    result.netWorth = addCents(result.netWorth, trueBalance);
    result.distribution.creditCards = addCents(result.distribution.creditCards, trueBalance);
  }

  if (account.creditLimitCents) {
    result.creditLimitTotal = addCents(result.creditLimitTotal, account.creditLimitCents);
  }
}

function processAssetAccount(
  account: AccountData,
  trueBalance: number,
  result: AccountMetricsResult
): void {
  const accountTypeLower = account.type.toLowerCase();
  result.netWorth = addCents(result.netWorth, trueBalance);

  if (result.distribution[accountTypeLower] !== undefined) {
    result.distribution[accountTypeLower] = addCents(result.distribution[accountTypeLower], trueBalance);
  }

  if (account.type === 'SAVINGS') {
    result.totalCash = addCents(result.totalCash, trueBalance);
    result.savingsBalance = addCents(result.savingsBalance, trueBalance);
    let rateAsNumber: number | null = null;
    if (account.interestRateEA != null) {
      rateAsNumber = typeof account.interestRateEA === 'number'
        ? account.interestRateEA
        : Number(account.interestRateEA);
    }
    updateMaxInterestRate(rateAsNumber, result);
  } else if (account.type === 'INVESTMENT') {
    result.investmentsBalance = addCents(result.investmentsBalance, trueBalance);
  } else if (account.type === 'POCKET') {
    result.totalCash = addCents(result.totalCash, trueBalance);
  }
}

function updateMaxInterestRate(rate: number | null, result: AccountMetricsResult): void {
  if (rate && rate > result.maxInterestRate) {
    result.maxInterestRate = rate;
  }
}

/**
 * Calculate external debts from loans
 */
function calculateLoanMetrics(loans: LoanData[]): number {
  let externalDebts = 0;
  for (const loan of loans) {
    if (loan.balanceCents > 0) {
      externalDebts = addCents(externalDebts, loan.balanceCents);
    }
  }
  return externalDebts;
}

/**
 * Calculate transaction metrics for income and expenses
 */
function calculateTransactionMetrics(
  transactions: TransactionData[],
  startOfCurrentMonth: Date,
  startOfLastMonth: Date,
  endOfLastMonth: Date
): { monthlyIncome: number; monthlyExpenses: number; lastMonthExpenses: number } {
  let monthlyIncome = 0;
  let monthlyExpenses = 0;
  let lastMonthExpenses = 0;

  for (const tx of transactions) {
    const isCurrentMonth = tx.date >= startOfCurrentMonth;
    const isLastMonth = tx.date >= startOfLastMonth && tx.date <= endOfLastMonth;
    const isIncome = tx.amountCents > 0 && (tx.type === 'INCOME' || tx.type === 'TRANSFER_IN');
    const isExpense = tx.amountCents < 0 && (tx.type === 'EXPENSE' || tx.type === 'TRANSFER_OUT');

    if (isCurrentMonth && isIncome) {
      monthlyIncome = addCents(monthlyIncome, tx.amountCents);
    } else if (isCurrentMonth && isExpense) {
      monthlyExpenses = addCents(monthlyExpenses, Math.abs(tx.amountCents));
    } else if (isLastMonth && isExpense) {
      lastMonthExpenses = addCents(lastMonthExpenses, Math.abs(tx.amountCents));
    }
  }

  return { monthlyIncome, monthlyExpenses, lastMonthExpenses };
}

/**
 * Calculate pending fixed expenses total
 */
function calculatePendingFixedExpenses(pendingExpenses: FixedExpenseData[]): number {
  let total = 0;
  for (const expense of pendingExpenses) {
    total = addCents(total, expense.expectedAmountCents);
  }
  return total;
}

/**
 * Build net worth distribution array
 */
function buildDistribution(distribution: Record<string, number>): DistributionItem[] {
  const distributionColors: Record<string, string> = {
    savings: '#2f7cf6',
    investments: '#10b981',
    creditCards: '#ef4444',
    pocket: '#8b5cf6',
  };

  const totalDistribution = Object.values(distribution).reduce(
    (sum, val) => addCents(sum, val),
    0
  );

  return Object.entries(distribution)
    .filter(([, amount]) => amount > 0)
    .map(([categoryKey, amount]) => ({
      categoryKey,
      amount,
      percentage: totalDistribution > 0 ? (amount / totalDistribution) * 100 : 0,
      color: distributionColors[categoryKey] || '#6b7280',
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Build recent transactions array
 */
function buildRecentTransactions(
  transactions: TransactionData[]
): Array<{
  id: string;
  description: string | null;
  amount: number;
  currency: Currency;
  type: string;
  date: Date;
}> {
  return transactions.slice(0, 10).map((tx) => ({
    id: tx.id,
    description: tx.description,
    amount: tx.amountCents,
    currency: tx.currency,
    type: tx.type,
    date: tx.date,
  }));
}

/**
 * Calculate investment sparkline data (last N months cumulative balance)
 */
function calculateInvestmentSparkline(
  transactions: TransactionData[],
  months: number
): number[] {
  const now = new Date();
  const monthlyTotals: number[] = [];

  // Initialize each month with 0
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = startOfMonth(subMonths(now, i));
    const monthEnd = endOfMonth(subMonths(now, i));

    // Sum all INVESTMENT transactions for this month
    let monthTotal = 0;
    for (const tx of transactions) {
      if (
        tx.type === 'INVESTMENT' &&
        tx.date >= monthStart &&
        tx.date <= monthEnd
      ) {
        monthTotal = addCents(monthTotal, tx.amountCents);
      }
    }
    monthlyTotals.push(monthTotal);
  }

  return monthlyTotals;
}

/**
 * Format final metrics result
 */
function formatMetricsResult(
  metrics: {
    netWorth: number;
    totalCash: number;
    savingsBalance: number;
    investmentsBalance: number;
    creditCardDebt: number;
    creditLimitTotal: number;
    maxInterestRate: number;
    externalDebts: number;
    distribution: Record<string, number>;
    monthlyIncome: number;
    monthlyExpenses: number;
    lastMonthExpenses: number;
    pendingFixedExpenses: number;
    transactions: TransactionData[];
    dollarRate: number;
    investmentSparkline: number[];
    activeSavingsGoals: number;
    totalSavedCents: number;
    savingsProgress: number;
    maxSpendableCents: number;
  },
  locale: string
): DashboardMetrics {
  const defaultCurrency: Currency = 'COP';

  // Calculate savings comparison
  const savingsComparisonPercentage =
    metrics.lastMonthExpenses > 0
      ? ((metrics.monthlyExpenses - metrics.lastMonthExpenses) / metrics.lastMonthExpenses) * 100
      : 0;
  const isPositiveSavings = metrics.monthlyExpenses <= metrics.lastMonthExpenses;

  // Max spendable from savings service (replaces simple calculation)
  const maxSpendable = metrics.maxSpendableCents;

  // Calculate credit available
  const creditAvailable = Math.max(0, metrics.creditLimitTotal - metrics.creditCardDebt);

  // Net worth adjustment for external debts
  const netWorthAdjusted = subtractCents(metrics.netWorth, metrics.externalDebts);

  return {
    // Resumen Ejecutivo
    netWorth: {
      amount: netWorthAdjusted,
      formatted: formatMoney(netWorthAdjusted, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    maxSpendable: {
      amount: maxSpendable,
      formatted: formatMoney(maxSpendable, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    savingsComparison: {
      amount: Math.abs(savingsComparisonPercentage),
      formatted: `${isPositiveSavings ? '↓' : '↑'} ${Math.abs(savingsComparisonPercentage).toFixed(1)}%`,
      isPositive: isPositiveSavings,
      percentage: savingsComparisonPercentage,
    },

    // Liquidez
    totalCash: {
      amount: metrics.totalCash,
      formatted: formatMoney(metrics.totalCash, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    savings: {
      amount: metrics.savingsBalance,
      formatted: formatMoney(metrics.savingsBalance, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    receivables: {
      amount: 0,
      formatted: formatMoney(0, defaultCurrency, locale),
      currency: defaultCurrency,
    },

    // Deudas
    creditCardDebt: {
      amount: metrics.creditCardDebt,
      formatted: formatMoney(metrics.creditCardDebt, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    creditAvailable: {
      amount: creditAvailable,
      formatted: formatMoney(creditAvailable, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    externalDebts: {
      amount: metrics.externalDebts,
      formatted: formatMoney(metrics.externalDebts, defaultCurrency, locale),
      currency: defaultCurrency,
    },

    // Inversiones
    investments: {
      amount: metrics.investmentsBalance,
      formatted: formatMoney(metrics.investmentsBalance, 'USD', locale),
      currency: 'USD',
    },
    maxInterestRate: {
      amount: metrics.maxInterestRate,
      formatted: metrics.maxInterestRate > 0 ? `${metrics.maxInterestRate.toFixed(2)}%` : '--',
    },
    dollarRate: {
      amount: metrics.dollarRate,
      formatted: metrics.dollarRate > 0 ? `$${metrics.dollarRate.toFixed(2)}` : '--',
    },

    // Gastos
    monthlyExpenses: {
      amount: metrics.monthlyExpenses,
      formatted: formatMoney(metrics.monthlyExpenses, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    pendingFixedExpenses: {
      amount: metrics.pendingFixedExpenses,
      formatted: formatMoney(metrics.pendingFixedExpenses, defaultCurrency, locale),
      currency: defaultCurrency,
    },

    // Savings
    activeSavingsGoals: metrics.activeSavingsGoals,
    totalSavedCents: {
      amount: metrics.totalSavedCents,
      formatted: formatMoney(metrics.totalSavedCents, defaultCurrency, locale),
      currency: defaultCurrency,
    },
    savingsProgress: metrics.savingsProgress,

    // Distribución
    netWorthDistribution: buildDistribution(metrics.distribution),

    // Sparklines
    sparklines: {
      investments: metrics.investmentSparkline,
    },

    // Transacciones
    recentTransactions: buildRecentTransactions(metrics.transactions),
  };
}

// ===== Main Export Functions =====

/**
 * Get dashboard metrics for current authenticated user
 * Returns empty state if no session — ready for future service integration
 */
export async function getDashboardMetrics(lang: string): Promise<DashboardMetrics> {
  const session = await getSession();
  if (!session?.userId) {
    return getEmptyMetrics();
  }

  return getDashboardMetricsByUser(session.userId, lang);
}

/**
 * Get dashboard metrics by user ID - 15 Financial Metrics
 * Refactored to reduce cognitive complexity
 */
export async function getDashboardMetricsByUser(userId: string, lang: string): Promise<DashboardMetrics> {
  const transactionRepo = getTransactionRepository();
  const locale = getLocale(lang);

  // Fetch accounts
  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      name: true,
      balanceCents: true,
      currency: true,
      type: true,
      creditLimitCents: true,
      interestRateEA: true,
    },
  });

  // Fetch loans
  const loans = await prisma.loan.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, balanceCents: true },
  });

  // Calculate date ranges
  const now = new Date();
  const startOfCurrentMonth = startOfMonth(now);
  const startOfLastMonth = startOfMonth(subMonths(now, 1));
  const endOfLastMonth = endOfMonth(subMonths(now, 1));

  // Fetch transactions
  const allTransactions = await prisma.transaction.findMany({
    where: { userId, isActive: true },
    orderBy: { date: 'desc' },
    take: 100,
    select: { id: true, description: true, amountCents: true, currency: true, type: true, date: true },
  });

  // Early return for empty state
  if (accounts.length === 0 && allTransactions.length === 0) {
    return getEmptyMetrics();
  }

  // Fetch pending fixed expenses
  const pendingFixedExpenses = await prisma.fixedExpensePayment.findMany({
    where: {
      fixedExpense: { userId, isActive: true },
      paidDate: null,
      dueDate: { lte: now },
    },
    select: { expectedAmountCents: true, currency: true },
  });

  // Fetch latest exchange rate for dollarRate metric
  const latestInvestmentTx = await prisma.transaction.findFirst({
    where: {
      userId,
      isActive: true,
      type: 'INVESTMENT',
      exchangeRate: { not: null },
      originalCurrency: 'COP',
    },
    orderBy: { date: 'desc' },
    select: { exchangeRate: true },
  });

  const dollarRate = latestInvestmentTx?.exchangeRate
    ? Number(latestInvestmentTx.exchangeRate)
    : 0;

  // Calculate investment sparkline (last 6 months)
  const investmentSparkline = calculateInvestmentSparkline(allTransactions, 6);

  // Calculate metrics via helper functions
  const accountMetrics = await calculateAccountMetrics(accounts, transactionRepo);
  const externalDebts = calculateLoanMetrics(loans);
  const txMetrics = calculateTransactionMetrics(
    allTransactions,
    startOfCurrentMonth,
    startOfLastMonth,
    endOfLastMonth
  );
  const pendingFixedExpensesTotal = calculatePendingFixedExpenses(pendingFixedExpenses);

  // Savings metrics
  const savingsSummary = await getSavingsSummary(userId);
  const maxSpendableBreakdown = await getMaxSpendable(
    userId,
    now.getMonth() + 1,
    now.getFullYear()
  );

  // Build and return final result
  return formatMetricsResult(
    {
      ...accountMetrics,
      externalDebts,
      monthlyIncome: txMetrics.monthlyIncome,
      monthlyExpenses: txMetrics.monthlyExpenses,
      lastMonthExpenses: txMetrics.lastMonthExpenses,
      pendingFixedExpenses: pendingFixedExpensesTotal,
      transactions: allTransactions,
      dollarRate,
      investmentSparkline,
      activeSavingsGoals: savingsSummary.activeGoalsCount,
      totalSavedCents: savingsSummary.totalSavedCents,
      savingsProgress: savingsSummary.overallProgressPercentage,
      maxSpendableCents: maxSpendableBreakdown.maxSpendableCents,
    },
    locale
  );
}