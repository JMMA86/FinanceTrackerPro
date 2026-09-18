/**
 * Dashboard page data module (server-only).
 *
 * The /dashboard page is a Server Component that must read ALL financial data
 * once per request. Reads here are plain server functions (NOT `'use server'`
 * Server Actions): Server Actions are client-invocable RPC endpoints, so
 * exposing `getDashboardMetricsByUser(userId)` would let an authenticated client
 * read another user's financial data (OWASP A01 / IDOR). This module resolves
 * the session ONCE and composes every KPI from the shared services, so
 * `router.refresh()` after a mutation re-runs a lightweight, correct read path.
 *
 * Financial rules:
 * - Rule 1: every monetary calculation uses the Decimal.js helpers in
 *   `@/lib/money` (percentages use Decimal directly).
 * - Rule 2/4: a single-currency KPI is built from ONE currency bucket and every
 *   KPI additionally exposes its full per-currency breakdown in `byCurrency`;
 *   currencies are NEVER summed together.
 * - Rule 5: multi-step reads reuse the atomic services of each module.
 * - Rule 13: account balances are derived from the transaction ledger (source of
 *   truth), aggregated in a single grouped query instead of an N+1 loop. This
 *   includes INVESTMENT cash: the dashboard passes the ledger cash to
 *   `getInvestmentPerformance`, so `totalValue = ledgerCash + holdingsMarketValue`
 *   and the cached `Account.balanceCents` is NOT trusted for the cash component
 *   (mark-to-market applies to holdings only).
 *
 * Multi-currency selection criterion for the scalar KPIs: the PRIMARY bucket is
 * `user.baseCurrency` when that currency has a NON-ZERO amount, otherwise the
 * bucket with the largest ABSOLUTE amount (always carrying its own real
 * currency). A zero-valued base bucket must never shadow a relevant balance held
 * in another currency.
 *
 * The net-worth composition (hero KPI + distribution) is expressed in the user's
 * `baseCurrency`: every foreign-currency balance (accounts, loans, credit-card
 * debt) is EXPLICITLY converted to the base currency with a traceable FX rate
 * (Rule 9) before aggregation. This is a documented, deliberate conversion — not
 * an implicit currency blend: each amount is converted with its own resolved rate
 * and unconvertible balances are excluded and flagged (`netWorthUnconverted`).
 * The distribution pie renders ASSETS by category (including `receivables`);
 * liabilities (`creditCards`, `loansPayable`) are reported separately in
 * `netWorthLiabilities` (a pie cannot render a negative proportion).
 */

import 'server-only';

import { Decimal } from 'decimal.js';
import { addDays, endOfMonth, endOfYear, startOfMonth, startOfYear, subMonths } from 'date-fns';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth/session';
import {
  getMaxSpendable,
  getSavingsGoalsWithProgress,
  getSavingsSummary,
} from '@/services/savings.service';
import {
  ensureUpcomingPayments,
  getFixedExpensesSummary,
  getFixedExpensesWithPayments,
} from '@/services/fixed-expense.service';
import { getLoansForPayment, getLoansSummary } from '@/services/loan.service';
import {
  getInvestmentPerformance,
  type InvestmentPerformance,
} from '@/services/investment-performance.service';
import { getVariableExpensesOverview } from '@/services/variable-expense.service';
import { getExchangeRate } from '@/services/exchange-rate.service';
import { getNetProjection } from '@/services/projection.service';
import {
  computeAvailableCredit,
  computeNextDueDate,
  computePaymentStatus,
  debtFromBalance,
} from '@/services/credit-card.service';
import { addCents, bigintToNumber, formatMoney, multiplyCents, subtractCents } from '@/lib/money';
import {
  buildMonthlyIncomeExpenseSeries,
  calculateTransactionMetricsByCurrency,
  type AccountHierarchyEntry,
  type TransactionData,
} from '@/lib/dashboard-metrics';
import type { AccountType, Currency } from '@prisma/client';
import type {
  DashboardAlert,
  DashboardCreditCardBucket,
  DashboardCurrencyBuckets,
  DashboardFixedExpenseBucket,
  DashboardLoanBucket,
  DashboardMetrics,
  DashboardProjection,
  DashboardSavingsGoal,
  DashboardUpcomingFixedExpense,
  DashboardVariableExpenseBucket,
  DistributionAssetCategoryKey,
  DistributionCategoryKey,
  DistributionItem,
  DistributionLiabilityCategoryKey,
  DistributionLiabilityItem,
  ExchangeRateSource,
  ExchangeRateUsed,
  InvestmentBreakdownAccount,
  MoneyBucket,
  ProjectionPeriod,
  ProjectionPeriodKey,
  UnconvertedCurrencyBucket,
} from '@/types/dashboard';

export type {
  DashboardMetrics,
  DistributionAssetCategoryKey,
  DistributionCategoryKey,
  DistributionItem,
  DistributionLiabilityCategoryKey,
  DistributionLiabilityItem,
} from '@/types/dashboard';

// ============================================================================
// Distribution mapping (every asset AccountType must land in a bucket)
// ============================================================================

/** Account-backed asset categories (everything except the loan `receivables`). */
type AccountDistributionCategoryKey = Exclude<DistributionAssetCategoryKey, 'receivables'>;

/** AccountType variants that contribute to the ASSET distribution. */
type AssetAccountType = Exclude<AccountType, 'CREDIT_CARD'>;

const ACCOUNT_DISTRIBUTION_KEYS: readonly AccountDistributionCategoryKey[] = [
  'checking',
  'cash',
  'savings',
  'pocket',
  'investments',
];

/** Every asset bucket rendered in `netWorthDistribution` (accounts + receivables). */
const DISTRIBUTION_ASSET_KEYS: readonly DistributionAssetCategoryKey[] = [
  'checking',
  'cash',
  'savings',
  'pocket',
  'investments',
  'receivables',
];

/** Every liability bucket rendered in `netWorthLiabilities`. */
const DISTRIBUTION_LIABILITY_KEYS: readonly DistributionLiabilityCategoryKey[] = [
  'creditCards',
  'loansPayable',
];

type AccountDistributionTotals = Record<AccountDistributionCategoryKey, number>;
type DistributionAssetTotals = Record<DistributionAssetCategoryKey, number>;
type DistributionLiabilityTotals = Record<DistributionLiabilityCategoryKey, number>;

/**
 * Explicit AccountType → account distribution bucket map. A `toLowerCase()`
 * lookup was buggy: `INVESTMENT` produced `investment` (singular) and was
 * dropped, while `CHECKING`/`CASH` matched nothing at all. Credit cards are
 * handled by their own path (debt is a liability, a positive balance is credit
 * in favor and is NOT an asset slice).
 */
const ACCOUNT_TYPE_TO_DISTRIBUTION_KEY: Record<AssetAccountType, AccountDistributionCategoryKey> = {
  CHECKING: 'checking',
  CASH: 'cash',
  SAVINGS: 'savings',
  POCKET: 'pocket',
  INVESTMENT: 'investments',
};

/** Stable, distinct colors for every distribution bucket (assets + liabilities). */
const DISTRIBUTION_COLORS: Record<DistributionCategoryKey, string> = {
  checking: '#0ea5e9',
  cash: '#22c55e',
  savings: '#2f7cf6',
  pocket: '#8b5cf6',
  investments: '#10b981',
  receivables: '#14b8a6',
  creditCards: '#ef4444',
  loansPayable: '#f97316',
};

function createEmptyDistribution(): AccountDistributionTotals {
  return { checking: 0, cash: 0, savings: 0, pocket: 0, investments: 0 };
}

function createEmptyAssetTotals(): DistributionAssetTotals {
  return {
    checking: 0,
    cash: 0,
    savings: 0,
    pocket: 0,
    investments: 0,
    receivables: 0,
  };
}

function createEmptyLiabilityTotals(): DistributionLiabilityTotals {
  return { creditCards: 0, loansPayable: 0 };
}

// ============================================================================
// Money bucket helpers (Rule 2/4 — never mix currencies)
// ============================================================================

type MoneyByCurrency = Partial<Record<Currency, number>>;

/** Canonical deterministic currency order (matches the Prisma enum declaration). */
const CURRENCY_ORDER: Record<Currency, number> = { COP: 0, USD: 1, EUR: 2 };

function addToBucket(buckets: MoneyByCurrency, currency: Currency, amountCents: number): void {
  buckets[currency] = addCents(buckets[currency] ?? 0, amountCents);
}

function orderedCurrencies(...maps: MoneyByCurrency[]): Currency[] {
  const keys = new Set<Currency>();
  for (const map of maps) {
    for (const key of Object.keys(map) as Currency[]) {
      keys.add(key);
    }
  }
  return [...keys].sort((a, b) => CURRENCY_ORDER[a] - CURRENCY_ORDER[b]);
}

/**
 * Pick the primary currency across one or more per-currency maps.
 *
 * Prefers `preferred` (user.baseCurrency) ONLY when it carries a NON-ZERO amount
 * in at least one map; a zero-valued base bucket must never hide relevant
 * balances held in another currency. Otherwise the currency with the largest
 * ABSOLUTE amount wins (carrying its own real currency). Never converts.
 */
function pickCurrency(maps: MoneyByCurrency[], preferred: Currency): Currency {
  const preferredMagnitude = maps.reduce((max, map) => {
    const value = map[preferred];
    return value === undefined ? max : Math.max(max, Math.abs(value));
  }, 0);
  if (preferredMagnitude > 0) return preferred;

  let best: Currency | null = null;
  let bestMagnitude = 0;
  for (const map of maps) {
    for (const currency of Object.keys(map) as Currency[]) {
      const magnitude = Math.abs(map[currency] ?? 0);
      if (magnitude > bestMagnitude) {
        bestMagnitude = magnitude;
        best = currency;
      }
    }
  }
  return best ?? preferred;
}

function makeBucket(currency: Currency, amountCents: number, locale: string): MoneyBucket {
  return { currency, amount: amountCents, formatted: formatMoney(amountCents, currency, locale) };
}

function toBuckets(map: MoneyByCurrency, locale: string): MoneyBucket[] {
  return orderedCurrencies(map).map((currency) => makeBucket(currency, map[currency] ?? 0, locale));
}

/** Scalar KPI from a single-currency map (primary bucket). */
function primaryBucket(map: MoneyByCurrency, preferred: Currency, locale: string): MoneyBucket {
  const currency = pickCurrency([map], preferred);
  return makeBucket(currency, map[currency] ?? 0, locale);
}

