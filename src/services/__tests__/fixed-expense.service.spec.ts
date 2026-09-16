/**
 * Fixed Expenses Service Unit Tests
 *
 * Unit tests for src/services/fixed-expense.service.ts with prisma + logger
 * mocked. Locks the recurrence math, the idempotent materialization, the
 * reschedule guards and the per-currency summary (FIX-1: the summary groups by
 * the payment's immutable currency snapshot, never the template's current one).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  computeDueDates,
  generatePayments,
  reschedulePayments,
  getFixedExpensesWithPayments,
  getFixedExpensePaymentsForUser,
  getFixedExpensesSummary,
  serializeFixedExpense,
  serializePayment,
} from '../fixed-expense.service';

// ---------------------------------------------------------------------------
// Mocked prisma + logger (pattern mirrors savings.service.spec.ts)
// ---------------------------------------------------------------------------

const { mockPrisma, mockLog } = vi.hoisted(() => ({
  mockPrisma: {
    fixedExpense: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    fixedExpensePayment: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
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
// Helpers
// ---------------------------------------------------------------------------

/** Local-midnight date builder. */
const d = (year: number, monthIndex: number, day: number) => new Date(year, monthIndex, day);

interface Recurrence {
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
  dayOfPayment: number | null;
  startDate: Date;
  endDate: Date | null;
}

const monthly: Recurrence = {
  frequency: 'MONTHLY',
  dayOfPayment: 1,
  startDate: d(2026, 0, 1),
  endDate: null,
};

/** A minimal generatable expense (includes the identity + money fields). */
function makeExpense(overrides: Partial<Recurrence> = {}) {
  return {
    id: 'exp-1',
    userId: 'user-1',
    amountCents: BigInt(10000),
    currency: 'COP' as const,
    ...monthly,
    ...overrides,
  };
}

/**
 * Builds a lightweight transaction client mock so generatePayments /
 * reschedulePayments (which receive `tx`) can be observed without a DB.
 */
function makeTx() {
  const findMany = vi.fn().mockResolvedValue([]);
  const upsert = vi.fn().mockResolvedValue({});
  const updateMany = vi.fn().mockResolvedValue({ count: 0 });
  const tx = {
    fixedExpensePayment: { findMany, upsert, updateMany },
  } as unknown as Prisma.TransactionClient;
  return { tx, findMany, upsert, updateMany };
}

// ============================================================================
// computeDueDates
// ============================================================================

