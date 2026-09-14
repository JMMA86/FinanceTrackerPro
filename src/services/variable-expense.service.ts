/**
 * Variable Expenses Service (Business Logic)
 *
 * A "variable expense" is a user-defined MONITORED definition (e.g. "Fútbol",
 * "Salidas Novia"). Each monitored EXPENSE transaction references a
 * `VariableExpense` through `variableExpenseId`; `Transaction` remains the
 * source of truth (Rule 13). This service aggregates count/amount per
 * definition, month over month.
 *
 * RULE 1: All financial calculations use Decimal.js (via @/lib/money helpers)
 * RULE 2: Money is stored as integer cents (BigInt) — serialized to number on read
 * C1: Results are ALWAYS grouped per currency and NEVER mixed. Each bucket
 *     carries its own `currency`.
 *
 * Monitored semantics (mirrors `savings.service#getMaxSpendable` EXACTLY plus a
 * non-null `variableExpenseId`): an EXPENSE transaction is monitored when it is
 * active, belongs to the user, is NOT linked to a fixed expense payment
 * (`fixedExpensePaymentId === null`), is NOT linked to a SavingsContribution
 * that is active, falls within the queried date range, and belongs to one of the
 * user's active goals. Do NOT change this predicate without updating
 * `getMaxSpendable` too.
 */

import 'server-only';
import { Decimal } from 'decimal.js';
import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';
import { addCents, subtractCents, divideCents, multiplyCents } from '@/lib/money';
import { NotFoundError } from '@/lib/errors/api-errors';
import type { Currency, Prisma, TransactionType, VariableExpense } from '@prisma/client';
import type {
  VariableExpenseDefinition,
  VariableExpenseDetailResponse,
  VariableExpenseMonthStat,
  VariableExpenseMovementsResponse,
  VariableExpensesOverviewBucket,
  VariableExpensesOverviewResponse,
  VariableExpenseTransactionSerialized,
  VariableExpenseTrendPoint,
} from '@/types/variable-expense';

// ============================================================================
// Canonical ordering & date helpers
// ============================================================================

/**
 * Canonical deterministic currency order (matches the Prisma enum declaration)
 * so the per-currency breakdown is stable across calls.
 */
const CURRENCY_ORDER: Partial<Record<Currency, number>> = { COP: 0, USD: 1, EUR: 2 };

function orderCurrencies(currencies: Iterable<Currency>): Currency[] {
  return [...currencies].sort(
    (a, b) =>
      (CURRENCY_ORDER[a] ?? Number.MAX_SAFE_INTEGER) -
      (CURRENCY_ORDER[b] ?? Number.MAX_SAFE_INTEGER)
  );
}

interface DateRange {
  from: Date;
  to: Date;
}

/** First/last millisecond of a month in local time (same as savings.service). */
function monthRange(month: number, year: number): DateRange {
  return {
    from: new Date(year, month - 1, 1),
    to: new Date(year, month, 0, 23, 59, 59, 999),
  };
}

interface MonthKey {
  month: number;
  year: number;
}

function previousMonthKey(month: number, year: number): MonthKey {
  if (month === 1) {
    return { month: 12, year: year - 1 };
  }
  return { month: month - 1, year };
}

/**
 * Chronological ascending list of the last `months` months. Defaults to ending
 * at the current month; pass `endMonth`/`endYear` to anchor the window.
 */
function lastMonthKeys(months: number, endMonth?: number, endYear?: number): MonthKey[] {
  const now = new Date();
  const end = new Date(endYear ?? now.getFullYear(), (endMonth ?? now.getMonth() + 1) - 1, 1);
  const keys: MonthKey[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth() - offset, 1);
    keys.push({ month: date.getMonth() + 1, year: date.getFullYear() });
  }
  return keys;
}

const TREND_DEFAULT_MONTHS = 6;
const TREND_MIN_MONTHS = 1;
const TREND_MAX_MONTHS = 24;

/**
 * Clamp the requested trend window to a finite integer in [1, 24]. Non-finite
 * inputs (NaN/Infinity) fall back to the default so the month loop can never
 * run unbounded.
 */
