/**
 * Unit tests for the PURE dashboard helpers in `src/lib/dashboard-metrics.ts`.
 *
 * These functions are the extraction target of the dashboard read path so they
 * can be exercised without Next.js server constraints. They are pure and use
 * Decimal.js for every monetary operation (Rule 1).
 */
import { describe, it, expect } from 'vitest';
import {
  isInternalTransfer,
  calculateTransactionMetrics,
  calculateTransactionMetricsByCurrency,
  buildMonthlyIncomeExpenseSeries,
  type AccountHierarchyEntry,
  type TransactionData,
} from '@/lib/dashboard-metrics';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const hierarchy: Record<string, AccountHierarchyEntry> = {
  checking1: { id: 'checking1', type: 'CHECKING', parentAccountId: null },
  savings1: { id: 'savings1', type: 'SAVINGS', parentAccountId: null },
  pocket1: { id: 'pocket1', type: 'POCKET', parentAccountId: 'checking1' },
  pocket2: { id: 'pocket2', type: 'POCKET', parentAccountId: 'checking1' },
  orphanPocket: { id: 'orphanPocket', type: 'POCKET', parentAccountId: null },
};

function makeTx(overrides: Partial<TransactionData> = {}): TransactionData {
  return {
    id: 'tx-1',
    description: 'Test',
    amountCents: 1000,
    currency: 'COP',
    type: 'INCOME',
    date: new Date('2024-06-10T00:00:00.000Z'),
    accountId: 'checking1',
    transferToAccountId: null,
    transferFromAccountId: null,
    ...overrides,
  };
}

const START_CURRENT = new Date('2024-06-01T00:00:00.000Z');
const START_LAST = new Date('2024-05-01T00:00:00.000Z');
const END_LAST = new Date('2024-05-31T23:59:59.999Z');

// ── isInternalTransfer ────────────────────────────────────────────────────────

describe('isInternalTransfer', () => {
  it('returns false when the destination account id is null', () => {
    expect(isInternalTransfer('checking1', null, hierarchy)).toBe(false);
  });

  it('returns false when either account is unknown', () => {
    expect(isInternalTransfer('unknown', 'pocket1', hierarchy)).toBe(false);
    expect(isInternalTransfer('checking1', 'unknown', hierarchy)).toBe(false);
  });

  it('treats a transfer from a parent into its pocket as internal', () => {
    expect(isInternalTransfer('checking1', 'pocket1', hierarchy)).toBe(true);
  });

  it('treats a transfer from a pocket back to its parent as internal', () => {
    expect(isInternalTransfer('pocket1', 'checking1', hierarchy)).toBe(true);
  });

  it('treats a sibling pocket-to-pocket transfer as internal when a parent exists', () => {
    expect(isInternalTransfer('pocket1', 'pocket2', hierarchy)).toBe(true);
  });

  it('does not treat a pocket-to-pocket transfer as internal when parents are null', () => {
    expect(isInternalTransfer('orphanPocket', 'orphanPocket', hierarchy)).toBe(false);
  });

  it('does not treat transfers between unrelated accounts as internal', () => {
    expect(isInternalTransfer('checking1', 'savings1', hierarchy)).toBe(false);
    expect(isInternalTransfer('savings1', 'pocket1', hierarchy)).toBe(false);
  });
});

// ── calculateTransactionMetrics (scalar, all currencies combined) ─────────────