/**
 * Percentage change = (current − previous) / previous × 100 (Decimal,
 * ROUND_HALF_EVEN, 1 decimal). Returns null when there is no previous base.
 */
function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return new Decimal(subtractCents(current, previous))
    .dividedBy(previous)
    .times(100)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

// ============================================================================
// Internal data contracts
// ============================================================================

interface AccountData {
  id: string;
  name: string;
  currency: Currency;
  type: AccountType;
  creditLimitCents: number | null;
  interestRateEA: number | null;
  parentAccountId: string | null;
  paymentDueDay: number | null;
}

/** An account that contributes to the ASSET distribution (never a credit card). */
type AssetAccountData = AccountData & { type: AssetAccountType };

function isAssetAccount(account: AccountData): account is AssetAccountData {
  return account.type !== 'CREDIT_CARD';
}

interface AccountMetricsResult {
  netWorth: MoneyByCurrency;
  totalCash: MoneyByCurrency;
  savingsBalance: MoneyByCurrency;
  investmentsBalance: MoneyByCurrency;
  creditCardDebt: MoneyByCurrency;
  /**
   * Positive CREDIT_CARD balances (credit in the user's favor). These are an
   * ASSET: they feed the base-currency composition via
   * `collectCompositionCurrencies` + `buildBaseCurrencyComposition` so the hero
   * `netWorth` never diverges from `byCurrency.netWorth` by anything other than
   * FX. They do NOT render as a pie slice (no card-credit category exists).
   */
  creditCardCredit: MoneyByCurrency;
  maxInterestRate: number;
  distribution: Partial<Record<Currency, AccountDistributionTotals>>;
}

// ============================================================================
// Empty state / locale
// ============================================================================

function zeroBucket(currency: Currency): MoneyBucket {
  return { currency, amount: 0, formatted: '$0' };
}

function emptyComparison() {
  return { amount: 0, formatted: '0%', isPositive: true, percentage: 0 };
}

function emptyCurrencyBuckets(): DashboardCurrencyBuckets {
  return {
    netWorth: [],
    totalCash: [],
    savings: [],
    receivables: [],
    creditCardDebt: [],
    creditAvailable: [],
    externalDebts: [],
    monthlyExpenses: [],
    monthlyIncome: [],
    investments: [],
    maxSpendable: [],
    pendingFixedExpenses: [],
    totalSavedCents: [],
  };
}

/**
 * Zeroed projection period. The real window bounds are still computed so the UI
 * can render the period labels (e.g. "Septiembre 2026") even when there is no
 * data at all.
 */
function emptyProjectionPeriod(period: ProjectionPeriodKey, now: Date): ProjectionPeriod {
  return {
    period,
    asOf: now,
    periodStart: period === 'month' ? startOfMonth(now) : startOfYear(now),
    periodEnd: period === 'month' ? endOfMonth(now) : endOfYear(now),
    currentCashCents: 0,
    investmentValueCents: 0,
    salaryReceivedCents: 0,
    salaryPendingCents: 0,
    salaryStatus: 'NOT_CONFIGURED',
    nextSalaryDate: null,
    nextSalaryAmountCents: null,
    salaryOccurrences: [],
    remainingIncomeCents: 0,
    remainingFixedCents: 0,
    remainingLoanPaymentsCents: 0,
    remainingLoanPrincipalCents: 0,
    remainingLoanInterestCents: 0,
    remainingLoanReceivableCents: 0,
    remainingLoanReceivablePrincipalCents: 0,
    remainingLoanReceivableInterestCents: 0,
    remainingVariableBudgetCents: 0,
    remainingSavingsTargetCents: 0,
    projectedEndCents: 0,
    remainingToSpendCents: 0,
    projectedSurplusCents: 0,
    overBudget: false,
    breakdown: [],
  };
}

/** Coherent empty projection (nothing configured, every amount zero, COP). */
function emptyProjection(): DashboardProjection {
  const now = new Date();
  return {
    configured: false,
    targetConfigured: false,
    currency: 'COP',
    month: emptyProjectionPeriod('month', now),
    year: emptyProjectionPeriod('year', now),
    exchangeRatesUsed: {},
    unconverted: false,
    unconvertedByCurrency: {},
  };
}

function getEmptyMetrics(): DashboardMetrics {
  const defaultCurrency: Currency = 'COP';
  return {
    // Resumen Ejecutivo
    netWorth: { amount: 0, formatted: '$0', currency: defaultCurrency },
    maxSpendable: { amount: 0, formatted: '$0', currency: defaultCurrency },
    savingsComparison: emptyComparison(),
    expensesComparison: emptyComparison(),
    monthlyIncome: { amount: 0, formatted: '$0', currency: defaultCurrency },
    // Liquidez
    totalCash: { amount: 0, formatted: '$0', currency: defaultCurrency },
    savings: { amount: 0, formatted: '$0', currency: defaultCurrency },
    receivables: { amount: 0, formatted: '$0', currency: defaultCurrency },
    // Deudas
    creditCardDebt: { amount: 0, formatted: '$0', currency: defaultCurrency },
    creditAvailable: { amount: 0, formatted: '$0', currency: defaultCurrency },
    externalDebts: { amount: 0, formatted: '$0', currency: defaultCurrency },
    // Inversiones
    investments: { amount: 0, formatted: '$0', currency: defaultCurrency },
    maxInterestRate: { amount: 0, formatted: '0.00%' },
    dollarRate: { amount: 0, formatted: '--', source: 'unavailable' },
    euroRate: { amount: 0, formatted: '--', source: 'unavailable' },
    // Gastos
    monthlyExpenses: { amount: 0, formatted: '$0', currency: defaultCurrency },
    pendingFixedExpenses: { amount: 0, formatted: '$0', currency: defaultCurrency },
    // Savings
    activeSavingsGoals: 0,
    totalSavedCents: { amount: 0, formatted: '$0', currency: defaultCurrency },
    savingsProgress: 0,
    // Distribución (composición patrimonial en moneda base)
    netWorthDistribution: [],
    netWorthLiabilities: [],
    netWorthAssetsTotal: zeroBucket(defaultCurrency),
    netWorthLiabilitiesTotal: zeroBucket(defaultCurrency),
    netWorthUnconverted: false,
    exchangeRatesUsed: {},
    netWorthUnconvertedByCurrency: {},
    netWorthDistributionCurrency: defaultCurrency,
    // Sparklines
    sparklines: {},
    // Transacciones
    recentTransactions: [],
    // Fase 2 additions
    byCurrency: emptyCurrencyBuckets(),
    investmentsBreakdown: { byCurrency: [], accounts: [] },
    loans: { byCurrency: [], totalOverdueCount: 0, nextDueDate: null },
    creditCards: {
      byCurrency: [],
      totalDebt: zeroBucket(defaultCurrency),
      totalAvailableCredit: zeroBucket(defaultCurrency),
    },
    fixedExpenses: { byCurrency: [], upcoming: [] },
    variableExpenses: { byCurrency: [] },
    savingsGoals: [],
    alerts: [],
    projection: emptyProjection(),
  };
}

function getLocale(language: string): string {
  if (language === 'es') {
    return 'es-CO';
  }
  return 'en-US';
}

// ============================================================================
// Account metrics (per currency)
// ============================================================================

function getDistribution(
  distributions: Partial<Record<Currency, AccountDistributionTotals>>,
  currency: Currency
): AccountDistributionTotals {
  let distribution = distributions[currency];
  if (!distribution) {
    distribution = createEmptyDistribution();
    distributions[currency] = distribution;
  }
  return distribution;
}

/**
 * Process accounts and calculate per-currency account metrics.
 *
 * `balancesByAccountId` is derived from the transaction ledger (Rule 13) by an
 * aggregated grouped query upstream, so this loop performs NO database access
 * (no N+1). Investment accounts are valued at market: LEDGER cash (source of
 * truth) + holdings market value, supplied by `investmentValueByAccountId`;
 * when no performance is available they fall back to the ledger balance.
 * Currencies are accumulated in independent buckets (Rule 4).
 */
function calculateAccountMetrics(
  accounts: AccountData[],
  balancesByAccountId: Map<string, number>,
  investmentValueByAccountId: Map<string, number>
): AccountMetricsResult {
  const result: AccountMetricsResult = {
    netWorth: {},
    totalCash: {},
    savingsBalance: {},
    investmentsBalance: {},
    creditCardDebt: {},
    creditCardCredit: {},
    maxInterestRate: 0,
    distribution: {},
  };

  for (const account of accounts) {
    const ledgerBalance = balancesByAccountId.get(account.id) ?? 0;
    const trueBalance =
      account.type === 'INVESTMENT'
        ? (investmentValueByAccountId.get(account.id) ?? ledgerBalance)
        : ledgerBalance;

    if (isAssetAccount(account)) {
      processAssetAccount(account, trueBalance, result);
    } else {
      processCreditCardAccount(account, trueBalance, result);
    }
  }

  return result;
}

function processCreditCardAccount(
  account: AccountData,
  trueBalance: number,
  result: AccountMetricsResult
): void {
  const currency = account.currency;

  if (trueBalance < 0) {
    // Negative balance = money owed (magnitude via Decimal, Rule 1).
    const debt = subtractCents(0, trueBalance);
    addToBucket(result.creditCardDebt, currency, debt);
    addToBucket(result.netWorth, currency, subtractCents(0, debt));
    // Debt is intentionally NOT added to the asset distribution: the net-worth
    // pie represents ASSETS by category, so a liability is never rendered as a
    // positive slice. It is surfaced through the base-currency
    // `netWorthLiabilities` composition (`creditCards`) and the per-currency
    // `creditCardDebt` bucket.
  } else {
    // Positive balance = credit in favor. It counts towards the per-currency
    // `netWorth` map (`byCurrency.netWorth`) AND is recognized as an ASSET in the
    // base-currency composition through `creditCardCredit` (converted + added to
    // the asset total). It is NOT rendered as a pie slice because there is no
    // card-credit asset category; keeping it in the composition guarantees the
    // hero `netWorth` and `byCurrency.netWorth` only differ by FX, never by a
    // silently dropped balance.
    addToBucket(result.netWorth, currency, trueBalance);
    addToBucket(result.creditCardCredit, currency, trueBalance);
  }
}

