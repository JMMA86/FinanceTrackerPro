/**
 * End-of-period projection service unit tests (`src/services/projection.service.ts`).
 *
 * The service is server-only and talks to Prisma, so every model is mocked with
 * the same `vi.mock('@/lib/db')` pattern the other `*.service.spec.ts` files use.
 * These lock:
 * - current cash from the LEDGER (Rule 13), restricted to liquid account types;
 * - investment value = ledger cash + Σ(quantity × currentPriceCents), no N+1;
 * - the 3-complete-month variable estimate with the monitored exclusions;
 * - the PAYABLE/RECEIVABLE loan principal/interest proportional split;
 * - salary occurrence matching by NEAREST OCCURRENCE within a 15-day tolerance;
 * - the asymmetric obligation windows (overdue fixed payments / PAYABLE loans
 *   count; past RECEIVABLE collections do not);
 * - live → stored-fallback → unavailable FX resolution (Rule 9) and the
 *   no-double-count merge of the month/year `unconvertedByCurrency` buckets.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNetProjection } from '../projection.service';
import { multiplyCents, addCents } from '@/lib/money';
import { remainingMonthFraction } from '@/lib/projection';
import type { Currency } from '@prisma/client';

// ---------------------------------------------------------------------------
// Mocked prisma + logger + FX
// ---------------------------------------------------------------------------

const { mockPrisma, mockLog, mockGetExchangeRate } = vi.hoisted(() => ({
  mockPrisma: {
    salaryConfiguration: { findUnique: vi.fn() },
    projectionSettings: { findUnique: vi.fn() },
    account: { findMany: vi.fn() },
    transaction: { findMany: vi.fn(), groupBy: vi.fn() },
    investmentAssetHolding: { findMany: vi.fn() },
    fixedExpensePayment: { findMany: vi.fn() },
    loanInstallment: { findMany: vi.fn() },
    variableExpense: { findMany: vi.fn() },
  },
  mockLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
  mockGetExchangeRate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ prisma: mockPrisma }));
vi.mock('@/lib/logger', () => ({ log: mockLog }));
vi.mock('@/services/exchange-rate.service', () => ({ getExchangeRate: mockGetExchangeRate }));
vi.mock('server-only', () => ({}));

// ---------------------------------------------------------------------------
// Configurable mock state
// ---------------------------------------------------------------------------

interface State {
  liquidAccounts: Array<{ id: string; currency: Currency }>;
  investmentAccounts: Array<{ id: string; currency: Currency }>;
  balancesByAccount: Record<string, bigint>;
  holdings: Array<{ accountId: string; quantity: unknown; currentPriceCents: bigint }>;
  fixedPayments: Array<{
    expectedAmountCents: bigint;
    currency: Currency;
    dueDate: Date;
    paidDate: Date | null;
  }>;
  payableLoans: Array<Record<string, unknown>>;
  receivableLoans: Array<Record<string, unknown>>;
  variableDefinitions: Array<Record<string, unknown>>;
  expenseRows: Array<{ amountCents: bigint; currency: Currency; date: Date }>;
  salaryIncomeRows: Array<{
    id: string;
    amountCents: bigint;
    currency: Currency;
    date: Date;
    /** Mirrors `account: { isActive: true }`: false = soft-deleted account. */
    accountActive?: boolean;
  }>;
  storedRateRows: Array<{ currency: Currency; exchangeRate: unknown }>;
  salaryConfig: unknown;
  projectionSettings: unknown;
}

let state: State;

function resetState(overrides: Partial<State> = {}): void {
  state = {
    liquidAccounts: [],
    investmentAccounts: [],
    balancesByAccount: {},
    holdings: [],
    fixedPayments: [],
    payableLoans: [],
    receivableLoans: [],
    variableDefinitions: [],
    expenseRows: [],
    salaryIncomeRows: [],
    storedRateRows: [],
    salaryConfig: null,
    projectionSettings: null,
    ...overrides,
  };
}