function clampMonths(months: number): number {
  if (!Number.isFinite(months)) return TREND_DEFAULT_MONTHS;
  return Math.min(TREND_MAX_MONTHS, Math.max(TREND_MIN_MONTHS, Math.trunc(months)));
}

// ============================================================================
// Money helpers
// ============================================================================

/**
 * EXPENSE amounts are stored as negative: convert the sign with Decimal.js
 * (subtractCents) so we never rely on IEEE-754 Math.abs over money.
 */
function expenseMagnitude(storedCents: number): number {
  return storedCents < 0 ? subtractCents(0, storedCents) : storedCents;
}

const MAX_SAFE_CENTS_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE_CENTS_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Convert a monetary BIGINT to a JS number, failing loudly if the value would
 * lose precision. Values are validation-bounded by MAX_SAFE_CENTS, so this is a
 * defensive guard against corrupted/legacy rows rather than an expected path.
 */
function toSafeCents(value: bigint, field: string): number {
  if (value > MAX_SAFE_CENTS_BIGINT || value < MIN_SAFE_CENTS_BIGINT) {
    log.error(
      { field, value: value.toString() },
      '[VARIABLE_EXPENSE] Monetary BIGINT exceeds safe integer range'
    );
    throw new RangeError(`Monetary value out of safe integer range for ${field}`);
  }
  return Number(value);
}

/**
 * part / total as a percentage, Decimal ROUND_HALF_EVEN, 1 decimal. Kept as a
 * shared helper for share-of-total visualizations.
 */
export function sharePercentage(partCents: number, totalCents: number): number {
  if (totalCents === 0) return 0;
  return new Decimal(partCents)
    .dividedBy(totalCents)
    .times(100)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

/** Variation vs previous month; null when there is no previous base. */
function deltaPercentage(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return new Decimal(subtractCents(current, previous))
    .dividedBy(previous)
    .times(100)
    .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
    .toNumber();
}

// ============================================================================
// Base query — monitored variable-expense predicate
// ============================================================================

/**
 * Base filter for monitored variable expenses. Replicates the EXACT semantics
 * used by `savings.service#getMaxSpendable` for its variable bucket: active
 * EXPENSE transactions of the user that are neither linked to a fixed expense
 * payment nor to a SavingsContribution that is active, dated within the queried
 * range, and belonging to one of the user's active goals. On top of that, the
 * transaction must be linked to an ACTIVE `VariableExpense` definition
 * (`variableExpenseId != null` AND `variableExpense.isActive`).
 *
 * A soft-deleted definition stops being monitored: its transactions are no
 * longer aggregated here, but they still live in the ledger and still count as
 * variable expenses for `getMaxSpendable`, which does not depend on
 * `variableExpenseId`. Keep the shared exclusions in sync with
 * `getMaxSpendable` — both must exclude the same transactions or their totals
 * will silently diverge.
 */
export function buildVariableExpenseWhere(
  userId: string,
  from: Date,
  to: Date
): Prisma.TransactionWhereInput {
  return {
    userId,
    isActive: true,
    type: 'EXPENSE',
    fixedExpensePaymentId: null,
    variableExpenseId: { not: null },
    variableExpense: { isActive: true },
    savingsContributions: {
      none: {
        isActive: true,
        date: { gte: from, lte: to },
        goal: { userId, isActive: true },
      },
    },
    date: { gte: from, lte: to },
  };
}

// ============================================================================
// Serialization
// ============================================================================

/** A definition row, optionally with its configured category relation loaded. */
type VariableExpenseWithCategory = VariableExpense & {
  category?: { id: string; name: string; color: string | null } | null;
};

/** Convert a Prisma VariableExpense (BigInt target) to a JSON-safe contract. */
export function serializeVariableExpenseDefinition(
  definition: VariableExpenseWithCategory
): VariableExpenseDefinition {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    color: definition.color,
    icon: definition.icon,
    categoryId: definition.categoryId,
    category: definition.category
      ? {
          id: definition.category.id,
          name: definition.category.name,
          color: definition.category.color,
        }
      : null,
    expectedTimesPerMonth: definition.expectedTimesPerMonth,
    expectedAmountCents:
      definition.expectedAmountCents == null
        ? null
        : toSafeCents(definition.expectedAmountCents, 'expectedAmountCents'),
    currency: definition.currency,
    isActive: definition.isActive,
  };
}