function processAssetAccount(
  account: AssetAccountData,
  trueBalance: number,
  result: AccountMetricsResult
): void {
  const currency = account.currency;
  addToBucket(result.netWorth, currency, trueBalance);

  const bucket = ACCOUNT_TYPE_TO_DISTRIBUTION_KEY[account.type];
  const distribution = getDistribution(result.distribution, currency);
  distribution[bucket] = addCents(distribution[bucket], trueBalance);

  // "Efectivo Total" = every liquid asset (checking + cash + savings + pockets).
  const isLiquid =
    account.type === 'CHECKING' ||
    account.type === 'CASH' ||
    account.type === 'SAVINGS' ||
    account.type === 'POCKET';
  if (isLiquid) {
    addToBucket(result.totalCash, currency, trueBalance);
  }

  if (account.type === 'SAVINGS') {
    addToBucket(result.savingsBalance, currency, trueBalance);
    updateMaxInterestRate(account.interestRateEA, result);
  } else if (account.type === 'INVESTMENT') {
    addToBucket(result.investmentsBalance, currency, trueBalance);
  }
}

function updateMaxInterestRate(rate: number | null, result: AccountMetricsResult): void {
  if (rate && rate > result.maxInterestRate) {
    result.maxInterestRate = rate;
  }
}

// ============================================================================
// Distribution / transactions helpers
// ============================================================================

/**
 * Shared percentage computation for distribution slices.
 *
 * Percentages are computed with Decimal.js (ROUND_HALF_EVEN, 1 decimal) over the
 * sum of the slices ACTUALLY rendered, and the rounding residual is absorbed by
 * the largest slice, so the rendered percentages always add up to exactly 100%
 * (or the result is empty when there is no positive slice).
 */
function computeDistributionPercentages<T extends { amount: number }>(
  rendered: T[]
): Array<T & { percentage: number }> {
  const totalDistribution = rendered.reduce((sum, item) => addCents(sum, item.amount), 0);
  if (totalDistribution <= 0) return [];

  const total = new Decimal(totalDistribution);
  const items: Array<T & { percentage: number }> = rendered.map((item) => ({
    ...item,
    percentage: new Decimal(item.amount)
      .dividedBy(total)
      .times(100)
      .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
      .toNumber(),
  }));

  items.sort((a, b) => b.amount - a.amount);

  const roundedTotal = items.reduce((sum, item) => sum.plus(item.percentage), new Decimal(0));
  const residual = new Decimal(100).minus(roundedTotal);
  if (!residual.isZero()) {
    items[0] = {
      ...items[0],
      percentage: new Decimal(items[0].percentage)
        .plus(residual)
        .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
        .toNumber(),
    };
  }

  return items;
}

/**
 * Build the base-currency ASSET distribution (net-worth pie).
 *
 * Renders checking, cash, savings, pocket, investments and `receivables` (money
 * lent out). Every amount is already expressed in the user's base currency by an
 * explicit FX conversion (Rule 9) upstream. Credit-card DEBT is a liability and
 * never appears here.
 */
function buildDistribution(assets: DistributionAssetTotals): DistributionItem[] {
  const rendered = DISTRIBUTION_ASSET_KEYS.map((categoryKey) => ({
    categoryKey,
    amount: assets[categoryKey],
  })).filter((item) => item.amount > 0);

  return computeDistributionPercentages(rendered).map((item) => ({
    categoryKey: item.categoryKey,
    amount: item.amount,
    percentage: item.percentage,
    color: DISTRIBUTION_COLORS[item.categoryKey],
  }));
}

/**
 * Build the base-currency LIABILITY distribution: `creditCards` (Σ |negative
 * CREDIT_CARD balance|) and `loansPayable` (outstanding PAYABLE loans). Every
 * amount is already expressed in the user's base currency by an explicit FX
 * conversion (Rule 9) upstream.
 */
function buildLiabilityDistribution(
  liabilities: DistributionLiabilityTotals
): DistributionLiabilityItem[] {
  const rendered = DISTRIBUTION_LIABILITY_KEYS.map((categoryKey) => ({
    categoryKey,
    amount: liabilities[categoryKey],
  })).filter((item) => item.amount > 0);

  return computeDistributionPercentages(rendered).map((item) => ({
    categoryKey: item.categoryKey,
    amount: item.amount,
    percentage: item.percentage,
    color: DISTRIBUTION_COLORS[item.categoryKey],
  }));
}

/**
 * Build recent transactions array (top 10, read with a dedicated bounded query).
 */
function buildRecentTransactions(
  transactions: TransactionData[]
): DashboardMetrics['recentTransactions'] {
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
 * Cumulative net-invested series (last N months) for ONE currency, built from
 * the `series` returned by `getInvestmentPerformance` (positive net invested —
 * never the raw negative INVESTMENT flows).
 */
function buildInvestmentSparkline(
  performances: InvestmentPerformance[],
  currency: Currency,
  months: number,
  now: Date
): number[] {
  const relevant = performances.filter((performance) => performance.currency === currency);
  const series: number[] = [];

  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const monthEnd = endOfMonth(subMonths(now, offset));
    let total = 0;

    for (const performance of relevant) {
      let latest = 0;
      for (const point of performance.series) {
        if (new Date(point.date) <= monthEnd) {
          latest = point.investedCents;
        } else {
          break;
        }
      }
      total = addCents(total, latest);
    }

    series.push(total);
  }

  return series;
}

// ============================================================================
// Module KPIs (reuse each module's service)
// ============================================================================

function buildCreditCardMetrics(
  accounts: AccountData[],
  balancesByAccountId: Map<string, number>
): {
  buckets: DashboardCreditCardBucket[];
  totalDebt: MoneyByCurrency;
  totalAvailable: MoneyByCurrency;
} {
  const totalDebt: MoneyByCurrency = {};
  const totalAvailable: MoneyByCurrency = {};
  const aggregated = new Map<Currency, DashboardCreditCardBucket>();

  for (const account of accounts) {
    if (account.type !== 'CREDIT_CARD') continue;

    const trueBalance = balancesByAccountId.get(account.id) ?? 0;
    const debt = debtFromBalance(trueBalance);
    const available = computeAvailableCredit(account.creditLimitCents, debt) ?? 0;
    const paymentStatus = computePaymentStatus(account.paymentDueDay, debt > 0);
    const nextDue = computeNextDueDate(account.paymentDueDay);

    const current =
      aggregated.get(account.currency) ??
      ({
        currency: account.currency,
        debtCents: 0,
        availableCreditCents: 0,
        cardsCount: 0,
        dueSoonCount: 0,
        overdueCount: 0,
        nextDueDate: null,
      } satisfies DashboardCreditCardBucket);

    current.debtCents = addCents(current.debtCents, debt);
    current.availableCreditCents = addCents(current.availableCreditCents, available);
    current.cardsCount += 1;
    if (paymentStatus === 'DUE_SOON') current.dueSoonCount += 1;
    if (paymentStatus === 'OVERDUE') current.overdueCount += 1;
    if (nextDue && (current.nextDueDate == null || nextDue < current.nextDueDate)) {
      current.nextDueDate = nextDue;
    }

    aggregated.set(account.currency, current);
    addToBucket(totalDebt, account.currency, debt);
    addToBucket(totalAvailable, account.currency, available);
  }

  return {
    buckets: [...aggregated.values()].sort(
      (a, b) => CURRENCY_ORDER[a.currency] - CURRENCY_ORDER[b.currency]
    ),
    totalDebt,
    totalAvailable,
  };
}

function buildLoanMetrics(
  summaryBuckets: ReadonlyArray<{
    currency: Currency;
    totalPayableCents: number;
    totalReceivableCents: number;
    monthlyDueCents: number;
    activeCount: number;
  }>,
  paymentOptions: ReadonlyArray<{
    currency: Currency;
    overdueInstallment: { dueDate: Date } | null;
    nextInstallment: { dueDate: Date } | null;
  }>
): {
  buckets: DashboardLoanBucket[];
  externalDebts: MoneyByCurrency;
  receivables: MoneyByCurrency;
  totalOverdueCount: number;
  nextDueDate: Date | null;
} {
  const overdueBy: Partial<Record<Currency, number>> = {};
  const nextDueBy: Partial<Record<Currency, Date>> = {};

  for (const option of paymentOptions) {
    if (option.overdueInstallment) {
      overdueBy[option.currency] = (overdueBy[option.currency] ?? 0) + 1;
    }
    const next = option.nextInstallment?.dueDate ?? null;
    if (next) {
      const current = nextDueBy[option.currency];
      if (!current || next < current) {
        nextDueBy[option.currency] = next;
      }
    }
  }

  const externalDebts: MoneyByCurrency = {};
  const receivables: MoneyByCurrency = {};
  let totalOverdueCount = 0;
  let nextDueDate: Date | null = null;

  const buckets: DashboardLoanBucket[] = summaryBuckets.map((bucket) => {
    addToBucket(externalDebts, bucket.currency, bucket.totalPayableCents);
    addToBucket(receivables, bucket.currency, bucket.totalReceivableCents);

    const overdueCount = overdueBy[bucket.currency] ?? 0;
    totalOverdueCount += overdueCount;
    const bucketNext = nextDueBy[bucket.currency] ?? null;
    if (bucketNext && (nextDueDate == null || bucketNext < nextDueDate)) {
      nextDueDate = bucketNext;
    }

    return {
      currency: bucket.currency,
      externalDebts: bucket.totalPayableCents,
      receivables: bucket.totalReceivableCents,
      monthlyDueCents: bucket.monthlyDueCents,
      activeCount: bucket.activeCount,
      overdueCount,
      nextDueDate: bucketNext,
    };
  });

  return { buckets, externalDebts, receivables, totalOverdueCount, nextDueDate };
}