describe('fixed-expense.service (unit)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockPrisma.fixedExpense.findMany.mockResolvedValue([]);
    mockPrisma.fixedExpense.findFirst.mockResolvedValue(null);
    mockPrisma.fixedExpensePayment.findMany.mockResolvedValue([]);
    mockPrisma.fixedExpensePayment.upsert.mockResolvedValue({});
    mockPrisma.fixedExpensePayment.updateMany.mockResolvedValue({ count: 0 });
  });

  describe('computeDueDates', () => {
    it('DAILY steps one calendar day from the anchor', () => {
      const dates = computeDueDates(
        { frequency: 'DAILY', dayOfPayment: null, startDate: d(2026, 0, 1), endDate: null },
        d(2026, 0, 1),
        d(2026, 0, 5)
      );
      expect(dates.map((date) => date.getDate())).toEqual([1, 2, 3, 4, 5]);
    });

    it('WEEKLY is anchored on startDate and skips occurrences before `from`', () => {
      const dates = computeDueDates(
        { frequency: 'WEEKLY', dayOfPayment: null, startDate: d(2026, 0, 1), endDate: null },
        d(2026, 0, 10),
        d(2026, 0, 31)
      );
      // Jan 1 + 2 weeks = Jan 15 (the first occurrence on/after Jan 10).
      expect(dates.map((date) => date.getDate())).toEqual([15, 22, 29]);
    });

    it('BIWEEKLY steps 14 days', () => {
      const dates = computeDueDates(
        { frequency: 'BIWEEKLY', dayOfPayment: null, startDate: d(2026, 0, 1), endDate: null },
        d(2026, 0, 1),
        d(2026, 1, 15)
      );
      expect(dates.map((date) => [date.getMonth(), date.getDate()])).toEqual([
        [0, 1],
        [0, 15],
        [0, 29],
        [1, 12],
      ]);
    });

    it('MONTHLY clamps dayOfPayment 31 to the last day of shorter months', () => {
      const dates = computeDueDates(
        {
          frequency: 'MONTHLY',
          dayOfPayment: 31,
          startDate: d(2026, 0, 31),
          endDate: null,
        },
        d(2026, 0, 1),
        d(2026, 4, 31)
      );
      // 2026 is not a leap year → February clamps to the 28th.
      expect(dates.map((date) => [date.getMonth(), date.getDate()])).toEqual([
        [0, 31],
        [1, 28],
        [2, 31],
        [3, 30],
        [4, 31],
      ]);
    });

    it('MONTHLY uses the startDate day when dayOfPayment is null', () => {
      const dates = computeDueDates(
        { frequency: 'MONTHLY', dayOfPayment: null, startDate: d(2026, 0, 15), endDate: null },
        d(2026, 0, 1),
        d(2026, 2, 31)
      );
      expect(dates.map((date) => date.getDate())).toEqual([15, 15, 15]);
    });

    it('QUARTERLY steps three months', () => {
      const dates = computeDueDates(
        { frequency: 'QUARTERLY', dayOfPayment: 15, startDate: d(2026, 0, 15), endDate: null },
        d(2026, 0, 1),
        d(2026, 11, 31)
      );
      expect(dates.map((date) => [date.getMonth(), date.getDate()])).toEqual([
        [0, 15],
        [3, 15],
        [6, 15],
        [9, 15],
      ]);
    });

    it('YEARLY steps twelve months', () => {
      const dates = computeDueDates(
        { frequency: 'YEARLY', dayOfPayment: 15, startDate: d(2026, 0, 15), endDate: null },
        d(2026, 0, 1),
        d(2028, 11, 31)
      );
      expect(dates.map((date) => [date.getFullYear(), date.getMonth(), date.getDate()])).toEqual([
        [2026, 0, 15],
        [2027, 0, 15],
        [2028, 0, 15],
      ]);
    });

    it('respects the template endDate (inclusive)', () => {
      const dates = computeDueDates(
        {
          frequency: 'MONTHLY',
          dayOfPayment: 1,
          startDate: d(2026, 0, 1),
          endDate: d(2026, 2, 15),
        },
        d(2026, 0, 1),
        d(2026, 11, 31)
      );
      expect(dates.map((date) => [date.getMonth(), date.getDate()])).toEqual([
        [0, 1],
        [1, 1],
        [2, 1],
      ]);
    });

    it('returns [] when the effective window is empty (from after endDate)', () => {
      const dates = computeDueDates(
        {
          frequency: 'MONTHLY',
          dayOfPayment: 1,
          startDate: d(2026, 0, 1),
          endDate: d(2026, 0, 15),
        },
        d(2026, 5, 1),
        d(2026, 11, 31)
      );
      expect(dates).toEqual([]);
    });

    it('skips monthly occurrences before the template startDate', () => {
      const dates = computeDueDates(
        { frequency: 'MONTHLY', dayOfPayment: 15, startDate: d(2026, 0, 15), endDate: null },
        d(2026, 5, 1),
        d(2026, 7, 31)
      );
      // The loop walks from the anchor month but drops Jan–May.
      expect(dates.map((date) => [date.getMonth(), date.getDate()])).toEqual([
        [5, 15],
        [6, 15],
        [7, 15],
      ]);
    });

    it('truncates DAILY generation at MAX_PAYMENTS_PER_TEMPLATE (500) and warns', () => {
      const dates = computeDueDates(
        { frequency: 'DAILY', dayOfPayment: null, startDate: d(2026, 0, 1), endDate: null },
        d(2026, 0, 1),
        d(2028, 11, 31) // ~1096 days
      );
      expect(dates).toHaveLength(500);
      expect(mockLog.warn).toHaveBeenCalled();
    });

    it('truncates MONTHLY generation at MAX_PAYMENTS_PER_TEMPLATE (500)', () => {
      const dates = computeDueDates(
        { frequency: 'MONTHLY', dayOfPayment: 1, startDate: d(2000, 0, 1), endDate: null },
        d(2000, 0, 1),
        d(2100, 11, 31) // 1212 months
      );
      expect(dates).toHaveLength(500);
      expect(mockLog.warn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // generatePayments
  // ==========================================================================

  describe('generatePayments', () => {
    const now = d(2026, 5, 15); // Jun 15 2026

    it('materializes every missing due date over the rolling horizon', async () => {
      const { tx, findMany, upsert } = makeTx();
      findMany.mockResolvedValue([]);

      const affected = await generatePayments(tx, makeExpense(), now);

      // Mar 2026 .. May 2027 inclusive = 15 monthly occurrences.
      expect(affected).toBe(15);
      expect(upsert).toHaveBeenCalledTimes(15);
      const firstCall = upsert.mock.calls[0][0];
      expect(firstCall.create).toMatchObject({
        fixedExpenseId: 'exp-1',
        expectedAmountCents: BigInt(10000),
        currency: 'COP',
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      });
    });

    it('is idempotent: a second pass with all occurrences active creates 0 rows', async () => {
      const { tx, findMany, upsert } = makeTx();
      const expense = makeExpense();
      const horizonFrom = d(2026, 2, 1);
      const horizonTo = d(2027, 4, 31);
      const existing = computeDueDates(expense, horizonFrom, horizonTo).map((dueDate) => ({
        dueDate,
        isActive: true,
        paidDate: null,
      }));
      findMany.mockResolvedValue(existing);

      const affected = await generatePayments(tx, expense, now);

      expect(affected).toBe(0);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('never touches paid history (active + paidDate rows are preserved)', async () => {
      const { tx, findMany, upsert } = makeTx();
      const expense = makeExpense();
      const dueDates = computeDueDates(expense, d(2026, 2, 1), d(2027, 4, 31));
      // The first occurrence is already paid → it must be skipped, the other 14 created.
      findMany.mockResolvedValue([
        { dueDate: dueDates[0], isActive: true, paidDate: d(2026, 2, 3) },
      ]);

      const affected = await generatePayments(tx, expense, now);

      expect(affected).toBe(14);
      const createdDates = upsert.mock.calls.map((call) => call[0].create.dueDate.getTime());
      expect(createdDates).not.toContain(dueDates[0].getTime());
    });

    it('does NOT reactivate a soft-deleted occurrence unless reactivate is true', async () => {
      const { tx, findMany, upsert } = makeTx();
      const expense = makeExpense();
      const dueDates = computeDueDates(expense, d(2026, 2, 1), d(2027, 4, 31));
      findMany.mockResolvedValue([{ dueDate: dueDates[0], isActive: false, paidDate: null }]);

      const affected = await generatePayments(tx, expense, now);

      expect(affected).toBe(14);
      const reactivated = upsert.mock.calls.find(
        (call) => call[0].create.dueDate.getTime() === dueDates[0].getTime()
      );
      expect(reactivated).toBeUndefined();
    });

    it('reactivates a soft-deleted unpaid occurrence when reactivate is true', async () => {
      const { tx, findMany, upsert } = makeTx();
      const expense = makeExpense();
      const dueDates = computeDueDates(expense, d(2026, 2, 1), d(2027, 4, 31));
      findMany.mockResolvedValue([{ dueDate: dueDates[0], isActive: false, paidDate: null }]);

      const affected = await generatePayments(tx, expense, now, { reactivate: true });

      expect(affected).toBe(15);
      const reactivated = upsert.mock.calls.find(
        (call) => call[0].create.dueDate.getTime() === dueDates[0].getTime()
      );
      expect(reactivated?.[0].update).toMatchObject({
        isActive: true,
        deletedAt: null,
        expectedAmountCents: BigInt(10000),
        currency: 'COP',
      });
    });

    it('persists the request audit metadata on created rows', async () => {
      const { tx, findMany, upsert } = makeTx();
      findMany.mockResolvedValue([]);

      await generatePayments(tx, makeExpense(), now, undefined, {
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      });

      expect(upsert.mock.calls[0][0].create).toMatchObject({
        ipAddress: '10.0.0.1',
        userAgent: 'vitest',
      });
    });

    it('returns 0 and does not query when there are no due dates in the horizon', async () => {
      const { tx, findMany, upsert } = makeTx();
      const affected = await generatePayments(
        tx,
        makeExpense({ startDate: d(2026, 0, 1), endDate: d(2026, 0, 5) }),
        now
      );
      expect(affected).toBe(0);
      expect(findMany).not.toHaveBeenCalled();
      expect(upsert).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // reschedulePayments
  // ==========================================================================

  describe('reschedulePayments', () => {
    const now = d(2026, 5, 15); // Jun 15 2026

    it('soft-deletes only future unpaid payments outside the new schedule', async () => {
      const { tx, findMany, upsert, updateMany } = makeTx();
      const expense = makeExpense();
      // `p-obsolete` falls on Jun 20 (not a valid occurrence: day is 1).
      // `p-valid` falls on Jul 1 (a valid occurrence) and must survive.
      findMany
        .mockResolvedValueOnce([
          { id: 'p-obsolete', dueDate: d(2026, 5, 20) },
          { id: 'p-valid', dueDate: d(2026, 6, 1) },
        ])
        .mockResolvedValueOnce([]);

      await reschedulePayments(tx, expense, now);

      expect(updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['p-obsolete'] }, isActive: true, paidDate: null },
        data: expect.objectContaining({
          isActive: false,
          deletedAt: now,
          lastModifiedBy: 'user-1',
        }),
      });
      // New occurrences are materialized with reactivation enabled.
      expect(upsert.mock.calls.some((call) => call[0].update?.isActive === true)).toBe(true);
    });

    it('queries only future, active, unpaid payments and re-asserts the guard on write', async () => {
      const { tx, findMany, updateMany } = makeTx();
      findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await reschedulePayments(tx, makeExpense(), now);

      const query = findMany.mock.calls[0][0];
      expect(query.where).toMatchObject({
        fixedExpenseId: 'exp-1',
        isActive: true,
        paidDate: null,
      });
      expect(query.where.dueDate.gte).toEqual(d(2026, 5, 15));
      // No obsolete rows → no soft-delete write at all.
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('does not soft-delete a payment that is not in the obsolete set', async () => {
      const { tx, findMany, updateMany } = makeTx();
      findMany
        .mockResolvedValueOnce([{ id: 'p-valid', dueDate: d(2026, 6, 1) }])
        .mockResolvedValueOnce([]);

      await reschedulePayments(tx, makeExpense(), now);

      expect(updateMany).not.toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // getFixedExpensesSummary (per-currency — FIX-1)
  // ==========================================================================

  describe('getFixedExpensesSummary', () => {
    it('groups by payment.currency (immutable snapshot), never the template currency', async () => {
      mockPrisma.fixedExpense.findMany.mockResolvedValue([{ currency: 'COP' }]);
      mockPrisma.fixedExpensePayment.findMany.mockResolvedValue([
        {
          dueDate: d(2020, 0, 10),
          paidDate: d(2020, 0, 12),
          expectedAmountCents: BigInt(100000),
          paidAmountCents: BigInt(90000),
          currency: 'COP',
        },
        {
          dueDate: d(2020, 0, 20),
          paidDate: null,
          expectedAmountCents: BigInt(50000),
          paidAmountCents: null,
          currency: 'USD',
        },
      ]);

      const result = await getFixedExpensesSummary('user-1', 1, 2020);

      expect(result.byCurrency.map((bucket) => bucket.currency)).toEqual(['COP', 'USD']);
      const cop = result.byCurrency.find((bucket) => bucket.currency === 'COP')!;
      const usd = result.byCurrency.find((bucket) => bucket.currency === 'USD')!;

      expect(cop).toMatchObject({
        totalCommittedCents: 100000,
        totalPaidCents: 90000, // paidAmountCents override
        totalPendingCents: 0,
        totalOverdueCents: 0,
        activeCount: 1,
      });
      expect(usd).toMatchObject({
        totalCommittedCents: 50000,
        totalPaidCents: 0,
        totalPendingCents: 50000,
        totalOverdueCents: 50000, // due 2020-01-20 is long before "now"
        activeCount: 0, // no USD template exists
      });
    });

    it('uses expectedAmountCents when paidAmountCents is null', async () => {
      mockPrisma.fixedExpense.findMany.mockResolvedValue([]);
      mockPrisma.fixedExpensePayment.findMany.mockResolvedValue([
        {
          dueDate: d(2020, 0, 5),
          paidDate: d(2020, 0, 5),
          expectedAmountCents: BigInt(7000),
          paidAmountCents: null,
          currency: 'COP',
        },
      ]);

      const result = await getFixedExpensesSummary('user-1', 1, 2020);

      expect(result.byCurrency[0].totalPaidCents).toBe(7000);
    });

    it('counts a payment paid in the month even when its dueDate is outside the month', async () => {
      mockPrisma.fixedExpense.findMany.mockResolvedValue([]);
      mockPrisma.fixedExpensePayment.findMany.mockResolvedValue([
        {
          dueDate: d(2019, 11, 20), // due in Dec 2019
          paidDate: d(2020, 0, 3), // paid in Jan 2020
          expectedAmountCents: BigInt(4000),
          paidAmountCents: BigInt(4000),
          currency: 'COP',
        },
      ]);

      const result = await getFixedExpensesSummary('user-1', 1, 2020);

      expect(result.byCurrency[0]).toMatchObject({
        totalCommittedCents: 0, // not due in the month
        totalPaidCents: 4000,
        totalPendingCents: 0,
      });
    });

    it('returns an empty byCurrency when there is nothing', async () => {
      mockPrisma.fixedExpense.findMany.mockResolvedValue([]);
      mockPrisma.fixedExpensePayment.findMany.mockResolvedValue([]);

      const result = await getFixedExpensesSummary('user-1', 1, 2020);

      expect(result.byCurrency).toEqual([]);
    });
  });

  // ==========================================================================
  // Serialization
  // ==========================================================================

  describe('serializeFixedExpense / serializePayment', () => {
    it('converts the BigInt amountCents to a number', () => {
      const result = serializeFixedExpense({
        id: 'exp-1',
        amountCents: BigInt(1500000),
      });
      expect(result.amountCents).toBe(1500000);
      expect(typeof result.amountCents).toBe('number');
    });

    it('converts both payment money fields and keeps a null paidAmountCents', () => {
      const paid = serializePayment({
        id: 'p-1',
        expectedAmountCents: BigInt(10000),
        paidAmountCents: BigInt(9500),
      });
      expect(paid.expectedAmountCents).toBe(10000);
      expect(paid.paidAmountCents).toBe(9500);

      const pending = serializePayment({
        id: 'p-2',
        expectedAmountCents: BigInt(10000),
        paidAmountCents: null,
      });
      expect(pending.paidAmountCents).toBeNull();
    });

    it('throws and logs when a monetary BigInt exceeds Number.MAX_SAFE_INTEGER', () => {
      const unsafe = BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1);
      expect(() => serializeFixedExpense({ id: 'exp-1', amountCents: unsafe })).toThrow(RangeError);
      expect(mockLog.error).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Reads
  // ==========================================================================

  describe('getFixedExpensesWithPayments', () => {
    const rawExpense = {
      id: 'exp-1',
      userId: 'user-1',
      name: 'Arriendo',
      amountCents: BigInt(1500000),
      currency: 'COP',
      payments: [
        {
          id: 'p-1',
          expectedAmountCents: BigInt(1500000),
          paidAmountCents: null,
          currency: 'COP',
        },
      ],
    };

    it('materializes then returns templates with serialized payments', async () => {
      mockPrisma.fixedExpense.findMany
        .mockResolvedValueOnce([]) // ensureUpcomingPayments: no templates
        .mockResolvedValueOnce([rawExpense]);

      const result = await getFixedExpensesWithPayments('user-1');

      expect(result).toHaveLength(1);
      expect(result[0].amountCents).toBe(1500000);
      expect(result[0].payments[0].expectedAmountCents).toBe(1500000);
      expect(result[0].payments[0].paidAmountCents).toBeNull();

      const mainQuery = mockPrisma.fixedExpense.findMany.mock.calls[1][0];
      expect(mainQuery.where).toMatchObject({ userId: 'user-1', isActive: true });
      expect(mainQuery.include.payments.where).toMatchObject({ isActive: true });
    });

    it('includes soft-deleted templates when includeInactive is true', async () => {
      mockPrisma.fixedExpense.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([rawExpense]);

      await getFixedExpensesWithPayments('user-1', undefined, { includeInactive: true });

      const mainQuery = mockPrisma.fixedExpense.findMany.mock.calls[1][0];
      expect(mainQuery.where.isActive).toBeUndefined();
    });

    it('applies the dueDate range filter to the payments sub-query', async () => {
      mockPrisma.fixedExpense.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([rawExpense]);

      await getFixedExpensesWithPayments('user-1', {
        from: d(2026, 0, 1),
        to: d(2026, 11, 31),
      });

      const mainQuery = mockPrisma.fixedExpense.findMany.mock.calls[1][0];
      expect(mainQuery.include.payments.where.dueDate.gte).toEqual(d(2026, 0, 1));
      expect(mainQuery.include.payments.where.dueDate.lte).toEqual(
        new Date(2026, 11, 31, 23, 59, 59, 999)
      );
    });
  });

  describe('getFixedExpensePaymentsForUser', () => {
    it('returns null when the template is missing or not owned', async () => {
      mockPrisma.fixedExpense.findFirst.mockResolvedValue(null);
      await expect(getFixedExpensePaymentsForUser('user-1', 'exp-1')).resolves.toBeNull();
    });

    it('returns the serialized template + payments scoped to the owner', async () => {
      mockPrisma.fixedExpense.findFirst.mockResolvedValue({
        id: 'exp-1',
        userId: 'user-1',
        amountCents: BigInt(1000),
        payments: [{ id: 'p-1', expectedAmountCents: BigInt(1000), paidAmountCents: BigInt(1000) }],
      });

      const result = await getFixedExpensePaymentsForUser('user-1', 'exp-1');

      expect(result?.expense.amountCents).toBe(1000);
      expect(result?.payments[0].paidAmountCents).toBe(1000);
      expect(mockPrisma.fixedExpense.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'exp-1', userId: 'user-1', isActive: true },
        })
      );
    });
  });
});