interface TransactionRow {
  id: string;
  description: string | null;
  amountCents: bigint;
  currency: Currency;
  type: TransactionType;
  date: Date;
  accountId: string;
  account: { name: string } | null;
  categoryId: string | null;
  category: { id: string; name: string; color: string | null } | null;
  variableExpenseId: string | null;
}

function serializeTransactionRow(
  transaction: TransactionRow
): VariableExpenseTransactionSerialized {
  return {
    id: transaction.id,
    description: transaction.description,
    amountCents: expenseMagnitude(toSafeCents(transaction.amountCents, 'amountCents')),
    currency: transaction.currency,
    type: transaction.type,
    date: transaction.date,
    accountId: transaction.accountId,
    accountName: transaction.account?.name ?? null,
    categoryId: transaction.categoryId,
    category: transaction.category
      ? {
          id: transaction.category.id,
          name: transaction.category.name,
          color: transaction.category.color,
        }
      : null,
    variableExpenseId: transaction.variableExpenseId,
  };
}

// ============================================================================
// Overview (monthly, per definition, per currency)
// ============================================================================

interface DefinitionTotal {
  totalCents: number;
  count: number;
}

interface OverviewDefinition {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  expectedTimesPerMonth: number | null;
  expectedAmountCents: bigint | null;
  currency: Currency;
}

/**
 * Defense in depth against currency mixing: an aggregation row is only counted
 * when its transaction currency matches the definition currency; otherwise it
 * is skipped and logged (never summed silently).
 */
function currencyMatches(
  variableExpenseId: string,
  transactionCurrency: Currency,
  definitionCurrency: Currency
): boolean {
  if (transactionCurrency === definitionCurrency) return true;
  log.warn(
    { variableExpenseId, transactionCurrency, definitionCurrency },
    '[VARIABLE_EXPENSE] Skipping transaction whose currency differs from its definition'
  );
  return false;
}

function aggregateByDefinition(
  rows: ReadonlyArray<{
    variableExpenseId: string | null;
    amountCents: bigint;
    currency: Currency;
  }>,
  definitionsById: Map<string, Currency>
): Map<string, DefinitionTotal> {
  const totals = new Map<string, DefinitionTotal>();
  for (const row of rows) {
    if (row.variableExpenseId === null) continue;
    const definitionCurrency = definitionsById.get(row.variableExpenseId);
    if (definitionCurrency === undefined) continue;
    if (!currencyMatches(row.variableExpenseId, row.currency, definitionCurrency)) continue;

    const magnitude = expenseMagnitude(toSafeCents(row.amountCents, 'amountCents'));
    const current = totals.get(row.variableExpenseId) ?? { totalCents: 0, count: 0 };
    totals.set(row.variableExpenseId, current);
    current.totalCents = addCents(current.totalCents, magnitude);
    current.count += 1;
  }
  return totals;
}

function buildStat(
  definition: OverviewDefinition,
  current: DefinitionTotal | undefined,
  previous: DefinitionTotal | undefined
): VariableExpenseMonthStat {
  const count = current?.count ?? 0;
  const totalCents = current?.totalCents ?? 0;
  const prevCount = previous?.count ?? 0;
  const prevTotalCents = previous?.totalCents ?? 0;
  const expectedAmountCents =
    definition.expectedAmountCents == null
      ? null
      : toSafeCents(definition.expectedAmountCents, 'expectedAmountCents');
  // expectedAmountCents is PER OCCURRENCE: the monthly target is the product.
  const expectedTotalCents =
    expectedAmountCents != null && definition.expectedTimesPerMonth != null
      ? multiplyCents(expectedAmountCents, definition.expectedTimesPerMonth)
      : null;
  return {
    variableExpenseId: definition.id,
    name: definition.name,
    color: definition.color,
    icon: definition.icon,
    currency: definition.currency,
    expectedTimesPerMonth: definition.expectedTimesPerMonth,
    expectedAmountCents,
    expectedTotalCents,
    count,
    totalCents,
    averageCents: count === 0 ? 0 : divideCents(totalCents, count),
    prevCount,
    prevTotalCents,
    deltaCountPct: deltaPercentage(count, prevCount),
    deltaAmountPct: deltaPercentage(totalCents, prevTotalCents),
  };
}