function buildVariableExpenseBuckets(
  buckets: ReadonlyArray<{
    currency: Currency;
    totalCents: number;
    transactionCount: number;
    definitionsCount: number;
    stats: ReadonlyArray<{
      variableExpenseId: string;
      name: string;
      currency: Currency;
      totalCents: number;
      expectedTotalCents: number | null;
      deltaAmountPct: number | null;
      count: number;
    }>;
  }>
): DashboardVariableExpenseBucket[] {
  return buckets.map((bucket) => {
    let expectedTotalCents = 0;
    for (const stat of bucket.stats) {
      if (stat.expectedTotalCents != null) {
        expectedTotalCents = addCents(expectedTotalCents, stat.expectedTotalCents);
      }
    }

    return {
      currency: bucket.currency,
      totalCents: bucket.totalCents,
      transactionCount: bucket.transactionCount,
      definitionsCount: bucket.definitionsCount,
      expectedTotalCents,
      topExpenses: bucket.stats.slice(0, 5).map((stat) => ({
        id: stat.variableExpenseId,
        name: stat.name,
        currency: stat.currency,
        totalCents: stat.totalCents,
        expectedTotalCents: stat.expectedTotalCents,
        deltaAmountPct: stat.deltaAmountPct,
        count: stat.count,
      })),
    };
  });
}

function buildSavingsGoals(
  goals: ReadonlyArray<{
    id: string;
    name: string;
    currency: Currency;
    currentAmountCents: number;
    targetAmountCents: number;
    progressPercentage: number;
    deadline: Date | null;
    projectedCompletion: string | null;
  }>,
  now: Date
): DashboardSavingsGoal[] {
  return goals.map((goal) => {
    const atRisk =
      goal.progressPercentage < 100 &&
      goal.deadline != null &&
      (goal.deadline.getTime() <= now.getTime() || goal.projectedCompletion == null);

    return {
      id: goal.id,
      name: goal.name,
      currency: goal.currency,
      currentAmountCents: goal.currentAmountCents,
      targetAmountCents: goal.targetAmountCents,
      progressPercentage: goal.progressPercentage,
      deadline: goal.deadline,
      projectedCompletion: goal.projectedCompletion,
      atRisk,
    };
  });
}

// ============================================================================
// Exchange rates
// ============================================================================

interface ResolvedRate {
  amount: number;
  source: ExchangeRateSource;
}

/**
 * Plausible "COP per 1 foreign unit" bands for a stored FALLBACK rate, resolved
 * PER PAIR. The fallback query only reads investment-linked transfers whose
 * convention is known ("COP per 1 foreign unit", validated by
 * `DepositToInvestmentSchema`/`WithdrawFromInvestmentSchema` at 1000–6000), so a
 * real value is in the thousands. The band is widened slightly to 1000–10000 for
 * future drift while still rejecting an inverted value (~0.00025) or an absurd
 * one. A general 1..1_000_000 band did NOT filter the heterogeneous writers
 * (generic creates allow `exchangeRate <= 1000`), which is exactly the bug this
 * per-pair band fixes.
 */
const COP_PER_FOREIGN_FALLBACK_BOUNDS: Partial<Record<Currency, { min: number; max: number }>> = {
  USD: { min: 1_000, max: 10_000 },
  EUR: { min: 1_000, max: 10_000 },
};

/**
 * A stored "COP per 1 foreign unit" rate, validated against the PER-PAIR band
 * for `currency`. COP itself is 1 COP per COP. Returns false for a missing,
 * non-finite, inverted or out-of-band value (never trust a blind range).
 */
function isPlausibleCopPerForeign(
  currency: Currency,
  value: number | null | undefined
): value is number {
  if (value == null || !Number.isFinite(value)) return false;
  if (currency === 'COP') return value === 1;
  const bounds = COP_PER_FOREIGN_FALLBACK_BOUNDS[currency];
  if (!bounds) return false;
  return value >= bounds.min && value <= bounds.max;
}

function resolveRate(
  currency: Currency,
  live: number | null,
  fallback: number | undefined
): ResolvedRate {
  // getExchangeRate('COP', foreign) = foreign units per 1 COP, so the app's
  // "COP per foreign unit" convention is its reciprocal (Decimal, Rule 1).
  if (live != null && live > 0) {
    return {
      amount: new Decimal(1).dividedBy(live).toNumber(),
      source: 'live',
    };
  }
  // Fallback rates come from stored transactions and use the "COP per foreign
  // unit" convention. Sanity-check them against the per-pair band instead of
  // trusting them blindly.
  if (fallback != null && isPlausibleCopPerForeign(currency, fallback)) {
    return { amount: fallback, source: 'fallback' };
  }
  return { amount: 0, source: 'unavailable' };
}

/** Format a COP-per-foreign-unit rate to 2 decimals (Decimal banker's rounding). */
function formatRate(rate: ResolvedRate, locale: string): string {
  if (rate.amount <= 0) return '--';
  const rounded = new Decimal(rate.amount).toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN).toNumber();
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

// ============================================================================
// Base-currency FX conversion (Rule 9 — explicit, traceable conversion)
//
// The net-worth composition aggregates balances held in DIFFERENT currencies
// into the user's `baseCurrency`. This is a deliberate, documented conversion:
// every individual amount is converted with its OWN resolved rate and the
// result flags any balance that could not be converted (`netWorthUnconverted`).
// A rate is never invented; an unconvertible balance is excluded.
// ============================================================================

interface ResolvedFxMultiplier {
  /** Multiplier that converts 1 unit of `from` into units of `to`, or null. */
  multiplier: number | null;
  source: ExchangeRateSource;
}

/**
 * Plausibility bounds for a general "to per from" FX multiplier. Supported pairs
 * (COP/USD/EUR) live between ~0.00025 (COP→USD) and ~4500 (USD→COP); the band is
 * intentionally wide to reject zero, NaN, Infinity and inverted/absurd values
 * without discarding a real rate.
 */
const MIN_PLAUSIBLE_FX_MULTIPLIER = 0.000001;
const MAX_PLAUSIBLE_FX_MULTIPLIER = 1_000_000;

function isPlausibleFxMultiplier(value: number | null | undefined): value is number {
  return (
    value != null &&
    Number.isFinite(value) &&
    value > MIN_PLAUSIBLE_FX_MULTIPLIER &&
    value < MAX_PLAUSIBLE_FX_MULTIPLIER
  );
}

/** Resolve the "COP per 1 unit" value for `currency`, or null when implausible. */
function copPerForeign(
  currency: Currency,
  fallbackRates: Partial<Record<Currency, number>>
): number | null {
  if (currency === 'COP') return 1;
  const value = fallbackRates[currency];
  return isPlausibleCopPerForeign(currency, value) ? value : null;
}

/**
 * Derive a `to per from` multiplier from the stored "COP per foreign unit"
 * fallback rates: (COP per from) / (COP per to). COP itself is 1 COP per COP.
 * Returns null when either side is missing or implausible — never invent a rate
 * (Rule 9). Both sides are validated against their own PER-PAIR band, so an
 * inverted or absurd stored value is rejected instead of corrupting the rate.
 */
function fallbackMultiplier(
  from: Currency,
  to: Currency,
  fallbackRates: Partial<Record<Currency, number>>
): number | null {
  const copPerFrom = copPerForeign(from, fallbackRates);
  const copPerTo = copPerForeign(to, fallbackRates);
  if (copPerFrom == null || copPerTo == null) {
    return null;
  }
  return new Decimal(copPerFrom).dividedBy(copPerTo).toNumber();
}

/**
 * Resolve the multiplier that converts `from` cents into `to` cents.
 * Order: LIVE `getExchangeRate` → last stored transaction rate → unavailable.
 * The sanity bounds reject inverted/absurd values from either source.
 */
async function resolveFxMultiplier(
  from: Currency,
  to: Currency,
  fallbackRates: Partial<Record<Currency, number>>
): Promise<ResolvedFxMultiplier> {
  if (from === to) return { multiplier: 1, source: 'live' };

  const live = await getExchangeRate(from, to);
  if (isPlausibleFxMultiplier(live)) {
    return { multiplier: live, source: 'live' };
  }

  const fallback = fallbackMultiplier(from, to, fallbackRates);
  if (fallback != null && isPlausibleFxMultiplier(fallback)) {
    return { multiplier: fallback, source: 'fallback' };
  }

  return { multiplier: null, source: 'unavailable' };
}

/** Resolve one multiplier per foreign currency needed by the composition. */
async function loadBaseCurrencyRates(
  baseCurrency: Currency,
  foreignCurrencies: readonly Currency[],
  fallbackRates: Partial<Record<Currency, number>>
): Promise<Partial<Record<Currency, ResolvedFxMultiplier>>> {
  const unique = [...new Set(foreignCurrencies)].filter((currency) => currency !== baseCurrency);
  const resolved = await Promise.all(
    unique.map(async (currency) => {
      const fx = await resolveFxMultiplier(currency, baseCurrency, fallbackRates);
      return [currency, fx] as const;
    })
  );

  const table: Partial<Record<Currency, ResolvedFxMultiplier>> = {};
  for (const [currency, fx] of resolved) {
    table[currency] = fx;
  }
  return table;
}

/**
 * Tracking side-channel for the base-currency composition: records the FX rate
 * actually applied per source currency (Rule 9 traceability) and every balance
 * that could not be converted (Rule 9 — a rate is never invented).
 */
interface FxUsageTracker {
  ratesUsed: Partial<Record<Currency, ExchangeRateUsed>>;
  unconverted: Partial<Record<Currency, UnconvertedCurrencyBucket>>;
}

function recordUnconverted(tracker: FxUsageTracker, currency: Currency, amountCents: number): void {
  const current = tracker.unconverted[currency] ?? { count: 0, amountCents: 0 };
  tracker.unconverted[currency] = {
    count: current.count + 1,
    // Magnitude in the ORIGINAL currency (Decimal abs, Rule 1).
    amountCents: addCents(current.amountCents, new Decimal(amountCents).abs().toNumber()),
  };
}

/**
 * Convert integer cents from `from` into the base currency using an explicit
 * multiplier (Decimal ROUND_HALF_EVEN to 0 decimals via `multiplyCents`), while
 * recording the applied rate (or the failure) in `tracker`. Returns null when no
 * plausible rate is available (caller flags & excludes).
 */
function convertTracked(
  amountCents: number,
  from: Currency,
  baseCurrency: Currency,
  rates: Partial<Record<Currency, ResolvedFxMultiplier>>,
  tracker: FxUsageTracker
): number | null {
  if (from === baseCurrency) return amountCents;
  const fx = rates[from];
  if (fx?.multiplier == null) {
    tracker.ratesUsed[from] = { rate: 0, source: 'unavailable' };
    recordUnconverted(tracker, from, amountCents);
    return null;
  }
  tracker.ratesUsed[from] = { rate: fx.multiplier, source: fx.source };
  return multiplyCents(amountCents, fx.multiplier);
}

