/**
 * Variable Expense Service Unit Tests
 *
 * Unit tests for src/services/variable-expense.service.ts with prisma + logger
 * mocked. These lock the per-definition/per-currency aggregation (C1), the
 * expected-monthly-total math (expectedAmountCents × expectedTimesPerMonth via
 * multiplyCents), the month-over-month deltas (ROUND_HALF_EVEN, null base), the
 * defensive currency-mismatch skip and the monitored-transaction predicate
 * WITHOUT requiring a database.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildVariableExpenseWhere,
  getVariableExpenseDefinitions,
  getVariableExpenseDetail,
  getVariableExpenseMovements,
  getVariableExpensesOverview,
  serializeVariableExpenseDefinition,
  sharePercentage,
} from '../variable-expense.service';

// ---------------------------------------------------------------------------
// Mocked prisma + logger
// ---------------------------------------------------------------------------

const { mockPrisma, mockLog } = vi.hoisted(() => ({
  mockPrisma: {
    variableExpense: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
  },
  mockLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ log: mockLog }));
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type Currency = 'COP' | 'USD' | 'EUR';

interface DefinitionFixture {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  expectedTimesPerMonth: number | null;
  expectedAmountCents: bigint | null;
  currency: Currency;
}

function definition(overrides: Partial<DefinitionFixture> = {}): DefinitionFixture {
  return {
    id: 'def-1',
    name: 'Fútbol',
    color: '#14b8a6',
    icon: 'dumbbell',
    expectedTimesPerMonth: 4,
    expectedAmountCents: BigInt(5000),
    currency: 'COP',
    ...overrides,
  };
}

function transactionRow(overrides: {
  variableExpenseId: string | null;
  amountCents: bigint;
  currency: Currency;
  date?: Date;
}) {
  return {
    variableExpenseId: overrides.variableExpenseId,
    amountCents: overrides.amountCents,
    currency: overrides.currency,
    date: overrides.date ?? new Date(2026, 8, 10),
  };
}

describe('variable-expense.service (unit)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.variableExpense.findMany.mockResolvedValue([]);
    mockPrisma.variableExpense.findUnique.mockResolvedValue(null);
    mockPrisma.transaction.findMany.mockResolvedValue([]);
  });

  // ==========================================================================
  // sharePercentage
  // ==========================================================================

  describe('sharePercentage', () => {
    it('returns the rounded share with ROUND_HALF_EVEN (1 decimal)', () => {
      expect(sharePercentage(25, 100)).toBe(25);
      // 1/3 = 33.333... → 33.3
      expect(sharePercentage(1, 3)).toBe(33.3);
      // 2/3 = 66.666... → 66.7 (half-even on the 2nd decimal, 1 dp)
      expect(sharePercentage(2, 3)).toBe(66.7);
    });

    it('returns 0 when the total is zero (division-by-zero guard)', () => {
      expect(sharePercentage(123, 0)).toBe(0);
      expect(sharePercentage(0, 0)).toBe(0);
    });
  });

  // ==========================================================================
  // buildVariableExpenseWhere (monitored predicate)
  // ==========================================================================

  describe('buildVariableExpenseWhere', () => {
    it('builds the exact monitored-variable-expense predicate', () => {
      const from = new Date(2026, 8, 1);
      const to = new Date(2026, 8, 30, 23, 59, 59, 999);

      const where = buildVariableExpenseWhere('user-1', from, to);

      expect(where).toMatchObject({
        userId: 'user-1',
        isActive: true,
        type: 'EXPENSE',
        fixedExpensePaymentId: null,
        variableExpenseId: { not: null },
        variableExpense: { isActive: true },
        date: { gte: from, lte: to },
      });
      // Savings contributions that are active and inside the window are
      // excluded (mirrors getMaxSpendable).
      expect(where.savingsContributions).toEqual({
        none: {
          isActive: true,
          date: { gte: from, lte: to },
          goal: { userId: 'user-1', isActive: true },
        },
      });
    });
  });

  // ==========================================================================
  // serializeVariableExpenseDefinition
  // ==========================================================================

  describe('serializeVariableExpenseDefinition', () => {
    it('converts the BigInt target to a number and maps the category', () => {
      const result = serializeVariableExpenseDefinition({
        ...definition({ expectedAmountCents: BigInt(123456) }),
        description: 'desc',
        categoryId: 'cat-1',
        category: { id: 'cat-1', name: 'Deporte', color: '#000000' },
        isActive: true,
      } as never);

      expect(result.expectedAmountCents).toBe(123456);
      expect(result.category).toEqual({ id: 'cat-1', name: 'Deporte', color: '#000000' });
    });

    it('keeps a null target and a null category', () => {
      const result = serializeVariableExpenseDefinition({
        ...definition({ expectedAmountCents: null, expectedTimesPerMonth: null }),
        description: null,
        categoryId: null,
        category: null,
        isActive: true,
      } as never);

      expect(result.expectedAmountCents).toBeNull();
      expect(result.category).toBeNull();
    });

    it('fails loudly (RangeError) when the BigInt target exceeds the safe range', () => {
      expect(() =>
        serializeVariableExpenseDefinition({
          ...definition({ expectedAmountCents: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1) }),
          description: null,
          categoryId: null,
          category: null,
          isActive: true,
        } as never)
      ).toThrow(RangeError);
      expect(mockLog.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getVariableExpensesOverview
  // ==========================================================================

  describe('getVariableExpensesOverview', () => {
    it('groups per definition and per definition currency, including zero-occurrence definitions', async () => {
      mockPrisma.variableExpense.findMany.mockResolvedValue([
        definition({ id: 'def-cop', name: 'Fútbol', currency: 'COP' }),
        definition({
          id: 'def-zero',
          name: 'Café',
          currency: 'COP',
          expectedTimesPerMonth: 2,
          expectedAmountCents: BigInt(1000),
        }),
        definition({
          id: 'def-usd',
          name: 'Salidas',
          currency: 'USD',
          expectedTimesPerMonth: null,
          expectedAmountCents: null,
        }),
      ]);
      mockPrisma.transaction.findMany
        // current month
        .mockResolvedValueOnce([
          transactionRow({
            variableExpenseId: 'def-cop',
            amountCents: BigInt(-10000),
            currency: 'COP',
          }),
          transactionRow({
            variableExpenseId: 'def-cop',
            amountCents: BigInt(-5000),
            currency: 'COP',
          }),
          transactionRow({
            variableExpenseId: 'def-usd',
            amountCents: BigInt(-700),
            currency: 'USD',
          }),
        ])
        // previous month
        .mockResolvedValueOnce([
          transactionRow({
            variableExpenseId: 'def-cop',
            amountCents: BigInt(-8000),
            currency: 'COP',
          }),
        ]);

      const result = await getVariableExpensesOverview('user-1', 9, 2026);

      expect(result.month).toBe(9);
      expect(result.year).toBe(2026);
      expect(result.byCurrency.map((bucket) => bucket.currency)).toEqual(['COP', 'USD']);

      const cop = result.byCurrency.find((bucket) => bucket.currency === 'COP')!;
      expect(cop.totalCents).toBe(15000);
      expect(cop.transactionCount).toBe(2);
      expect(cop.definitionsCount).toBe(2);
      // Stats sorted by totalCents desc, zero-occurrence definition included.
      expect(cop.stats.map((stat) => stat.variableExpenseId)).toEqual(['def-cop', 'def-zero']);

      const copStat = cop.stats.find((stat) => stat.variableExpenseId === 'def-cop')!;
      // expectedAmountCents is PER occurrence: monthly target is the product.
      expect(copStat.expectedTotalCents).toBe(20000);
      expect(copStat.count).toBe(2);
      expect(copStat.totalCents).toBe(15000);
      expect(copStat.averageCents).toBe(7500);
      expect(copStat.prevCount).toBe(1);
      expect(copStat.prevTotalCents).toBe(8000);
      expect(copStat.deltaCountPct).toBe(100);
      expect(copStat.deltaAmountPct).toBe(87.5);

      const zeroStat = cop.stats.find((stat) => stat.variableExpenseId === 'def-zero')!;
      expect(zeroStat.expectedTotalCents).toBe(2000);
      expect(zeroStat.count).toBe(0);
      expect(zeroStat.totalCents).toBe(0);
      expect(zeroStat.averageCents).toBe(0);
      // No previous base → null, never Infinity/NaN.
      expect(zeroStat.deltaCountPct).toBeNull();
      expect(zeroStat.deltaAmountPct).toBeNull();

      const usd = result.byCurrency.find((bucket) => bucket.currency === 'USD')!;
      expect(usd.totalCents).toBe(700);
      expect(usd.transactionCount).toBe(1);
      const usdStat = usd.stats[0];
      // Missing target → no computed monthly total.
      expect(usdStat.expectedTotalCents).toBeNull();
      expect(usdStat.averageCents).toBe(700);
      expect(usdStat.deltaAmountPct).toBeNull();
    });

    it('only queries ACTIVE definitions of the user', async () => {
      await getVariableExpensesOverview('user-1', 9, 2026);

      expect(mockPrisma.variableExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1', isActive: true },
        })
      );
    });

    it('omits (and logs) a transaction whose currency differs from its definition currency', async () => {
      mockPrisma.variableExpense.findMany.mockResolvedValue([
        definition({ id: 'def-cop', currency: 'COP' }),
      ]);
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([
          // A USD transaction wrongly linked to a COP definition must never be summed.
          transactionRow({
            variableExpenseId: 'def-cop',
            amountCents: BigInt(-9999),
            currency: 'USD',
          }),
        ])
        .mockResolvedValueOnce([]);

      const result = await getVariableExpensesOverview('user-1', 9, 2026);

      const cop = result.byCurrency.find((bucket) => bucket.currency === 'COP')!;
      expect(cop.totalCents).toBe(0);
      expect(cop.transactionCount).toBe(0);
      expect(cop.stats[0].count).toBe(0);
      expect(mockLog.warn).toHaveBeenCalled();
    });

    it('returns no buckets when the user has no definitions', async () => {
      const result = await getVariableExpensesOverview('user-1', 9, 2026);
      expect(result.byCurrency).toEqual([]);
    });
  });

  // ==========================================================================
  // getVariableExpenseDefinitions
  // ==========================================================================

  describe('getVariableExpenseDefinitions', () => {
    it('returns active definitions by default and includes the category', async () => {
      mockPrisma.variableExpense.findMany.mockResolvedValue([
        {
          ...definition(),
          description: null,
          categoryId: 'cat-1',
          category: { id: 'cat-1', name: 'Deporte', color: '#000000' },
          isActive: true,
        },
      ]);

      const result = await getVariableExpenseDefinitions('user-1');

      expect(mockPrisma.variableExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', isActive: true } })
      );
      expect(result).toHaveLength(1);
      expect(result[0].expectedAmountCents).toBe(5000);
      expect(result[0].category?.name).toBe('Deporte');
    });

    it('includes inactive definitions when includeInactive is true', async () => {
      await getVariableExpenseDefinitions('user-1', true);

      expect(mockPrisma.variableExpense.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1' } })
      );
      const where = mockPrisma.variableExpense.findMany.mock.calls[0][0].where;
      expect(where.isActive).toBeUndefined();
    });
  });

  // ==========================================================================
  // getVariableExpenseDetail
  // ==========================================================================

  describe('getVariableExpenseDetail', () => {
    function activeDefinitionRow() {
      return {
        ...definition({ id: 'def-1', currency: 'COP' }),
        userId: 'user-1',
        description: null,
        categoryId: null,
        category: null,
        isActive: true,
      };
    }

    it('returns the requested month scope with a zero-filled trend ending at that month', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue(activeDefinitionRow());
      mockPrisma.transaction.findMany
        // monthRows
        .mockResolvedValueOnce([
          { amountCents: BigInt(-1000), currency: 'COP' },
          { amountCents: BigInt(-2000), currency: 'COP' },
        ])
        // trendRows
        .mockResolvedValueOnce([
          { amountCents: BigInt(-1000), currency: 'COP', date: new Date(2026, 8, 5) },
          { amountCents: BigInt(-500), currency: 'COP', date: new Date(2026, 6, 5) },
        ])
        // transactions list
        .mockResolvedValueOnce([]);

      const result = await getVariableExpenseDetail('user-1', 'def-1', 9, 2026, 3);

      expect(result.scope).toBe('month');
      expect(result.month).toBe(9);
      expect(result.year).toBe(2026);
      expect(result.count).toBe(2);
      expect(result.totalCents).toBe(3000);
      expect(result.averageCents).toBe(1500);
      expect(result.trend).toHaveLength(3);
      // Ends at the requested month (Jul, Ago, Sep).
      expect(result.trend.map((point) => point.month)).toEqual([7, 8, 9]);
      expect(result.trend[0]).toMatchObject({ month: 7, count: 1, totalCents: 500 });
      expect(result.trend[1]).toMatchObject({ month: 8, count: 0, totalCents: 0 });
      expect(result.trend[2]).toMatchObject({ month: 9, count: 1, totalCents: 1000 });
    });

    it('returns the full-history scope when month/year are omitted', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue(activeDefinitionRow());
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([{ amountCents: BigInt(-4000), currency: 'COP' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await getVariableExpenseDetail('user-1', 'def-1');

      expect(result.scope).toBe('all');
      expect(result.totalCents).toBe(4000);
      // The list query is bounded below by HISTORY_START (whole history).
      const listQuery = mockPrisma.transaction.findMany.mock.calls[0][0];
      expect(listQuery.where.variableExpenseId).toBe('def-1');
      expect(listQuery.where.date.gte.getFullYear()).toBe(2000);
    });

    it('throws NotFoundError when the definition does not exist', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue(null);
      await expect(getVariableExpenseDetail('user-1', 'missing', 9, 2026)).rejects.toThrow(
        'VariableExpense with ID missing not found'
      );
    });

    it('throws NotFoundError when the definition is inactive', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue({
        ...activeDefinitionRow(),
        isActive: false,
      });
      await expect(getVariableExpenseDetail('user-1', 'def-1', 9, 2026)).rejects.toThrow(
        /not found/
      );
    });

    it('throws NotFoundError when the definition belongs to another user', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue({
        ...activeDefinitionRow(),
        userId: 'other-user',
      });
      await expect(getVariableExpenseDetail('user-1', 'def-1', 9, 2026)).rejects.toThrow(
        /not found/
      );
    });

    it('filters mismatched currencies out of totals, trend and transactions', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue(activeDefinitionRow());
      mockPrisma.transaction.findMany
        .mockResolvedValueOnce([
          { amountCents: BigInt(-1000), currency: 'COP' },
          { amountCents: BigInt(-9999), currency: 'USD' },
        ])
        .mockResolvedValueOnce([
          { amountCents: BigInt(-1000), currency: 'COP', date: new Date(2026, 8, 5) },
          { amountCents: BigInt(-9999), currency: 'USD', date: new Date(2026, 8, 6) },
        ])
        .mockResolvedValueOnce([]);

      const result = await getVariableExpenseDetail('user-1', 'def-1', 9, 2026, 1);

      expect(result.count).toBe(1);
      expect(result.totalCents).toBe(1000);
      expect(result.trend[0].totalCents).toBe(1000);
      expect(mockLog.warn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getVariableExpenseMovements
  // ==========================================================================

  describe('getVariableExpenseMovements', () => {
    const definitionRow = { id: 'def-1', isActive: true, userId: 'user-1' };

    it('validates ownership when a definition id is provided and filters by month', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue(definitionRow);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          description: 'Partido',
          amountCents: BigInt(-3000),
          currency: 'COP',
          type: 'EXPENSE',
          date: new Date(2026, 8, 10),
          accountId: 'acc-1',
          account: { name: 'Cuenta' },
          categoryId: null,
          category: null,
          variableExpenseId: 'def-1',
          variableExpense: { currency: 'COP' },
        },
      ]);

      const result = await getVariableExpenseMovements('user-1', {
        variableExpenseId: 'def-1',
        month: 9,
        year: 2026,
      });

      expect(result.scope).toBe('month');
      expect(result.variableExpenseId).toBe('def-1');
      expect(result.count).toBe(1);
      expect(result.totalCents).toBe(3000);
      expect(result.averageCents).toBe(3000);
      expect(result.transactions[0].amountCents).toBe(3000);
      expect(result.transactions[0].accountName).toBe('Cuenta');
    });

    it('skips the definition lookup and uses the whole-history scope for "all"', async () => {
      const result = await getVariableExpenseMovements('user-1', {});

      expect(result.scope).toBe('all');
      expect(result.variableExpenseId).toBeNull();
      expect(mockPrisma.variableExpense.findUnique).not.toHaveBeenCalled();
      const query = mockPrisma.transaction.findMany.mock.calls[0][0];
      // Base predicate only: any non-null definition, no specific id filter.
      expect(query.where.variableExpenseId).toEqual({ not: null });
    });

    it('omits rows whose currency differs from the definition currency', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue(definitionRow);
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-usd',
          description: 'Wrong currency',
          amountCents: BigInt(-9999),
          currency: 'USD',
          type: 'EXPENSE',
          date: new Date(2026, 8, 10),
          accountId: 'acc-1',
          account: null,
          categoryId: null,
          category: null,
          variableExpenseId: 'def-1',
          variableExpense: { currency: 'COP' },
        },
        {
          id: 'tx-cop',
          description: 'Right currency',
          amountCents: BigInt(-1000),
          currency: 'COP',
          type: 'EXPENSE',
          date: new Date(2026, 8, 10),
          accountId: 'acc-1',
          account: null,
          categoryId: null,
          category: null,
          variableExpenseId: 'def-1',
          variableExpense: { currency: 'COP' },
        },
      ]);

      const result = await getVariableExpenseMovements('user-1', {
        variableExpenseId: 'def-1',
        month: 9,
        year: 2026,
      });

      expect(result.count).toBe(1);
      expect(result.totalCents).toBe(1000);
      expect(mockLog.warn).toHaveBeenCalled();
    });

    it('throws NotFoundError for a foreign or inactive definition', async () => {
      mockPrisma.variableExpense.findUnique.mockResolvedValue({
        ...definitionRow,
        userId: 'other-user',
      });
      await expect(
        getVariableExpenseMovements('user-1', { variableExpenseId: 'def-1' })
      ).rejects.toThrow(/not found/);

      mockPrisma.variableExpense.findUnique.mockResolvedValue({
        ...definitionRow,
        isActive: false,
      });
      await expect(
        getVariableExpenseMovements('user-1', { variableExpenseId: 'def-1' })
      ).rejects.toThrow(/not found/);
    });
  });
});