function groupStatsByCurrency(stats: VariableExpenseMonthStat[]): VariableExpensesOverviewBucket[] {
  const byCurrency = new Map<Currency, VariableExpenseMonthStat[]>();
  for (const stat of stats) {
    const list = byCurrency.get(stat.currency) ?? [];
    list.push(stat);
    byCurrency.set(stat.currency, list);
  }

  return orderCurrencies(byCurrency.keys()).map((currency) => {
    const bucketStats = (byCurrency.get(currency) ?? []).sort(
      (a, b) => b.totalCents - a.totalCents
    );
    let totalCents = 0;
    let transactionCount = 0;
    for (const stat of bucketStats) {
      totalCents = addCents(totalCents, stat.totalCents);
      transactionCount += stat.count;
    }
    return {
      currency,
      totalCents,
      transactionCount,
      definitionsCount: bucketStats.length,
      stats: bucketStats,
    };
  });
}

/**
 * Get the monitored variable expenses of a month, aggregated per definition
 * (and grouped by the definition's currency). Definitions with zero
 * occurrences are included with zeroed stats so the UI can surface the gap vs
 * their expected targets.
 */
export async function getVariableExpensesOverview(
  userId: string,
  month: number,
  year: number
): Promise<VariableExpensesOverviewResponse> {
  const currentRange = monthRange(month, year);
  const previousKey = previousMonthKey(month, year);
  const previousRange = monthRange(previousKey.month, previousKey.year);

  const [definitions, currentRows, previousRows] = await Promise.all([
    prisma.variableExpense.findMany({
      where: { userId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        color: true,
        icon: true,
        expectedTimesPerMonth: true,
        expectedAmountCents: true,
        currency: true,
      },
    }),
    prisma.transaction.findMany({
      where: buildVariableExpenseWhere(userId, currentRange.from, currentRange.to),
      select: { variableExpenseId: true, amountCents: true, currency: true },
    }),
    prisma.transaction.findMany({
      where: buildVariableExpenseWhere(userId, previousRange.from, previousRange.to),
      select: { variableExpenseId: true, amountCents: true, currency: true },
    }),
  ]);

  const definitionsById = new Map<string, Currency>(
    definitions.map((definition): [string, Currency] => [definition.id, definition.currency])
  );
  const currentTotals = aggregateByDefinition(currentRows, definitionsById);
  const previousTotals = aggregateByDefinition(previousRows, definitionsById);
  const stats = definitions.map((definition) =>
    buildStat(definition, currentTotals.get(definition.id), previousTotals.get(definition.id))
  );
  const byCurrency = groupStatsByCurrency(stats);

  log.info(
    {
      userId,
      month,
      year,
      definitions: definitions.length,
      byCurrency: byCurrency.map((bucket) => ({
        currency: bucket.currency,
        totalCents: bucket.totalCents,
        transactionCount: bucket.transactionCount,
      })),
    },
    '[VARIABLE_EXPENSE] Monitored overview calculated per currency'
  );

  return { month, year, byCurrency };
}

// ============================================================================
// Detail (one definition, one month + trend + transactions)
// ============================================================================

function buildTrend(
  rows: ReadonlyArray<{ amountCents: bigint; date: Date }>,
  monthKeys: MonthKey[]
): VariableExpenseTrendPoint[] {
  const totals = new Map<string, VariableExpenseTrendPoint>();
  for (const row of rows) {
    const magnitude = expenseMagnitude(toSafeCents(row.amountCents, 'amountCents'));
    const key = `${row.date.getFullYear()}-${row.date.getMonth() + 1}`;
    const point = totals.get(key) ?? {
      month: row.date.getMonth() + 1,
      year: row.date.getFullYear(),
      count: 0,
      totalCents: 0,
    };
    totals.set(key, point);
    point.totalCents = addCents(point.totalCents, magnitude);
    point.count += 1;
  }

  return monthKeys.map(({ month, year }) => {
    const point = totals.get(`${year}-${month}`);
    return {
      month,
      year,
      count: point?.count ?? 0,
      totalCents: point?.totalCents ?? 0,
    };
  });
}