/** Every currency carrying a balance that feeds the base-currency composition. */
function collectCompositionCurrencies(
  accountMetrics: AccountMetricsResult,
  loanMetrics: LoanMetricsData
): Currency[] {
  const currencies = new Set<Currency>();
  for (const currency of Object.keys(accountMetrics.distribution) as Currency[]) {
    currencies.add(currency);
  }
  for (const currency of Object.keys(accountMetrics.creditCardDebt) as Currency[]) {
    currencies.add(currency);
  }
  // Positive credit-card balances are assets, so their currency must participate
  // in the FX conversion too (otherwise an unconvertible card credit would be
  // silently ignored and the hero would diverge from `byCurrency.netWorth`).
  for (const currency of Object.keys(accountMetrics.creditCardCredit) as Currency[]) {
    currencies.add(currency);
  }
  for (const currency of Object.keys(loanMetrics.receivables) as Currency[]) {
    currencies.add(currency);
  }
  for (const currency of Object.keys(loanMetrics.externalDebts) as Currency[]) {
    currencies.add(currency);
  }
  return [...currencies];
}

/**
 * Convert + accumulate a per-currency map into a single total in base cents,
 * recording the FX usage (and any conversion failure) in `tracker`.
 */
function accumulateConverted(
  map: MoneyByCurrency,
  baseCurrency: Currency,
  rates: Partial<Record<Currency, ResolvedFxMultiplier>>,
  tracker: FxUsageTracker
): number {
  let totalCents = 0;
  for (const currency of Object.keys(map) as Currency[]) {
    const amount = map[currency] ?? 0;
    if (amount === 0) continue;
    const converted = convertTracked(amount, currency, baseCurrency, rates, tracker);
    if (converted == null) continue;
    totalCents = addCents(totalCents, converted);
  }
  return totalCents;
}

interface BaseCurrencyComposition {
  assets: DistributionAssetTotals;
  liabilities: DistributionLiabilityTotals;
  /**
   * Positive CREDIT_CARD credit balances (credit in the user's favor) treated as
   * an ASSET. Converted to base currency and included in `assetsTotalCents`, but
   * NOT rendered as a pie slice (there is no card-credit category); see
   * `DashboardMetrics.netWorthAssetsTotal`.
   */
  cardCreditCents: number;
  assetsTotalCents: number;
  liabilitiesTotalCents: number;
  unconverted: boolean;
  exchangeRatesUsed: Partial<Record<Currency, ExchangeRateUsed>>;
  unconvertedByCurrency: Partial<Record<Currency, UnconvertedCurrencyBucket>>;
}

/**
 * Build the COMPLETE patrimony composition in the user's base currency.
 *
 * Assets: checking, cash, savings, pocket, investments (from the account
 * distribution) + `receivables` (outstanding RECEIVABLE loans) + positive
 * CREDIT_CARD credit balances (an asset, kept out of the pie).
 * Liabilities: `creditCards` (Σ |negative CREDIT_CARD balance|) + `loansPayable`
 * (outstanding PAYABLE loans).
 *
 * Every foreign-currency amount is converted with its own resolved rate BEFORE
 * aggregation (Rule 9). Amounts without a usable rate are excluded and reported
 * through `unconverted` (with per-currency context in `unconvertedByCurrency`);
 * the rate actually applied is exposed in `exchangeRatesUsed`.
 */
function buildBaseCurrencyComposition(
  accountMetrics: AccountMetricsResult,
  loanMetrics: LoanMetricsData,
  baseCurrency: Currency,
  rates: Partial<Record<Currency, ResolvedFxMultiplier>>
): BaseCurrencyComposition {
  const assets = createEmptyAssetTotals();
  const liabilities = createEmptyLiabilityTotals();
  const tracker: FxUsageTracker = { ratesUsed: {}, unconverted: {} };

  // Account-derived asset categories, converted from their source currency.
  for (const currency of Object.keys(accountMetrics.distribution) as Currency[]) {
    const totals = accountMetrics.distribution[currency];
    if (!totals) continue;
    for (const key of ACCOUNT_DISTRIBUTION_KEYS) {
      const amount = totals[key];
      if (amount === 0) continue;
      const converted = convertTracked(amount, currency, baseCurrency, rates, tracker);
      if (converted == null) continue;
      assets[key] = addCents(assets[key], converted);
    }
  }

  assets.receivables = addCents(
    assets.receivables,
    accumulateConverted(loanMetrics.receivables, baseCurrency, rates, tracker)
  );
  liabilities.creditCards = addCents(
    liabilities.creditCards,
    accumulateConverted(accountMetrics.creditCardDebt, baseCurrency, rates, tracker)
  );
  liabilities.loansPayable = addCents(
    liabilities.loansPayable,
    accumulateConverted(loanMetrics.externalDebts, baseCurrency, rates, tracker)
  );

  // Positive credit-card balances are an ASSET (credit in the user's favor).
  // Included in the economic asset total so the hero `netWorth` matches
  // `byCurrency.netWorth` (FX aside); intentionally not a rendered slice.
  const cardCreditCents = accumulateConverted(
    accountMetrics.creditCardCredit,
    baseCurrency,
    rates,
    tracker
  );

  let assetsTotalCents = 0;
  for (const key of DISTRIBUTION_ASSET_KEYS) {
    assetsTotalCents = addCents(assetsTotalCents, assets[key]);
  }
  assetsTotalCents = addCents(assetsTotalCents, cardCreditCents);
  let liabilitiesTotalCents = 0;
  for (const key of DISTRIBUTION_LIABILITY_KEYS) {
    liabilitiesTotalCents = addCents(liabilitiesTotalCents, liabilities[key]);
  }

  return {
    assets,
    liabilities,
    cardCreditCents,
    assetsTotalCents,
    liabilitiesTotalCents,
    unconverted: Object.keys(tracker.unconverted).length > 0,
    exchangeRatesUsed: tracker.ratesUsed,
    unconvertedByCurrency: tracker.unconverted,
  };
}

// ============================================================================
// Alerts
// ============================================================================

function buildAlerts(input: {
  fixedOverdueByCurrency: ReadonlyArray<{ currency: Currency; count: number; amountCents: number }>;
  creditCards: ReadonlyArray<DashboardCreditCardBucket>;
  loans: ReadonlyArray<DashboardLoanBucket>;
  savingsAtRiskCount: number;
}): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];

  for (const bucket of input.fixedOverdueByCurrency) {
    alerts.push({
      severity: 'warning',
      kind: 'FIXED_EXPENSES_OVERDUE',
      count: bucket.count,
      amount: { amount: bucket.amountCents, currency: bucket.currency },
    });
  }

  for (const card of input.creditCards) {
    if (card.overdueCount > 0) {
      alerts.push({
        severity: 'critical',
        kind: 'CREDIT_CARD_OVERDUE',
        count: card.overdueCount,
        amount: { amount: card.debtCents, currency: card.currency },
      });
    }
    if (card.dueSoonCount > 0) {
      alerts.push({
        severity: 'warning',
        kind: 'CREDIT_CARD_DUE_SOON',
        count: card.dueSoonCount,
        amount: { amount: card.debtCents, currency: card.currency },
      });
    }
  }

  for (const loan of input.loans) {
    if (loan.overdueCount > 0) {
      alerts.push({
        severity: 'warning',
        kind: 'LOANS_OVERDUE',
        count: loan.overdueCount,
        amount: { amount: loan.monthlyDueCents, currency: loan.currency },
      });
    }
  }

  if (input.savingsAtRiskCount > 0) {
    alerts.push({
      severity: 'info',
      kind: 'SAVINGS_GOALS_AT_RISK',
      count: input.savingsAtRiskCount,
    });
  }

  return alerts;
}

// ============================================================================
// Dashboard read pipeline
//
// `getDashboardMetricsByUser` is decomposed into these small, named units so the
// composition stays within the cognitive-complexity budget (Sonar S3776) while
// preserving the exact query order, currency rules (Rule 2/4) and the public
// `DashboardMetrics` contract. Each query batch lives in a SINGLE helper so the
// parallelism and ordering of the original Promise.all groups are unchanged.
// ============================================================================

interface DashboardDateRange {
  startOfCurrentMonth: Date;
  startOfLastMonth: Date;
  endOfLastMonth: Date;
  trendStart: Date;
}

function buildDashboardDateRange(now: Date): DashboardDateRange {
  const lastMonth = subMonths(now, 1);
  return {
    startOfCurrentMonth: startOfMonth(now),
    startOfLastMonth: startOfMonth(lastMonth),
    endOfLastMonth: endOfMonth(lastMonth),
    trendStart: startOfMonth(subMonths(now, 5)),
  };
}

interface DashboardBaseReads {
  accounts: AccountData[];
  recentTransactions: TransactionData[];
  trendTransactions: TransactionData[];
  preferredCurrency: Currency;
  hierarchy: Record<string, AccountHierarchyEntry>;
  accountIds: string[];
  investmentAccounts: AccountData[];
}

function buildAccountHierarchy(accounts: AccountData[]): Record<string, AccountHierarchyEntry> {
  const hierarchy: Record<string, AccountHierarchyEntry> = {};
  for (const account of accounts) {
    hierarchy[account.id] = {
      id: account.id,
      type: account.type,
      parentAccountId: account.parentAccountId,
    };
  }
  return hierarchy;
}

/**
 * Batch 1 — base reads (accounts, recent transactions, 6-month trend window and
 * the user's base currency) issued concurrently, exactly as before.
 */