describe('projection.service (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();

    mockPrisma.salaryConfiguration.findUnique.mockImplementation(async () => state.salaryConfig);
    mockPrisma.projectionSettings.findUnique.mockImplementation(
      async () => state.projectionSettings
    );

    mockPrisma.account.findMany.mockImplementation(async (args: { where?: { type?: unknown } }) => {
      const type = args?.where?.type;
      if (type === 'INVESTMENT') return state.investmentAccounts;
      return state.liquidAccounts;
    });

    mockPrisma.transaction.groupBy.mockImplementation(
      async (args: { where?: { accountId?: { in?: string[] } } }) => {
        const ids = args?.where?.accountId?.in ?? [];
        return ids
          .filter((id) => state.balancesByAccount[id] !== undefined)
          .map((id) => ({ accountId: id, _sum: { amountCents: state.balancesByAccount[id] } }));
      }
    );

    mockPrisma.transaction.findMany.mockImplementation(
      async (args: {
        where?: { exchangeRate?: unknown; type?: string; account?: { isActive?: boolean } };
      }) => {
        if (args?.where?.exchangeRate) return state.storedRateRows;
        if (args?.where?.type === 'EXPENSE') return state.expenseRows;
        if (args?.where?.type === 'INCOME') {
          // Mirror the `account: { isActive: true }` filter: rows booked on a
          // soft-deleted account are NOT returned by the real query.
          return args.where.account?.isActive === true
            ? state.salaryIncomeRows.filter((row) => row.accountActive !== false)
            : state.salaryIncomeRows;
        }
        return [];
      }
    );

    mockPrisma.investmentAssetHolding.findMany.mockImplementation(async () => state.holdings);
    mockPrisma.fixedExpensePayment.findMany.mockImplementation(
      async (args: { where?: { dueDate?: { lte?: Date } } }) => {
        const to = args?.where?.dueDate?.lte;
        if (!to) return state.fixedPayments;
        // Mirror `paidDate: null` + `dueDate: { lte: to }` (NO lower bound, so
        // overdue payments remain pending).
        return state.fixedPayments.filter(
          (row) => row.paidDate === null && row.dueDate.getTime() <= to.getTime()
        );
      }
    );
    mockPrisma.loanInstallment.findMany.mockImplementation(
      async (args: {
        where?: { loan?: { direction?: string }; dueDate?: { gte?: Date; lte?: Date } };
      }) => {
        const rows =
          args?.where?.loan?.direction === 'RECEIVABLE'
            ? state.receivableLoans
            : state.payableLoans;
        const dueDate = args?.where?.dueDate;
        if (!dueDate) return rows;
        // Mirror the asymmetric window: PAYABLE only `lte` (overdue included),
        // RECEIVABLE `gte` + `lte` (past collections excluded).
        return rows.filter((row) => {
          const value = row.dueDate;
          if (!(value instanceof Date)) return false;
          const time = value.getTime();
          if (dueDate.gte && time < dueDate.gte.getTime()) return false;
          if (dueDate.lte && time > dueDate.lte.getTime()) return false;
          return true;
        });
      }
    );
    mockPrisma.variableExpense.findMany.mockImplementation(async () => state.variableDefinitions);
    mockGetExchangeRate.mockResolvedValue(null);
  });

  // ==========================================================================
  // Empty user
  // ==========================================================================

  it('returns a coherent zeroed projection when nothing is configured', async () => {
    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.configured).toBe(false);
    expect(result.targetConfigured).toBe(false);
    expect(result.currency).toBe('COP');
    expect(result.month.period).toBe('month');
    expect(result.year.period).toBe('year');
    expect(result.month.currentCashCents).toBe(0);
    expect(result.month.investmentValueCents).toBe(0);
    expect(result.month.projectedEndCents).toBe(0);
    expect(result.month.salaryStatus).toBe('NOT_CONFIGURED');
    expect(result.unconverted).toBe(false);
    expect(result.unconvertedByCurrency).toEqual({});
  });

  it('only queries liquid account types for cash and INVESTMENT for the investments', async () => {
    await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    const accountTypes = mockPrisma.account.findMany.mock.calls.map((call) => call[0].where.type);
    expect(accountTypes).toContainEqual({ in: ['CHECKING', 'CASH', 'SAVINGS', 'POCKET'] });
    expect(accountTypes).toContain('INVESTMENT');
  });

  it('queries the investment holdings ONCE (no per-account N+1)', async () => {
    state.investmentAccounts = [
      { id: 'inv-1', currency: 'COP' },
      { id: 'inv-2', currency: 'USD' },
    ];

    await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(mockPrisma.investmentAssetHolding.findMany).toHaveBeenCalledTimes(1);
  });

  it('asks for both loan directions separately', async () => {
    await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    const directions = mockPrisma.loanInstallment.findMany.mock.calls.map(
      (call) => call[0].where.loan.direction
    );
    expect(directions).toContain('PAYABLE');
    expect(directions).toContain('RECEIVABLE');
  });

  // ==========================================================================
  // Current cash (Rule 13 — ledger is the source of truth)
  // ==========================================================================

  it('derives current cash from the ledger groupBy and counts the accounts', async () => {
    state.liquidAccounts = [
      { id: 'acc-1', currency: 'COP' },
      { id: 'acc-2', currency: 'COP' },
    ];
    state.balancesByAccount = { 'acc-1': BigInt(700_000), 'acc-2': BigInt(300_000) };

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.currentCashCents).toBe(1_000_000);
    const cashLine = result.month.breakdown.find((line) => line.key === 'cash');
    expect(cashLine).toMatchObject({ amountCents: 1_000_000, count: 2, sourceCurrency: 'COP' });
  });

  it('keeps each currency in its own cash bucket', async () => {
    state.liquidAccounts = [
      { id: 'acc-cop', currency: 'COP' },
      { id: 'acc-usd', currency: 'USD' },
    ];
    state.balancesByAccount = { 'acc-cop': BigInt(1_000_000), 'acc-usd': BigInt(100) };
    mockGetExchangeRate.mockImplementation(async (from: string, to: string) =>
      from === 'COP' && to === 'USD' ? 0.00025 : null
    );

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    // 1,000,000 COP + 100 USD × 4,000 = 1,400,000
    expect(result.month.currentCashCents).toBe(1_400_000);
    expect(result.month.breakdown.filter((line) => line.key === 'cash')).toHaveLength(2);
  });

  // ==========================================================================
  // Investment value
  // ==========================================================================

  it('sums ledger cash + holdings market value per investment account', async () => {
    state.investmentAccounts = [{ id: 'inv-1', currency: 'COP' }];
    state.balancesByAccount = { 'inv-1': BigInt(1_000_000) };
    state.holdings = [
      { accountId: 'inv-1', quantity: 2.5, currentPriceCents: BigInt(40_000) },
      { accountId: 'inv-1', quantity: 1, currentPriceCents: BigInt(100_000) },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    // 1,000,000 + (2.5 × 40,000) + (1 × 100,000) = 1,200,000
    expect(result.month.investmentValueCents).toBe(1_200_000);
    // Investment value is part of the end position but never spendable.
    expect(result.month.remainingToSpendCents).toBe(0);
    expect(result.month.projectedEndCents).toBe(1_200_000);
  });

  // ==========================================================================
  // Salary
  // ==========================================================================

  it('expands the salary recurrence and reports the pending amount for the period', async () => {
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(2_000_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [15],
      bonuses: [],
    };

    const result = await getNetProjection('user-1', new Date(2026, 0, 10, 12));

    expect(result.configured).toBe(true);
    expect(result.month.salaryStatus).toBe('PENDING');
    expect(result.month.salaryPendingCents).toBe(2_000_000);
    expect(result.month.nextSalaryDate?.getDate()).toBe(15);
    // 12 monthly paydays from Jan 15 to Dec 15 remain in the year window.
    expect(result.year.salaryOccurrences).toHaveLength(12);
    expect(result.year.salaryPendingCents).toBe(24_000_000);
  });

  it('flags an occurrence as received when a real salary lands on the same day', async () => {
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(2_000_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [15],
      bonuses: [],
    };
    state.salaryIncomeRows = [
      {
        id: 'tx-1',
        amountCents: BigInt(2_500_000),
        currency: 'COP',
        date: new Date(2026, 0, 15, 9),
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 0, 10, 12));

    expect(result.month.salaryStatus).toBe('RECEIVED');
    expect(result.month.salaryPendingCents).toBe(0);
    // The REAL amount is reported, never the expected one.
    expect(result.month.salaryReceivedCents).toBe(2_500_000);
  });

  it('matches a salary transaction one day after the scheduled day', async () => {
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(1_000_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [15],
      bonuses: [],
    };
    state.salaryIncomeRows = [
      {
        id: 'tx-1',
        amountCents: BigInt(1_000_000),
        currency: 'COP',
        date: new Date(2026, 0, 16, 9),
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 0, 10, 12));

    expect(result.month.salaryOccurrences[0].received).toBe(true);
  });

  // Regression: the old ±1-day window was replaced by a NEAREST-OCCURRENCE match
  // within `SALARY_MATCH_TOLERANCE_DAYS = 15`. A salary registered 2 days BEFORE
  // the scheduled payday must be absorbed; otherwise its real amount sits in
  // `currentCashCents` while the occurrence is still counted as pending (double
  // count).
  it('flags an occurrence as received when the real salary is registered 2 days before it', async () => {
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(1_000_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [15],
      bonuses: [],
    };
    state.salaryIncomeRows = [
      {
        id: 'tx-1',
        amountCents: BigInt(1_000_000),
        currency: 'COP',
        accountActive: true,
        date: new Date(2026, 0, 13, 9),
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 0, 10, 12));

    expect(result.month.salaryOccurrences[0].received).toBe(true);
    // Already received → it must NOT be counted again as pending.
    expect(result.month.salaryPendingCents).toBe(0);
    expect(result.month.salaryReceivedCents).toBe(1_000_000);
    expect(result.month.salaryStatus).toBe('RECEIVED');
  });

  it('does NOT match a salary transaction farther than 15 days from every occurrence', async () => {
    // Payday Jan 20; an income on Jan 1 is 19 calendar days away (outside the
    // 15-day tolerance), so it must not consume the occurrence.
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(1_000_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [20],
      bonuses: [],
    };
    state.salaryIncomeRows = [
      {
        id: 'tx-1',
        amountCents: BigInt(1_000_000),
        currency: 'COP',
        accountActive: true,
        date: new Date(2026, 0, 1, 9),
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 0, 1, 12));

    expect(result.month.salaryOccurrences[0].received).toBe(false);
    expect(result.month.salaryPendingCents).toBe(1_000_000);
    // A real salary exists but no occurrence was consumed → PARTIAL.
    expect(result.month.salaryStatus).toBe('PARTIAL');
  });

  it('ignores salary INCOME booked on a soft-deleted (inactive) account', async () => {
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(1_000_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [15],
      bonuses: [],
    };
    state.salaryIncomeRows = [
      {
        id: 'tx-active',
        amountCents: BigInt(1_000_000),
        currency: 'COP',
        accountActive: true,
        date: new Date(2026, 0, 15, 9),
      },
      {
        id: 'tx-inactive',
        amountCents: BigInt(500_000),
        currency: 'COP',
        accountActive: false,
        date: new Date(2026, 0, 15, 9),
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 0, 10, 12));

    // Only the active account's transaction is counted.
    expect(result.month.salaryReceivedCents).toBe(1_000_000);
    const incomeQuery = mockPrisma.transaction.findMany.mock.calls.find(
      (call) => call[0].where?.type === 'INCOME'
    )![0];
    expect(incomeQuery.where.account).toEqual({ isActive: true });
  });

  it('reports PARTIAL when a future payday remains and one was already received', async () => {
    // BIWEEKLY so both configured days expand within the window.
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(1_000_000),
      currency: 'COP',
      frequency: 'BIWEEKLY',
      payDays: [10, 25],
      bonuses: [],
    };
    state.salaryIncomeRows = [
      {
        id: 'tx-1',
        amountCents: BigInt(1_000_000),
        currency: 'COP',
        date: new Date(2026, 0, 10, 9),
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 0, 10, 12));

    expect(result.month.salaryStatus).toBe('PARTIAL');
    expect(result.month.salaryPendingCents).toBe(1_000_000);
  });

  it('loads the year salary window from the start of the year', async () => {
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(1_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [5],
      bonuses: [],
    };

    await getNetProjection('user-1', new Date(2026, 5, 10, 12));

    const incomeQueries = mockPrisma.transaction.findMany.mock.calls.filter(
      (call) => call[0].where?.type === 'INCOME'
    );
    // month window start + year window start.
    expect(incomeQueries).toHaveLength(2);
    expect(incomeQueries[1][0].where.date.gte.getMonth()).toBe(0);
  });

  // ==========================================================================
  // Variable estimate
  // ==========================================================================

  it('averages the last 3 COMPLETE months of unmonitored expenses and adds the expected amounts', async () => {
    const now = new Date(2026, 3, 15, 12); // April 15, 2026
    state.variableDefinitions = [
      { expectedAmountCents: BigInt(50_000), expectedTimesPerMonth: 2, currency: 'COP' },
    ];
    state.expenseRows = [
      { amountCents: -BigInt(60_000), currency: 'COP', date: new Date(2026, 0, 10) },
      { amountCents: -BigInt(30_000), currency: 'COP', date: new Date(2026, 1, 10) },
      { amountCents: -BigInt(30_000), currency: 'COP', date: new Date(2026, 1, 20) },
      { amountCents: -BigInt(90_000), currency: 'COP', date: new Date(2026, 2, 20) },
    ];

    const result = await getNetProjection('user-1', now);

    // expected = 50,000 × 2 = 100,000; average = (60k + 60k + 90k)/3 = 70,000
    const monthlyEstimate = 170_000;
    expect(result.month.remainingVariableBudgetCents).toBe(
      multiplyCents(monthlyEstimate, remainingMonthFraction(now))
    );
    expect(result.month.breakdown.find((line) => line.key === 'variable')?.count).toBe(1);
  });

  it('queries only the 3 complete months and excludes monitored/fixed/contribution-linked expenses', async () => {
    const now = new Date(2026, 3, 15, 12);
    await getNetProjection('user-1', now);

    const expenseQuery = mockPrisma.transaction.findMany.mock.calls.find(
      (call) => call[0].where?.type === 'EXPENSE'
    )![0];

    expect(expenseQuery.where).toMatchObject({
      userId: 'user-1',
      isActive: true,
      type: 'EXPENSE',
      variableExpenseId: null,
      fixedExpensePaymentId: null,
      savingsContributions: { none: { isActive: true } },
    });
    // window: Jan 1 2026 → Mar 31 2026 (current April excluded).
    expect(expenseQuery.where.date.gte.getMonth()).toBe(0);
    expect(expenseQuery.where.date.lte.getMonth()).toBe(2);
  });

  // ==========================================================================
  // Loans (proportional principal/interest split)
  // ==========================================================================

  it('splits the remaining payable installment proportionally into principal and interest', async () => {
    state.payableLoans = [
      {
        totalCents: BigInt(100_000),
        paidAmountCents: BigInt(0),
        principalCents: BigInt(80_000),
        interestCents: BigInt(20_000),
        paidPrincipalCents: BigInt(0),
        paidInterestCents: BigInt(0),
        currency: 'COP',
        dueDate: new Date(2026, 3, 20),
        status: 'PENDING',
      },
      {
        totalCents: BigInt(100_000),
        paidAmountCents: BigInt(50_000),
        principalCents: BigInt(80_000),
        interestCents: BigInt(20_000),
        paidPrincipalCents: BigInt(40_000),
        paidInterestCents: BigInt(10_000),
        currency: 'COP',
        dueDate: new Date(2026, 3, 20),
        status: 'PARTIAL',
      },
      // Fully paid → contributes nothing.
      {
        totalCents: BigInt(60_000),
        paidAmountCents: BigInt(60_000),
        principalCents: BigInt(50_000),
        interestCents: BigInt(10_000),
        paidPrincipalCents: BigInt(50_000),
        paidInterestCents: BigInt(10_000),
        currency: 'COP',
        dueDate: new Date(2026, 3, 20),
        status: 'PENDING',
      },
      // No usable schedule split → the whole remainder is principal.
      {
        totalCents: BigInt(30_000),
        paidAmountCents: BigInt(0),
        principalCents: BigInt(0),
        interestCents: BigInt(0),
        paidPrincipalCents: BigInt(0),
        paidInterestCents: BigInt(0),
        currency: 'COP',
        dueDate: new Date(2026, 3, 20),
        status: 'PENDING',
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.remainingLoanPrincipalCents).toBe(150_000);
    expect(result.month.remainingLoanInterestCents).toBe(30_000);
    expect(result.month.remainingLoanPaymentsCents).toBe(180_000);
  });

  it('counts RECEIVABLE collections as income (principal + interest)', async () => {
    state.receivableLoans = [
      {
        totalCents: BigInt(50_000),
        paidAmountCents: BigInt(0),
        principalCents: BigInt(50_000),
        interestCents: BigInt(0),
        paidPrincipalCents: BigInt(0),
        paidInterestCents: BigInt(0),
        currency: 'COP',
        dueDate: new Date(2026, 3, 20),
        status: 'PENDING',
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.remainingLoanReceivableCents).toBe(50_000);
    expect(result.month.remainingIncomeCents).toBe(50_000);
    expect(result.month.remainingLoanPaymentsCents).toBe(0);
  });

  // Regression: the windows are ASYMMETRIC. A PAYABLE OVERDUE installment is
  // still money the user owes (no lower bound → counted, with its split); a
  // RECEIVABLE overdue installment is NOT a reliable future inflow (`gte`
  // startOfDay(now) → excluded). Only future collections count.
  it('counts an OVERDUE PAYABLE installment but excludes an overdue RECEIVABLE one', async () => {
    const now = new Date(2026, 3, 15, 12); // Apr 15, 2026
    state.payableLoans = [
      {
        totalCents: BigInt(100_000),
        paidAmountCents: BigInt(0),
        principalCents: BigInt(80_000),
        interestCents: BigInt(20_000),
        paidPrincipalCents: BigInt(0),
        paidInterestCents: BigInt(0),
        currency: 'COP',
        dueDate: new Date(2026, 3, 1), // overdue
        status: 'OVERDUE',
      },
    ];
    state.receivableLoans = [
      {
        totalCents: BigInt(50_000),
        paidAmountCents: BigInt(0),
        principalCents: BigInt(50_000),
        interestCents: BigInt(0),
        paidPrincipalCents: BigInt(0),
        paidInterestCents: BigInt(0),
        currency: 'COP',
        dueDate: new Date(2026, 3, 1), // overdue → excluded
        status: 'OVERDUE',
      },
      {
        totalCents: BigInt(30_000),
        paidAmountCents: BigInt(0),
        principalCents: BigInt(25_000),
        interestCents: BigInt(5_000),
        paidPrincipalCents: BigInt(0),
        paidInterestCents: BigInt(0),
        currency: 'COP',
        dueDate: new Date(2026, 3, 25), // future → counted
        status: 'PENDING',
      },
    ];

    const result = await getNetProjection('user-1', now);

    // Overdue PAYABLE is a live debt: it counts with its principal/interest split.
    expect(result.month.remainingLoanPaymentsCents).toBe(100_000);
    expect(result.month.remainingLoanPrincipalCents).toBe(80_000);
    expect(result.month.remainingLoanInterestCents).toBe(20_000);
    // Only the FUTURE collection is an inflow; the overdue one is dropped.
    expect(result.month.remainingLoanReceivableCents).toBe(30_000);

    const payableQuery = mockPrisma.loanInstallment.findMany.mock.calls.find(
      (call) => call[0].where.loan.direction === 'PAYABLE'
    )![0];
    const receivableQuery = mockPrisma.loanInstallment.findMany.mock.calls.find(
      (call) => call[0].where.loan.direction === 'RECEIVABLE'
    )![0];
    expect(payableQuery.where.dueDate.gte).toBeUndefined();
    expect(payableQuery.where.dueDate.lte).toBeInstanceOf(Date);
    expect(receivableQuery.where.dueDate.gte).toBeInstanceOf(Date);
    expect(receivableQuery.where.dueDate.lte).toBeInstanceOf(Date);
  });

  // ==========================================================================
  // FX resolution (Rule 9)
  // ==========================================================================

  it('uses the LIVE rate for a foreign account', async () => {
    state.liquidAccounts = [{ id: 'acc-usd', currency: 'USD' }];
    state.balancesByAccount = { 'acc-usd': BigInt(100) };
    mockGetExchangeRate.mockImplementation(async (from: string, to: string) =>
      from === 'COP' && to === 'USD' ? 0.00025 : null
    );

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.currentCashCents).toBe(400_000);
    expect(result.exchangeRatesUsed.USD).toEqual({ rate: 4_000, source: 'live' });
  });

  it('falls back to the last stored plausible rate when the live lookup fails', async () => {
    state.liquidAccounts = [{ id: 'acc-usd', currency: 'USD' }];
    state.balancesByAccount = { 'acc-usd': BigInt(100) };
    state.storedRateRows = [{ currency: 'USD', exchangeRate: 4_200 }];
    mockGetExchangeRate.mockResolvedValue(null);

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.currentCashCents).toBe(420_000);
    expect(result.exchangeRatesUsed.USD).toEqual({ rate: 4_200, source: 'fallback' });
  });

  // Regression: `unconvertedByCurrency` uses the YEAR bucket (a strict superset
  // of the month's) instead of summing month + year, which used to double count
  // the same unconvertible amount.
  it('does not double count an unconvertible currency when merging the month and year buckets', async () => {
    state.liquidAccounts = [{ id: 'acc-usd', currency: 'USD' }];
    state.balancesByAccount = { 'acc-usd': BigInt(1_000) };
    mockGetExchangeRate.mockResolvedValue(null);

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.currentCashCents).toBe(0);
    expect(result.unconverted).toBe(true);
    // Both periods flag the same 1,000 USD; the merged bucket must be the year's
    // (1 × 1,000), never the month + year sum (2 × 2,000).
    expect(result.unconvertedByCurrency.USD).toEqual({ count: 1, amountCents: 1_000 });
  });

  it('rejects an out-of-band stored fallback rate and treats the amount as unconvertible', async () => {
    state.liquidAccounts = [{ id: 'acc-usd', currency: 'USD' }];
    state.balancesByAccount = { 'acc-usd': BigInt(100) };
    // Inverted convention (~0.00025) must be rejected by the plausibility band.
    state.storedRateRows = [{ currency: 'USD', exchangeRate: 0.00025 }];
    mockGetExchangeRate.mockResolvedValue(null);

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.currentCashCents).toBe(0);
    expect(result.unconverted).toBe(true);
    expect(result.exchangeRatesUsed.USD?.source).toBe('unavailable');
  });

  // ==========================================================================
  // Savings target
  // ==========================================================================

  it('spreads the monthly savings target over the period months', async () => {
    state.projectionSettings = {
      isActive: true,
      monthlySavingsTargetCents: BigInt(200_000),
      currency: 'COP',
    };

    const result = await getNetProjection('user-1', new Date(2026, 5, 10, 12)); // June

    expect(result.targetConfigured).toBe(true);
    expect(result.month.remainingSavingsTargetCents).toBe(200_000);
    // June → December = 7 months.
    expect(result.year.remainingSavingsTargetCents).toBe(1_400_000);
    expect(result.month.remainingToSpendCents).toBe(-200_000);
  });

  it('ignores an inactive savings target', async () => {
    state.projectionSettings = {
      isActive: false,
      monthlySavingsTargetCents: BigInt(200_000),
      currency: 'COP',
    };

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.targetConfigured).toBe(false);
    expect(result.month.remainingSavingsTargetCents).toBe(0);
  });

  // ==========================================================================
  // Bonus schedules
  // ==========================================================================

  it('expands active bonuses into the remaining window', async () => {
    state.salaryConfig = {
      isActive: true,
      amountCents: BigInt(1_000_000),
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [1],
      bonuses: [
        {
          name: 'Prima',
          amountCents: BigInt(500_000),
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 12,
          dayOfMonth: 20,
        },
      ],
    };
    // Bonus on Dec 20 falls outside the month window but inside the year window.
    const result = await getNetProjection('user-1', new Date(2026, 5, 10, 12));

    expect(result.month.breakdown.find((line) => line.key === 'bonus')).toBeUndefined();
    expect(result.year.breakdown.find((line) => line.key === 'bonus')).toMatchObject({
      amountCents: 500_000,
    });
  });

  // ==========================================================================
  // Fixed expenses
  // ==========================================================================

  it('includes pending fixed payments inside each window', async () => {
    state.fixedPayments = [
      {
        expectedAmountCents: BigInt(120_000),
        currency: 'COP',
        dueDate: new Date(2026, 3, 20),
        paidDate: null,
      },
      {
        expectedAmountCents: BigInt(80_000),
        currency: 'COP',
        dueDate: new Date(2026, 3, 25),
        paidDate: null,
      },
    ];

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.month.remainingFixedCents).toBe(200_000);
    // The query filters paidDate null so only unpaid dues are counted.
    const fixedQuery = mockPrisma.fixedExpensePayment.findMany.mock.calls[0][0];
    expect(fixedQuery.where).toMatchObject({
      isActive: true,
      paidDate: null,
      fixedExpense: { userId: 'user-1', isActive: true },
    });
  });

  // Regression: the obligation side has NO lower `dueDate` bound, so an OVERDUE
  // unpaid payment (and one due TODAY at 00:00) still counts; a settled one never
  // does; a payment outside the period does not.
  it('counts OVERDUE and today-midnight fixed payments but never a paid one', async () => {
    const now = new Date(2026, 3, 15, 12); // Apr 15, 2026
    state.fixedPayments = [
      {
        expectedAmountCents: BigInt(120_000),
        currency: 'COP',
        dueDate: new Date(2026, 3, 1), // overdue
        paidDate: null,
      },
      {
        expectedAmountCents: BigInt(80_000),
        currency: 'COP',
        dueDate: new Date(2026, 3, 15, 0, 0, 0, 0), // due today at midnight
        paidDate: null,
      },
      {
        expectedAmountCents: BigInt(50_000),
        currency: 'COP',
        dueDate: new Date(2026, 3, 10),
        paidDate: new Date(2026, 3, 10), // already settled → excluded
      },
      {
        expectedAmountCents: BigInt(999_000),
        currency: 'COP',
        dueDate: new Date(2026, 4, 20), // next month → outside the window
        paidDate: null,
      },
    ];

    const result = await getNetProjection('user-1', now);

    // 120k overdue + 80k today = 200k; paid and out-of-window are excluded.
    expect(result.month.remainingFixedCents).toBe(200_000);
    const fixedQuery = mockPrisma.fixedExpensePayment.findMany.mock.calls[0][0];
    expect(fixedQuery.where.dueDate.lte).toBeInstanceOf(Date);
    // No lower bound: that is what makes overdue payments count.
    expect(fixedQuery.where.dueDate.gte).toBeUndefined();
  });

  // ==========================================================================
  // Merge of month + year FX context
  // ==========================================================================

  it('merges the month and year FX provenance', async () => {
    state.liquidAccounts = [{ id: 'acc-usd', currency: 'USD' }];
    state.balancesByAccount = { 'acc-usd': BigInt(100) };
    mockGetExchangeRate.mockImplementation(async (from: string, to: string) =>
      from === 'COP' && to === 'USD' ? 0.00025 : null
    );

    const result = await getNetProjection('user-1', new Date(2026, 3, 15, 12));

    expect(result.exchangeRatesUsed.USD).toEqual({ rate: 4_000, source: 'live' });
    expect(result.unconverted).toBe(false);
    // sanity: addCents is exercised here so the Decimal helper import is real.
    expect(addCents(1, 2)).toBe(3);
  });
});