describe('calculateTransactionMetrics', () => {
  it('accumulates current-month INCOME', () => {
    const result = calculateTransactionMetrics(
      [makeTx({ id: 'i1', amountCents: 5_000, type: 'INCOME' })],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyIncome).toBe(5_000);
    expect(result.monthlyExpenses).toBe(0);
    expect(result.lastMonthExpenses).toBe(0);
  });

  it('accumulates current-month TRANSFER_IN as income', () => {
    const result = calculateTransactionMetrics(
      [
        makeTx({
          id: 'ti',
          amountCents: 1_000,
          type: 'TRANSFER_IN',
          transferFromAccountId: 'savings1',
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyIncome).toBe(1_000);
  });

  it('accumulates the magnitude of current-month EXPENSE', () => {
    const result = calculateTransactionMetrics(
      [makeTx({ id: 'e1', amountCents: -200, type: 'EXPENSE' })],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyExpenses).toBe(200);
  });

  it('accumulates current-month TRANSFER_OUT as an expense', () => {
    const result = calculateTransactionMetrics(
      [
        makeTx({
          id: 'to',
          amountCents: -100,
          type: 'TRANSFER_OUT',
          transferToAccountId: 'savings1',
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyExpenses).toBe(100);
  });

  it('accumulates last-month EXPENSE into lastMonthExpenses', () => {
    const result = calculateTransactionMetrics(
      [
        makeTx({
          id: 'le',
          amountCents: -150,
          type: 'EXPENSE',
          date: new Date('2024-05-10T00:00:00.000Z'),
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.lastMonthExpenses).toBe(150);
    expect(result.monthlyExpenses).toBe(0);
  });

  it('ignores transactions older than last month', () => {
    const result = calculateTransactionMetrics(
      [
        makeTx({
          id: 'old',
          amountCents: -999,
          type: 'EXPENSE',
          date: new Date('2024-04-10T00:00:00.000Z'),
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyExpenses).toBe(0);
    expect(result.lastMonthExpenses).toBe(0);
  });

  it('excludes an internal parent → pocket TRANSFER_OUT from expenses', () => {
    const result = calculateTransactionMetrics(
      [
        makeTx({
          id: 'internal-out',
          amountCents: -120,
          type: 'TRANSFER_OUT',
          accountId: 'checking1',
          transferToAccountId: 'pocket1',
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyExpenses).toBe(0);
  });

  it('excludes an internal pocket → parent TRANSFER_IN from income', () => {
    const result = calculateTransactionMetrics(
      [
        makeTx({
          id: 'internal-in',
          amountCents: 120,
          type: 'TRANSFER_IN',
          accountId: 'pocket1',
          transferFromAccountId: 'checking1',
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyIncome).toBe(0);
  });

  it('still counts an external TRANSFER_OUT between unrelated accounts', () => {
    const result = calculateTransactionMetrics(
      [
        makeTx({
          id: 'external-out',
          amountCents: -150,
          type: 'TRANSFER_OUT',
          accountId: 'checking1',
          transferToAccountId: 'savings1',
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyExpenses).toBe(150);
  });

  it('ignores a positive amount whose type is not income', () => {
    const result = calculateTransactionMetrics(
      [makeTx({ id: 'adj', amountCents: 50, type: 'ADJUSTMENT' })],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyIncome).toBe(0);
    expect(result.monthlyExpenses).toBe(0);
  });

  it('ignores a negative amount whose type is INCOME', () => {
    const result = calculateTransactionMetrics(
      [makeTx({ id: 'neg-income', amountCents: -50, type: 'INCOME' })],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyIncome).toBe(0);
    expect(result.monthlyExpenses).toBe(0);
  });
});

// ── calculateTransactionMetricsByCurrency ─────────────────────────────────────

describe('calculateTransactionMetricsByCurrency', () => {
  it('keeps each currency in its own bucket (never mixed)', () => {
    const result = calculateTransactionMetricsByCurrency(
      [
        makeTx({ id: 'cop-in', amountCents: 1_000, type: 'INCOME', currency: 'COP' }),
        makeTx({ id: 'usd-in', amountCents: 2_000, type: 'INCOME', currency: 'USD' }),
        makeTx({ id: 'cop-exp', amountCents: -300, type: 'EXPENSE', currency: 'COP' }),
        makeTx({ id: 'eur-exp', amountCents: -400, type: 'EXPENSE', currency: 'EUR' }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );

    expect(result.monthlyIncome).toEqual({ COP: 1_000, USD: 2_000 });
    expect(result.monthlyExpenses).toEqual({ COP: 300, EUR: 400 });
  });

  it('accumulates last-month expenses per currency', () => {
    const result = calculateTransactionMetricsByCurrency(
      [
        makeTx({
          id: 'last-cop',
          amountCents: -500,
          type: 'EXPENSE',
          currency: 'COP',
          date: new Date('2024-05-10T00:00:00.000Z'),
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.lastMonthExpenses).toEqual({ COP: 500 });
  });

  it('excludes internal transfers from the per-currency buckets', () => {
    const result = calculateTransactionMetricsByCurrency(
      [
        makeTx({
          id: 'internal',
          amountCents: -900,
          type: 'TRANSFER_OUT',
          accountId: 'checking1',
          transferToAccountId: 'pocket1',
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyExpenses).toEqual({});
    expect(result.monthlyIncome).toEqual({});
  });

  it('ignores transactions outside the current/last month windows', () => {
    const result = calculateTransactionMetricsByCurrency(
      [
        makeTx({
          id: 'old',
          amountCents: -700,
          type: 'EXPENSE',
          date: new Date('2024-04-01T00:00:00.000Z'),
        }),
      ],
      START_CURRENT,
      START_LAST,
      END_LAST,
      hierarchy
    );
    expect(result.monthlyExpenses).toEqual({});
  });
});

// ── buildMonthlyIncomeExpenseSeries ───────────────────────────────────────────

describe('buildMonthlyIncomeExpenseSeries', () => {
  const monthStarts = [
    new Date('2024-04-01T00:00:00.000Z'),
    new Date('2024-05-01T00:00:00.000Z'),
    new Date('2024-06-01T00:00:00.000Z'),
  ];
  const now = new Date('2024-06-15T00:00:00.000Z');

  it('builds one bucket per month, oldest → newest', () => {
    const transactions: TransactionData[] = [
      makeTx({
        id: 'apr',
        amountCents: 1_000,
        type: 'INCOME',
        date: new Date('2024-04-10T00:00:00.000Z'),
      }),
      makeTx({
        id: 'may',
        amountCents: -2_000,
        type: 'EXPENSE',
        date: new Date('2024-05-10T00:00:00.000Z'),
      }),
      makeTx({
        id: 'jun',
        amountCents: 3_000,
        type: 'INCOME',
        date: new Date('2024-06-10T00:00:00.000Z'),
      }),
    ];

    const series = buildMonthlyIncomeExpenseSeries(
      transactions,
      monthStarts,
      hierarchy,
      'COP',
      now
    );

    expect(series.income).toEqual([1_000, 0, 3_000]);
    expect(series.expenses).toEqual([0, 2_000, 0]);
  });

  it('only aggregates the requested currency', () => {
    const transactions: TransactionData[] = [
      makeTx({
        id: 'usd',
        amountCents: 5_000,
        type: 'INCOME',
        currency: 'USD',
        date: new Date('2024-06-10T00:00:00.000Z'),
      }),
      makeTx({
        id: 'cop',
        amountCents: 1_000,
        type: 'INCOME',
        currency: 'COP',
        date: new Date('2024-06-10T00:00:00.000Z'),
      }),
    ];

    const series = buildMonthlyIncomeExpenseSeries(
      transactions,
      monthStarts,
      hierarchy,
      'COP',
      now
    );

    expect(series.income).toEqual([0, 0, 1_000]);
  });

  it('excludes internal pocket transfers', () => {
    const transactions: TransactionData[] = [
      makeTx({
        id: 'internal',
        amountCents: -800,
        type: 'TRANSFER_OUT',
        accountId: 'checking1',
        transferToAccountId: 'pocket1',
        date: new Date('2024-06-10T00:00:00.000Z'),
      }),
    ];

    const series = buildMonthlyIncomeExpenseSeries(
      transactions,
      monthStarts,
      hierarchy,
      'COP',
      now
    );

    expect(series.expenses).toEqual([0, 0, 0]);
  });

  it('returns empty arrays when there are no month buckets', () => {
    const series = buildMonthlyIncomeExpenseSeries([], [], hierarchy, 'COP', now);
    expect(series).toEqual({ income: [], expenses: [] });
  });
});