async function loadDashboardBaseReads(
  userId: string,
  trendStart: Date
): Promise<DashboardBaseReads> {
  const [accountsRaw, recentTxRaw, trendTxRaw, user] = await Promise.all([
    prisma.account.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        name: true,
        currency: true,
        type: true,
        creditLimitCents: true,
        interestRateEA: true,
        parentAccountId: true,
        paymentDueDay: true,
      },
    }),
    prisma.transaction.findMany({
      where: { userId, isActive: true },
      orderBy: { date: 'desc' },
      take: 10,
      select: {
        id: true,
        description: true,
        amountCents: true,
        currency: true,
        type: true,
        date: true,
        accountId: true,
        transferToAccountId: true,
        transferFromAccountId: true,
      },
    }),
    // 6-month window: covers the current + previous month KPIs AND the trend
    // sparklines. No "last 100 transactions" heuristic anymore.
    prisma.transaction.findMany({
      where: { userId, isActive: true, date: { gte: trendStart } },
      select: {
        id: true,
        description: true,
        amountCents: true,
        currency: true,
        type: true,
        date: true,
        accountId: true,
        transferToAccountId: true,
        transferFromAccountId: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { baseCurrency: true },
    }),
  ]);

  const accounts: AccountData[] = accountsRaw.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    type: a.type,
    creditLimitCents: a.creditLimitCents == null ? null : Number(a.creditLimitCents),
    interestRateEA: a.interestRateEA == null ? null : Number(a.interestRateEA),
    parentAccountId: a.parentAccountId,
    paymentDueDay: a.paymentDueDay,
  }));

  const recentTransactions: TransactionData[] = recentTxRaw.map((t) => ({
    id: t.id,
    description: t.description,
    amountCents: Number(t.amountCents),
    currency: t.currency,
    type: t.type,
    date: t.date,
    accountId: t.accountId,
    transferToAccountId: t.transferToAccountId,
    transferFromAccountId: t.transferFromAccountId,
  }));

  const trendTransactions: TransactionData[] = trendTxRaw.map((t) => ({
    id: t.id,
    description: t.description,
    amountCents: Number(t.amountCents),
    currency: t.currency,
    type: t.type,
    date: t.date,
    accountId: t.accountId,
    transferToAccountId: t.transferToAccountId,
    transferFromAccountId: t.transferFromAccountId,
  }));

  const preferredCurrency: Currency = user?.baseCurrency ?? 'COP';

  return {
    accounts,
    recentTransactions,
    trendTransactions,
    preferredCurrency,
    hierarchy: buildAccountHierarchy(accounts),
    accountIds: accounts.map((account) => account.id),
    investmentAccounts: accounts.filter((account) => account.type === 'INVESTMENT'),
  };
}

interface InvestmentPerformanceData {
  balanceByAccountId: Map<string, number>;
  investmentValueByAccountId: Map<string, number>;
  investmentPerformances: InvestmentPerformance[];
}

/**
 * Batch 2 — ledger-derived balances (Rule 13) and investment performance.
 *
 * The ledger balances are read FIRST so each investment account's performance is
 * computed with its LEDGER cash (`options.cashBalanceCents`), never with the
 * cached `Account.balanceCents`. `totalValueCents` therefore = ledger cash +
 * holdings market value: the mark-to-market is only applied to the holdings,
 * while the cash component keeps the transaction ledger as source of truth.
 * Failed performance reads are ignored, as before.
 */
async function loadBalancesAndInvestmentPerformance(
  accountIds: string[],
  investmentAccounts: AccountData[]
): Promise<InvestmentPerformanceData> {
  const balanceByAccountId = await loadTrueBalances(accountIds);

  const performanceResults = await Promise.allSettled(
    investmentAccounts.map((account) =>
      getInvestmentPerformance(prisma, account.id, {
        // Ledger truth (0 when the account has no ledger rows), never the cache.
        cashBalanceCents: balanceByAccountId.get(account.id) ?? 0,
      })
    )
  );

  const investmentPerformances: InvestmentPerformance[] = [];
  for (const result of performanceResults) {
    if (result.status === 'fulfilled') {
      investmentPerformances.push(result.value);
    }
  }
  const investmentValueByAccountId = new Map(
    investmentPerformances.map((performance) => [
      performance.accountId,
      performance.totalValueCents,
    ])
  );

  return { balanceByAccountId, investmentValueByAccountId, investmentPerformances };
}

/**
 * Batch 3 — every module service plus the exchange-rate fallbacks and the
 * fixed-expense overdue groupBy, issued as ONE parallel batch (same 12 reads and
 * same order as before). `getFixedExpensesWithPayments` skips its own
 * materialization because `ensureUpcomingPayments` already ran this render.
 */
async function loadDashboardModuleData(
  userId: string,
  now: Date,
  targetMonth: number,
  targetYear: number
) {
  const [
    fixedExpensesSummary,
    fixedExpensesWithPayments,
    loansSummary,
    loansForPayment,
    variableExpensesOverview,
    savingsSummary,
    maxSpendableBreakdown,
    activeSavingsGoalsRaw,
    usdLive,
    eurLive,
    fallbackRatesRaw,
    fixedOverdueCountsRaw,
    projection,
  ] = await Promise.all([
    getFixedExpensesSummary(userId, targetMonth, targetYear),
    getFixedExpensesWithPayments(
      userId,
      { from: now, to: addDays(now, 30) },
      { skipMaterialization: true }
    ),
    getLoansSummary(userId),
    getLoansForPayment(userId),
    getVariableExpensesOverview(userId, targetMonth, targetYear),
    getSavingsSummary(userId),
    getMaxSpendable(userId, targetMonth, targetYear),
    getSavingsGoalsWithProgress(userId, 'ACTIVE'),
    getExchangeRate('COP', 'USD'),
    getExchangeRate('COP', 'EUR'),
    // Fallback FX source: ONLY investment-linked transfers, whose stored
    // `exchangeRate` convention is KNOWN ("COP per 1 foreign unit", validated at
    // 1000–6000 by the deposit/withdraw schemas). The previous query had no type
    // or account restriction, so a generic create (allowed `exchangeRate <= 1000`)
    // or any heterogeneous writer could inject a wrongly-conventioned rate.
    // `take` (instead of `distinct`) lets us skip an out-of-band newest row and
    // still find the most recent PLAUSIBLE rate per currency.
    prisma.transaction.findMany({
      where: {
        userId,
        isActive: true,
        exchangeRate: { not: null },
        originalCurrency: 'COP',
        currency: { in: ['USD', 'EUR'] },
        type: { in: ['TRANSFER_IN', 'TRANSFER_OUT'] },
        account: { type: 'INVESTMENT' },
      },
      orderBy: { date: 'desc' },
      take: 100,
      select: { currency: true, exchangeRate: true },
    }),
    prisma.fixedExpensePayment.groupBy({
      by: ['currency'],
      where: {
        fixedExpense: { userId, isActive: true },
        isActive: true,
        paidDate: null,
        dueDate: { lt: now },
      },
      _count: { _all: true },
      _sum: { expectedAmountCents: true },
    }),
    // End-of-period projection (month + year) in COP. The service resolves its
    // own FX rates (live → stored fallback) so it stays a self-contained,
    // traceable read; the dashboard could reuse `fallbackRates` but the
    // projection must also work outside the dashboard.
    getNetProjection(userId, now),
  ]);

  // Keep only the most recent PLAUSIBLE stored rate per currency. Rows arrive
  // newest-first, so the first in-band value per currency wins and any
  // out-of-band/inverted rate is rejected rather than trusted.
  const fallbackRates: Partial<Record<Currency, number>> = {};
  for (const row of fallbackRatesRaw) {
    if (row.exchangeRate == null) continue;
    if (fallbackRates[row.currency] !== undefined) continue;
    const rate = Number(row.exchangeRate);
    if (isPlausibleCopPerForeign(row.currency, rate)) {
      fallbackRates[row.currency] = rate;
    }
  }

  // Count AND amount come from the SAME groupBy over the SAME window (every
  // unpaid payment already past due in the materialized horizon), so the
  // FIXED_EXPENSES_OVERDUE alert can never report count > 0 with amount = 0.
  const fixedOverdueByCurrency = fixedOverdueCountsRaw.map((row) => ({
    currency: row.currency,
    count: row._count._all,
    amountCents: bigintToNumber(row._sum.expectedAmountCents),
  }));

  return {
    fixedExpensesSummary,
    fixedExpensesWithPayments,
    loansSummary,
    loansForPayment,
    variableExpensesOverview,
    savingsSummary,
    maxSpendableBreakdown,
    activeSavingsGoalsRaw,
    usdRate: resolveRate('USD', usdLive, fallbackRates.USD),
    eurRate: resolveRate('EUR', eurLive, fallbackRates.EUR),
    fallbackRates,
    fixedOverdueByCurrency,
    projection,
  };
}

type FixedExpensesSummaryData = Awaited<ReturnType<typeof getFixedExpensesSummary>>;
type FixedExpensesWithPaymentsData = Awaited<ReturnType<typeof getFixedExpensesWithPayments>>;

interface FixedExpenseMetrics {
  pendingFixedBy: MoneyByCurrency;
  fixedExpenseBuckets: DashboardFixedExpenseBucket[];
  nextFixedExpenses: DashboardUpcomingFixedExpense[];
}

function collectUpcomingFixedExpenses(
  expenses: FixedExpensesWithPaymentsData
): DashboardUpcomingFixedExpense[] {
  const upcoming: DashboardUpcomingFixedExpense[] = [];
  for (const expense of expenses) {
    for (const payment of expense.payments) {
      if (payment.paidDate != null) continue;
      upcoming.push({
        id: payment.id,
        fixedExpenseId: expense.id,
        name: expense.name,
        dueDate: payment.dueDate,
        expectedAmountCents: payment.expectedAmountCents,
        currency: payment.currency,
      });
    }
  }
  return upcoming;
}

function buildFixedExpenseMetrics(
  summary: FixedExpensesSummaryData,
  expenses: FixedExpensesWithPaymentsData
): FixedExpenseMetrics {
  const pendingFixedBy: MoneyByCurrency = {};
  const fixedExpenseBuckets: DashboardFixedExpenseBucket[] = summary.byCurrency.map((bucket) => {
    addToBucket(pendingFixedBy, bucket.currency, bucket.totalPendingCents);
    return {
      currency: bucket.currency,
      pendingCents: bucket.totalPendingCents,
      overdueCents: bucket.totalOverdueCents,
      activeCount: bucket.activeCount,
    };
  });

  const upcomingFixedExpenses = collectUpcomingFixedExpenses(expenses);
  upcomingFixedExpenses.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  return {
    pendingFixedBy,
    fixedExpenseBuckets,
    nextFixedExpenses: upcomingFixedExpenses.slice(0, 10),
  };
}

type SavingsSummaryData = Awaited<ReturnType<typeof getSavingsSummary>>;

interface SavingsMetrics {
  savedBy: MoneyByCurrency;
  savedCurrency: Currency;
  savedSummaryBucket: SavingsSummaryData['byCurrency'][number] | undefined;
}