/** Lower bound used when a detail query spans the whole history. */
const HISTORY_START = new Date(2000, 0, 1);

/**
 * Get one monitored definition, either for a concrete month or for its whole
 * history.
 *
 * - With `month` + `year`: totals and transactions of that month, and the trend
 *   window ends at that month (`scope: 'month'`).
 * - Without them: totals and transactions of the entire history, and the trend
 *   window ends at the current month (`scope: 'all'`).
 *
 * @throws NotFoundError when the definition does not exist, is inactive or
 *   belongs to another user.
 */
export async function getVariableExpenseDetail(
  userId: string,
  variableExpenseId: string,
  month?: number,
  year?: number,
  trendMonths = TREND_DEFAULT_MONTHS
): Promise<VariableExpenseDetailResponse> {
  const definition = await prisma.variableExpense.findUnique({
    where: { id: variableExpenseId },
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  if (!definition?.isActive || definition.userId !== userId) {
    throw new NotFoundError('VariableExpense', variableExpenseId);
  }

  const hasMonth = month !== undefined && year !== undefined;
  const scope: 'month' | 'all' = hasMonth ? 'month' : 'all';
  const now = new Date();
  const anchorMonth = month ?? now.getMonth() + 1;
  const anchorYear = year ?? now.getFullYear();

  const monthKeys = lastMonthKeys(clampMonths(trendMonths), anchorMonth, anchorYear);
  const first = monthKeys[0];
  const last = monthKeys.at(-1) ?? first;
  const trendRange = {
    from: new Date(first.year, first.month - 1, 1),
    to: new Date(last.year, last.month, 0, 23, 59, 59, 999),
  };

  // Requested month, or the whole history (bounded below by HISTORY_START).
  const rangeStart = hasMonth ? new Date(anchorYear, anchorMonth - 1, 1) : HISTORY_START;
  const rangeEnd = new Date(anchorYear, anchorMonth, 0, 23, 59, 59, 999);
  const listWhere: Prisma.TransactionWhereInput = {
    ...buildVariableExpenseWhere(userId, rangeStart, rangeEnd),
    variableExpenseId,
  };

  const [monthRows, trendRows, transactions] = await Promise.all([
    prisma.transaction.findMany({
      where: listWhere,
      select: { amountCents: true, currency: true },
    }),
    prisma.transaction.findMany({
      where: {
        ...buildVariableExpenseWhere(userId, trendRange.from, trendRange.to),
        variableExpenseId,
      },
      select: { amountCents: true, date: true, currency: true },
    }),
    prisma.transaction.findMany({
      where: listWhere,
      orderBy: { date: 'desc' },
      include: {
        account: { select: { name: true } },
        category: { select: { id: true, name: true, color: true } },
      },
    }),
  ]);

  let count = 0;
  let totalCents = 0;
  for (const row of monthRows) {
    if (!currencyMatches(variableExpenseId, row.currency, definition.currency)) continue;
    totalCents = addCents(
      totalCents,
      expenseMagnitude(toSafeCents(row.amountCents, 'amountCents'))
    );
    count += 1;
  }

  const matchingTrendRows = trendRows.filter((row) =>
    currencyMatches(variableExpenseId, row.currency, definition.currency)
  );

  // Keep the listed movements consistent with the aggregates: rows whose
  // currency differs from the definition are neither summed nor listed.
  const matchingTransactions = transactions.filter((row) =>
    currencyMatches(variableExpenseId, row.currency, definition.currency)
  );

  log.info(
    { userId, variableExpenseId, scope, month: anchorMonth, year: anchorYear, count, totalCents },
    '[VARIABLE_EXPENSE] Monitored detail calculated'
  );

  return {
    definition: serializeVariableExpenseDefinition(definition),
    scope,
    month: anchorMonth,
    year: anchorYear,
    count,
    totalCents,
    averageCents: count === 0 ? 0 : divideCents(totalCents, count),
    trend: buildTrend(matchingTrendRows, monthKeys),
    transactions: matchingTransactions.map(serializeTransactionRow),
  };
}

// ============================================================================
// Definitions (manager + transaction form)
// ============================================================================

/**
 * List the user's monitored definitions. Active only by default; pass
 * `includeInactive` to also return soft-deleted ones.
 */
export async function getVariableExpenseDefinitions(
  userId: string,
  includeInactive = false
): Promise<VariableExpenseDefinition[]> {
  const definitions = await prisma.variableExpense.findMany({
    where: { userId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: 'asc' },
    include: { category: { select: { id: true, name: true, color: true } } },
  });

  return definitions.map(serializeVariableExpenseDefinition);
}

// ============================================================================
// Movements (filtered by month and/or definition)
// ============================================================================

/** Requested month when both parts are present, otherwise the whole history. */
function resolveMovementsRange(
  month: number | undefined,
  year: number | undefined,
  now: Date
): DateRange {
  if (month !== undefined && year !== undefined) {
    return monthRange(month, year);
  }
  return {
    from: HISTORY_START,
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

/**
 * List monitored movements, optionally filtered by month and/or definition.
 * `variableExpenseId` undefined/null means "all definitions" (the "Todos" filter).
 *
 * @throws NotFoundError when a specific definition does not exist, is inactive
 *   or belongs to another user.
 */
export async function getVariableExpenseMovements(
  userId: string,
  options: { variableExpenseId?: string | null; month?: number; year?: number }
): Promise<VariableExpenseMovementsResponse> {
  const variableExpenseId = options.variableExpenseId ?? null;
  const hasMonth = options.month !== undefined && options.year !== undefined;
  const range = resolveMovementsRange(options.month, options.year, new Date());
  const scope: 'month' | 'all' = hasMonth ? 'month' : 'all';

  if (variableExpenseId !== null) {
    const definition = await prisma.variableExpense.findUnique({
      where: { id: variableExpenseId },
      select: { id: true, isActive: true, userId: true },
    });
    if (!definition?.isActive || definition.userId !== userId) {
      throw new NotFoundError('VariableExpense', variableExpenseId);
    }
  }

  const transactions = await prisma.transaction.findMany({
    where: {
      ...buildVariableExpenseWhere(userId, range.from, range.to),
      ...(variableExpenseId !== null ? { variableExpenseId } : {}),
    },
    orderBy: { date: 'desc' },
    include: {
      account: { select: { name: true } },
      category: { select: { id: true, name: true, color: true } },
      variableExpense: { select: { currency: true } },
    },
  });

  // Each row carries its own definition: the reference currency for the
  // "Todos" filter is the definition of the row. Rows that do not match are
  // neither summed nor listed, keeping the response internally consistent.
  const matchingTransactions = transactions.filter((row) => {
    if (row.currency === row.variableExpense?.currency) return true;
    log.warn(
      {
        variableExpenseId: row.variableExpenseId,
        transactionCurrency: row.currency,
        definitionCurrency: row.variableExpense?.currency ?? null,
      },
      '[VARIABLE_EXPENSE] Skipping movement whose currency differs from its definition'
    );
    return false;
  });

  let count = 0;
  let totalCents = 0;
  for (const row of matchingTransactions) {
    totalCents = addCents(
      totalCents,
      expenseMagnitude(toSafeCents(row.amountCents, 'amountCents'))
    );
    count += 1;
  }

  log.info(
    { userId, scope, variableExpenseId, count, totalCents },
    '[VARIABLE_EXPENSE] Movements calculated'
  );

  return {
    scope,
    variableExpenseId,
    count,
    totalCents,
    averageCents: count === 0 ? 0 : divideCents(totalCents, count),
    transactions: matchingTransactions.map(serializeTransactionRow),
  };
}