function buildSavingsMetrics(
  summary: SavingsSummaryData,
  preferredCurrency: Currency
): SavingsMetrics {
  const savedBy: MoneyByCurrency = {};
  for (const bucket of summary.byCurrency) {
    addToBucket(savedBy, bucket.currency, bucket.totalSavedCents);
  }
  const savedCurrency = pickCurrency([savedBy], preferredCurrency);
  const savedSummaryBucket = summary.byCurrency.find((bucket) => bucket.currency === savedCurrency);
  return { savedBy, savedCurrency, savedSummaryBucket };
}

type MaxSpendableData = Awaited<ReturnType<typeof getMaxSpendable>>;

function buildMaxSpendableBuckets(breakdown: MaxSpendableData): MoneyByCurrency {
  const maxSpendableBy: MoneyByCurrency = {};
  for (const bucket of breakdown.byCurrency) {
    addToBucket(maxSpendableBy, bucket.currency, bucket.maxSpendableCents);
  }
  return maxSpendableBy;
}

type LoanMetricsData = ReturnType<typeof buildLoanMetrics>;

/** Net worth per currency = account net worth + receivables − external debts. */
function buildNetWorthByCurrency(
  accountMetrics: AccountMetricsResult,
  loanMetrics: LoanMetricsData
): MoneyByCurrency {
  const netWorthBy: MoneyByCurrency = {};
  for (const currency of orderedCurrencies(
    accountMetrics.netWorth,
    loanMetrics.externalDebts,
    loanMetrics.receivables
  )) {
    const assets = accountMetrics.netWorth[currency] ?? 0;
    const receivable = loanMetrics.receivables[currency] ?? 0;
    const debt = loanMetrics.externalDebts[currency] ?? 0;
    netWorthBy[currency] = subtractCents(addCents(assets, receivable), debt);
  }
  return netWorthBy;
}

type CurrencyTransactionMetrics = ReturnType<typeof calculateTransactionMetricsByCurrency>;

interface CashflowMetrics {
  txMetrics: CurrencyTransactionMetrics;
  cashflowCurrency: Currency;
  expensesComparison: {
    amount: number;
    formatted: string;
    isPositive: boolean;
    percentage: number;
  };
  incomeSparkline: number[];
  expensesSparkline: number[];
}

/**
 * Monthly income/expense block: per-currency metrics, the ONE primary
 * `cashflowCurrency` (shared by KPIs + month-over-month + both sparklines) and
 * the 6-month series. Currencies are never mixed (Rule 2/4).
 */
function buildCashflowMetrics(
  transactions: TransactionData[],
  hierarchy: Record<string, AccountHierarchyEntry>,
  range: DashboardDateRange,
  preferredCurrency: Currency,
  now: Date
): CashflowMetrics {
  const txMetrics = calculateTransactionMetricsByCurrency(
    transactions,
    range.startOfCurrentMonth,
    range.startOfLastMonth,
    range.endOfLastMonth,
    hierarchy
  );

  const cashflowCurrency = pickCurrency(
    [txMetrics.monthlyIncome, txMetrics.monthlyExpenses, txMetrics.lastMonthExpenses],
    preferredCurrency
  );
  const currentExpenses = txMetrics.monthlyExpenses[cashflowCurrency] ?? 0;
  const lastExpenses = txMetrics.lastMonthExpenses[cashflowCurrency] ?? 0;
  const expensesPct =
    percentageChange(currentExpenses, lastExpenses) ?? (currentExpenses > 0 ? 100 : 0);
  const expensesIsPositive = currentExpenses <= lastExpenses;
  const absExpensesPct = new Decimal(expensesPct).abs().toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN);

  const monthStarts = Array.from({ length: 6 }, (_, index) =>
    startOfMonth(subMonths(now, 5 - index))
  );
  const { income: incomeSparkline, expenses: expensesSparkline } = buildMonthlyIncomeExpenseSeries(
    transactions,
    monthStarts,
    hierarchy,
    cashflowCurrency,
    now
  );

  return {
    txMetrics,
    cashflowCurrency,
    expensesComparison: {
      amount: absExpensesPct.toNumber(),
      formatted: `${expensesIsPositive ? '↓' : '↑'} ${absExpensesPct.toFixed(1)}%`,
      isPositive: expensesIsPositive,
      percentage: expensesPct,
    },
    incomeSparkline,
    expensesSparkline,
  };
}

interface InvestmentMetrics {
  investmentsCurrency: Currency;
  investmentSparkline: number[];
  investmentBreakdownAccounts: InvestmentBreakdownAccount[];
}

/** The investments KPI, its sparkline and per-account breakdown share ONE bucket. */
function buildInvestmentMetrics(
  accountMetrics: AccountMetricsResult,
  investmentPerformances: InvestmentPerformance[],
  preferredCurrency: Currency,
  now: Date
): InvestmentMetrics {
  const investmentsCurrency = pickCurrency([accountMetrics.investmentsBalance], preferredCurrency);
  const investmentSparkline = buildInvestmentSparkline(
    investmentPerformances,
    investmentsCurrency,
    6,
    now
  );
  const investmentBreakdownAccounts: InvestmentBreakdownAccount[] = investmentPerformances.map(
    (performance) => ({
      accountId: performance.accountId,
      name: performance.name,
      currency: performance.currency,
      cashBalanceCents: performance.cashBalanceCents,
      holdingsMarketValueCents: performance.holdingsMarketValueCents,
      totalValueCents: performance.totalValueCents,
      totalInvestedCents: performance.totalInvestedCents,
      totalReturnCents: performance.totalReturnCents,
      totalReturnPct: performance.totalReturnPct,
    })
  );
  return { investmentsCurrency, investmentSparkline, investmentBreakdownAccounts };
}

// ============================================================================
// Public read API
// ============================================================================

/**
 * Canonical dashboard entry point: resolves the session ONCE (server-side) and
 * returns serializable props. Returns the empty state when there is no session.
 *
 * This is a plain server-only function, NOT a Server Action, so the frontend
 * cannot invoke it with an arbitrary userId.
 */
export async function getDashboardMetrics(lang: string): Promise<DashboardMetrics> {
  const session = await getSession();
  if (!session?.userId) {
    return getEmptyMetrics();
  }

  return getDashboardMetricsByUser(session.userId, lang);
}

/**
 * Internal dashboard read by an explicit user id.
 *
 * SECURITY: this function is exported for server-side composition/testing only.
 * It MUST stay in this `server-only` module (never in a `'use server'` file):
 * exposing it as a Server Action would turn the explicit `userId` parameter into
 * an IDOR (OWASP A01).
 */
export async function getDashboardMetricsByUser(
  userId: string,
  lang: string
): Promise<DashboardMetrics> {
  const locale = getLocale(lang);
  const now = new Date();
  const range = buildDashboardDateRange(now);

  // --------------------------------------------------------------------------
  // 1. Base reads (independent → parallel)
  // --------------------------------------------------------------------------
  // No early return: a user may have loans, savings goals or fixed expenses
  // WITHOUT any account/transaction, and those KPIs must still be computed. The
  // truly-empty case falls through to the services, which return empty
  // per-currency buckets and scalar zeroes.
  const {
    accounts,
    recentTransactions,
    trendTransactions,
    preferredCurrency,
    hierarchy,
    accountIds,
    investmentAccounts,
  } = await loadDashboardBaseReads(userId, range.trendStart);

  const targetMonth = now.getMonth() + 1;
  const targetYear = now.getFullYear();

  // --------------------------------------------------------------------------
  // 2. Balances + investment performance + fixed-expense materialization
  // --------------------------------------------------------------------------
  // Materialize the rolling fixed-expense payments ONCE per dashboard render.
  // This is a best-effort read side-effect (idempotent, failures are logged and
  // swallowed) so a fresh template is visible to BOTH the summary and the
  // upcoming list. `getFixedExpensesWithPayments` is told to skip its own
  // materialization inside `loadDashboardModuleData` to avoid running it twice
  // per render.
  await ensureUpcomingPayments(userId);

  const { balanceByAccountId, investmentValueByAccountId, investmentPerformances } =
    await loadBalancesAndInvestmentPerformance(accountIds, investmentAccounts);

  // --------------------------------------------------------------------------
  // 3. Module services (reused, never reimplemented) — one parallel batch
  // --------------------------------------------------------------------------
  const moduleData = await loadDashboardModuleData(userId, now, targetMonth, targetYear);
  const { usdRate, eurRate, fixedOverdueByCurrency } = moduleData;

  // --------------------------------------------------------------------------
  // 4. Derived KPI maps
  // --------------------------------------------------------------------------
  const accountMetrics = calculateAccountMetrics(
    accounts,
    balanceByAccountId,
    investmentValueByAccountId
  );

  const creditCardMetrics = buildCreditCardMetrics(accounts, balanceByAccountId);
  const loanMetrics = buildLoanMetrics(
    moduleData.loansSummary.byCurrency,
    moduleData.loansForPayment
  );
  const variableExpenseBuckets = buildVariableExpenseBuckets(
    moduleData.variableExpensesOverview.byCurrency
  );
  const savingsGoals = buildSavingsGoals(moduleData.activeSavingsGoalsRaw, now);

  // Fixed expenses: per-currency pending/overdue (summary) + upcoming payments.
  const { pendingFixedBy, fixedExpenseBuckets, nextFixedExpenses } = buildFixedExpenseMetrics(
    moduleData.fixedExpensesSummary,
    moduleData.fixedExpensesWithPayments
  );

  // Savings (per-currency)
  const { savedBy, savedCurrency, savedSummaryBucket } = buildSavingsMetrics(
    moduleData.savingsSummary,
    preferredCurrency
  );

  const maxSpendableBy = buildMaxSpendableBuckets(moduleData.maxSpendableBreakdown);

  // Credit available: reuse the SAME per-card Σ max(0, limitᵢ − debtᵢ) computed
  // by `buildCreditCardMetrics` for both the scalar KPI and
  // `creditCards.totalAvailableCredit`, so the two values can never drift.
  const creditAvailableBy = creditCardMetrics.totalAvailable;

  // Net worth per currency = account net worth + receivables − external debts.
  const netWorthBy = buildNetWorthByCurrency(accountMetrics, loanMetrics);

  // Monthly income/expenses (per currency) + month-over-month comparison, both
  // sparklines and the primary currency resolved together (Rule 2/4).
  //
  // INTENTIONAL DIVERGENCE FROM `byCurrency`: `cashflowCurrency` is chosen from
  // the COMBINED income+expense+last-month-expense buckets, so the scalar
  // `monthlyExpenses.amount` may legitimately be 0 when the selected currency
  // holds income but no expenses, even though `byCurrency.monthlyExpenses` still
  // lists real expenses in ANOTHER currency. The scalar block intentionally
  // reports a single currency; the full per-currency truth remains available in
  // `byCurrency` (Rule 2/4 — currencies are never summed or mixed here).
  const { txMetrics, cashflowCurrency, expensesComparison, incomeSparkline, expensesSparkline } =
    buildCashflowMetrics(trendTransactions, hierarchy, range, preferredCurrency, now);

  // The investments KPI, its sparkline and its per-account breakdown share the
  // same non-zero bucket.
  const { investmentsCurrency, investmentSparkline, investmentBreakdownAccounts } =
    buildInvestmentMetrics(accountMetrics, investmentPerformances, preferredCurrency, now);

  // --------------------------------------------------------------------------
  // Base-currency patrimony composition (Rule 9 — explicit, traceable FX)
  //
  // The hero `netWorth` and the distribution are expressed in the user's base
  // currency: every foreign-currency balance (accounts, receivables, card debt,
  // payables) is converted with a traceable rate BEFORE aggregation. This is a
  // DELIBERATE conversion, not an implicit currency blend: each amount uses its
  // own resolved rate and unconvertible balances are excluded and flagged. The
  // per-currency `byCurrency.netWorth` buckets stay un-converted (Rule 2/4).
  // --------------------------------------------------------------------------
  const compositionCurrency = preferredCurrency;
  const baseCurrencyRates = await loadBaseCurrencyRates(
    compositionCurrency,
    collectCompositionCurrencies(accountMetrics, loanMetrics),
    moduleData.fallbackRates
  );
  const composition = buildBaseCurrencyComposition(
    accountMetrics,
    loanMetrics,
    compositionCurrency,
    baseCurrencyRates
  );
  const netWorthAmountCents = subtractCents(
    composition.assetsTotalCents,
    composition.liabilitiesTotalCents
  );

  // --------------------------------------------------------------------------
  // 5. Scalar KPIs (primary bucket of each map)
  // --------------------------------------------------------------------------
  const netWorth = makeBucket(compositionCurrency, netWorthAmountCents, locale);
  const totalCash = primaryBucket(accountMetrics.totalCash, preferredCurrency, locale);
  const savings = primaryBucket(accountMetrics.savingsBalance, preferredCurrency, locale);
  const receivables = primaryBucket(loanMetrics.receivables, preferredCurrency, locale);
  const creditCardDebt = primaryBucket(accountMetrics.creditCardDebt, preferredCurrency, locale);
  const creditAvailable = primaryBucket(creditAvailableBy, preferredCurrency, locale);
  const externalDebts = primaryBucket(loanMetrics.externalDebts, preferredCurrency, locale);
  const investments = makeBucket(
    investmentsCurrency,
    accountMetrics.investmentsBalance[investmentsCurrency] ?? 0,
    locale
  );
  const monthlyExpenses = makeBucket(
    cashflowCurrency,
    txMetrics.monthlyExpenses[cashflowCurrency] ?? 0,
    locale
  );
  const monthlyIncome = makeBucket(
    cashflowCurrency,
    txMetrics.monthlyIncome[cashflowCurrency] ?? 0,
    locale
  );
  const pendingFixedExpenses = primaryBucket(pendingFixedBy, preferredCurrency, locale);
  const maxSpendable = primaryBucket(maxSpendableBy, preferredCurrency, locale);
  const totalSavedCents = makeBucket(savedCurrency, savedBy[savedCurrency] ?? 0, locale);

  const alerts = buildAlerts({
    fixedOverdueByCurrency,
    creditCards: creditCardMetrics.buckets,
    loans: loanMetrics.buckets,
    savingsAtRiskCount: savingsGoals.filter((goal) => goal.atRisk).length,
  });

  return {
    // Resumen Ejecutivo
    netWorth: {
      amount: netWorth.amount,
      formatted: netWorth.formatted,
      currency: netWorth.currency,
    },
    maxSpendable: {
      amount: maxSpendable.amount,
      formatted: maxSpendable.formatted,
      currency: maxSpendable.currency,
    },
    savingsComparison: expensesComparison,
    expensesComparison,
    monthlyIncome: {
      amount: monthlyIncome.amount,
      formatted: monthlyIncome.formatted,
      currency: monthlyIncome.currency,
    },

    // Liquidez
    totalCash: {
      amount: totalCash.amount,
      formatted: totalCash.formatted,
      currency: totalCash.currency,
    },
    savings: { amount: savings.amount, formatted: savings.formatted, currency: savings.currency },
    receivables: {
      amount: receivables.amount,
      formatted: receivables.formatted,
      currency: receivables.currency,
    },

    // Deudas
    creditCardDebt: {
      amount: creditCardDebt.amount,
      formatted: creditCardDebt.formatted,
      currency: creditCardDebt.currency,
    },
    creditAvailable: {
      amount: creditAvailable.amount,
      formatted: creditAvailable.formatted,
      currency: creditAvailable.currency,
    },
    externalDebts: {
      amount: externalDebts.amount,
      formatted: externalDebts.formatted,
      currency: externalDebts.currency,
    },

    // Inversiones
    investments: {
      amount: investments.amount,
      formatted: investments.formatted,
      currency: investments.currency,
    },
    maxInterestRate: {
      amount: accountMetrics.maxInterestRate,
      formatted:
        accountMetrics.maxInterestRate > 0
          ? `${new Decimal(accountMetrics.maxInterestRate)
              .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
              .toFixed(2)}%`
          : '--',
    },
    dollarRate: {
      amount: usdRate.amount,
      formatted: formatRate(usdRate, locale),
      source: usdRate.source,
    },
    euroRate: {
      amount: eurRate.amount,
      formatted: formatRate(eurRate, locale),
      source: eurRate.source,
    },

    // Gastos
    monthlyExpenses: {
      amount: monthlyExpenses.amount,
      formatted: monthlyExpenses.formatted,
      currency: monthlyExpenses.currency,
    },
    pendingFixedExpenses: {
      amount: pendingFixedExpenses.amount,
      formatted: pendingFixedExpenses.formatted,
      currency: pendingFixedExpenses.currency,
    },

    // Savings
    activeSavingsGoals: savedSummaryBucket?.activeGoalsCount ?? 0,
    totalSavedCents: {
      amount: totalSavedCents.amount,
      formatted: totalSavedCents.formatted,
      currency: totalSavedCents.currency,
    },
    savingsProgress: savedSummaryBucket?.overallProgressPercentage ?? 0,

    // Distribución (composición patrimonial COMPLETA en moneda base)
    netWorthDistribution: buildDistribution(composition.assets),
    netWorthLiabilities: buildLiabilityDistribution(composition.liabilities),
    netWorthAssetsTotal: makeBucket(compositionCurrency, composition.assetsTotalCents, locale),
    netWorthLiabilitiesTotal: makeBucket(
      compositionCurrency,
      composition.liabilitiesTotalCents,
      locale
    ),
    netWorthUnconverted: composition.unconverted,
    exchangeRatesUsed: composition.exchangeRatesUsed,
    netWorthUnconvertedByCurrency: composition.unconvertedByCurrency,
    netWorthDistributionCurrency: compositionCurrency,

    // Sparklines (only real series; absent keys = no data for the frontend)
    sparklines: {
      monthlyExpenses: expensesSparkline,
      monthlyIncome: incomeSparkline,
      investments: investmentSparkline,
    },

    // Transacciones
    recentTransactions: buildRecentTransactions(recentTransactions),

    // ── Fase 2 additions ──────────────────────────────────────────────────────
    byCurrency: {
      netWorth: toBuckets(netWorthBy, locale),
      totalCash: toBuckets(accountMetrics.totalCash, locale),
      savings: toBuckets(accountMetrics.savingsBalance, locale),
      receivables: toBuckets(loanMetrics.receivables, locale),
      creditCardDebt: toBuckets(accountMetrics.creditCardDebt, locale),
      creditAvailable: toBuckets(creditAvailableBy, locale),
      externalDebts: toBuckets(loanMetrics.externalDebts, locale),
      monthlyExpenses: toBuckets(txMetrics.monthlyExpenses, locale),
      monthlyIncome: toBuckets(txMetrics.monthlyIncome, locale),
      investments: toBuckets(accountMetrics.investmentsBalance, locale),
      maxSpendable: toBuckets(maxSpendableBy, locale),
      pendingFixedExpenses: toBuckets(pendingFixedBy, locale),
      totalSavedCents: toBuckets(savedBy, locale),
    },
    investmentsBreakdown: {
      byCurrency: toBuckets(accountMetrics.investmentsBalance, locale),
      accounts: investmentBreakdownAccounts,
    },
    loans: {
      byCurrency: loanMetrics.buckets,
      totalOverdueCount: loanMetrics.totalOverdueCount,
      nextDueDate: loanMetrics.nextDueDate,
    },
    creditCards: {
      byCurrency: creditCardMetrics.buckets,
      totalDebt: primaryBucket(creditCardMetrics.totalDebt, preferredCurrency, locale),
      totalAvailableCredit: primaryBucket(
        creditCardMetrics.totalAvailable,
        preferredCurrency,
        locale
      ),
    },
    fixedExpenses: {
      byCurrency: fixedExpenseBuckets,
      upcoming: nextFixedExpenses,
    },
    variableExpenses: {
      byCurrency: variableExpenseBuckets,
    },
    savingsGoals,
    alerts,

    // Proyección de fin de período (mes + año), en COP.
    projection: moduleData.projection,
  };
}

/**
 * Sum the signed ledger amounts per account in a SINGLE grouped query.
 * Equivalent to running `getTrueBalance` per account (Rule 13), without the
 * N+1 round-trips.
 */
async function loadTrueBalances(accountIds: string[]): Promise<Map<string, number>> {
  const balances = new Map<string, number>();

  if (accountIds.length === 0) {
    return balances;
  }

  const grouped = await prisma.transaction.groupBy({
    by: ['accountId'],
    where: { accountId: { in: accountIds }, isActive: true },
    _sum: { amountCents: true },
  });

  for (const row of grouped) {
    balances.set(row.accountId, Number(row._sum.amountCents ?? 0));
  }

  return balances;
}
