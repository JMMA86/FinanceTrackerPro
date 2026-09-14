/**
 * Loan Service Integration Tests
 *
 * Runs against the dedicated test database (port 5434). Verifies the loan
 * ledger/reconciliation invariants, the amortization persistence, the
 * transactions-modal selector and the interest-first payment kernel.
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient, Currency, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// The service logs through pino; silence it for a clean test run.
vi.mock('@/lib/logger', () => ({
  log: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

import * as loanService from '@/services/loan.service';
import type { CreateLoanWithScheduleInput } from '@/services/loan.service';

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'loan-svc-user-' + Date.now();
const FOREIGN_USER_ID = 'loan-svc-foreign-' + Date.now();

const genUUID = (): string => crypto.randomUUID();

let pool: Pool;
let prisma: PrismaClient;

function createInput(
  overrides: Partial<CreateLoanWithScheduleInput> = {}
): CreateLoanWithScheduleInput {
  return {
    name: 'Préstamo Test',
    type: 'PERSONAL',
    direction: 'PAYABLE',
    counterpartyContact: null,
    notes: null,
    principalCents: 100000,
    currency: 'COP',
    rateType: 'PERIODIC',
    interestRateValue: 1,
    interestMode: 'COMPOUND',
    interestAccrual: 'PERIODIC',
    dayCountBasis: 'ACTUAL_365',
    amortizationType: 'FRENCH',
    paymentFrequency: 'MONTHLY',
    scheduleMode: 'TERM',
    termCount: 12,
    installmentAmountCents: null,
    interestOnlyInstallments: 0,
    customTotals: null,
    startDate: new Date(2026, 0, 1),
    firstPaymentDate: new Date(2026, 1, 1),
    color: null,
    icon: null,
    idempotencyKey: genUUID(),
    ...overrides,
  };
}

async function createUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.com`,
      name: `User ${id}`,
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createLoanForUser(
  userId: string,
  overrides: Partial<CreateLoanWithScheduleInput> = {}
) {
  return prisma.$transaction((tx) =>
    loanService.createLoanWithSchedule(tx, createInput(overrides), userId)
  );
}

/** Apply a payment to an installment through the service kernel. */
async function applyPayment(
  loanId: string,
  installmentId: string,
  amountCents: number,
  idempotencyKey: string
) {
  const installment = await prisma.loanInstallment.findUniqueOrThrow({
    where: { id: installmentId },
  });
  const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
  return prisma.$transaction((tx) =>
    loanService.applyLoanInstallmentPayment(tx, {
      installment,
      loan,
      amountCents,
      paidAt: new Date(),
      idempotencyKey,
      userId: TEST_USER_ID,
    })
  );
}

async function cleanupUserData(userId: string) {
  await prisma.loanInstallmentPayment.deleteMany({ where: { installment: { loan: { userId } } } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.loanAdjustment.deleteMany({ where: { loan: { userId } } });
  await prisma.loanInstallment.deleteMany({ where: { loan: { userId } } });
  await prisma.loan.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function cleanupTestData() {
  await cleanupUserData(TEST_USER_ID);
  await cleanupUserData(FOREIGN_USER_ID);
}

describe('Loan Service Integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await createUser(TEST_USER_ID);
    await createUser(FOREIGN_USER_ID);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // createLoanWithSchedule
  // ==========================================================================

  describe('createLoanWithSchedule', () => {
    it('persiste el préstamo y su cronograma con totales coherentes', async () => {
      const loan = await createLoanForUser(TEST_USER_ID);

      const installments = await prisma.loanInstallment.findMany({
        where: { loanId: loan.id },
        orderBy: { installmentNumber: 'asc' },
      });
      expect(installments).toHaveLength(12);

      const sumInterest = installments.reduce((acc, row) => acc + Number(row.interestCents), 0);
      expect(Number(loan.totalInterestCents)).toBe(sumInterest);
      expect(Number(loan.totalPayableCents)).toBe(100000 + sumInterest);
      expect(Number(loan.effectiveYieldPct)).toBeCloseTo(
        Number(((sumInterest / 100000) * 100).toFixed(2)),
        5
      );
      expect(Number(installments.at(-1)!.balanceCents)).toBe(0);
      expect(loan.createdBy).toBe(TEST_USER_ID);
      expect(loan.lastModifiedBy).toBe(TEST_USER_ID);
    });

    it('deriva y persiste termCount en modo INSTALLMENT', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, {
        scheduleMode: 'INSTALLMENT',
        termCount: null,
        rateType: 'PERIODIC',
        interestRateValue: 0,
        installmentAmountCents: 10000,
        principalCents: 100000,
      });

      expect(loan.termCount).toBe(10);
      const count = await prisma.loanInstallment.count({ where: { loanId: loan.id } });
      expect(count).toBe(10);
    });

    it('rechaza una cuota mayor al total con intereses con validation.installmentExceedsTotal', async () => {
      await expect(
        createLoanForUser(TEST_USER_ID, {
          scheduleMode: 'INSTALLMENT',
          termCount: null,
          rateType: 'PERIODIC',
          interestRateValue: 0,
          installmentAmountCents: 999999,
          principalCents: 100000,
        })
      ).rejects.toThrow('validation.installmentExceedsTotal');
    });
  });

  // ==========================================================================
  // Reconciliation / ledger invariants
  // ==========================================================================

  describe('reconcileLoanBalance / ledger', () => {
    it('balance = principal + Σ EXTRA_DISBURSEMENT − Σ paidPrincipal − Σ EXTRA_PAYMENT', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, {
        rateType: 'PERIODIC',
        interestRateValue: 0,
        principalCents: 100000,
        termCount: 10,
      });
      const first = await prisma.loanInstallment.findFirstOrThrow({
        where: { loanId: loan.id, installmentNumber: 1 },
      });
      await applyPayment(loan.id, first.id, 10000, genUUID());

      await prisma.loanAdjustment.create({
        data: {
          loanId: loan.id,
          type: 'EXTRA_DISBURSEMENT',
          effectiveDate: new Date(),
          amountCents: 20000,
          idempotencyKey: genUUID(),
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Corrupt the cache to prove reconciliation recomputes from the ledger.
      await prisma.loan.update({ where: { id: loan.id }, data: { balanceCents: 1 } });
      await loanService.reconcileLoanBalance(TEST_USER_ID);

      const reconciled = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
      // principalCents is the immutable ORIGINAL principal — not counted twice.
      expect(Number(reconciled.principalCents)).toBe(100000);
      expect(Number(reconciled.balanceCents)).toBe(100000 + 20000 - 10000);
      expect(reconciled.lastReconciled).not.toBeNull();
    });

    it('nunca deja el saldo negativo al reconciliar', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, {
        rateType: 'PERIODIC',
        interestRateValue: 0,
        principalCents: 50000,
        termCount: 10,
      });
      await prisma.loanAdjustment.create({
        data: {
          loanId: loan.id,
          type: 'EXTRA_PAYMENT',
          effectiveDate: new Date(),
          amountCents: 999999,
          idempotencyKey: genUUID(),
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });
      await prisma.loan.update({ where: { id: loan.id }, data: { balanceCents: 50000 } });

      await loanService.reconcileLoanBalance(TEST_USER_ID);

      const reconciled = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
      expect(Number(reconciled.balanceCents)).toBe(0);
    });

    it('deriveLoanLedgerBalance calcula desde el snapshot transaccional', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, {
        rateType: 'PERIODIC',
        interestRateValue: 0,
        principalCents: 40000,
        termCount: 4,
      });

      const ledger = await prisma.$transaction((tx) =>
        loanService.deriveLoanLedgerBalance(tx, loan.id)
      );
      expect(ledger).toBe(40000);

      await expect(
        prisma.$transaction((tx) =>
          loanService.deriveLoanLedgerBalance(tx, 'clh1234567890abcdefghij')
        )
      ).rejects.toThrow('Loan not found');
    });
  });

  // ==========================================================================
  // getLoansForPayment
  // ==========================================================================

  describe('getLoansForPayment', () => {
    async function setupOptionsLoan() {
      const payable = await createLoanForUser(TEST_USER_ID, {
        direction: 'PAYABLE',
        currency: 'COP',
        principalCents: 100000,
      });
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth();
      const installments = await prisma.loanInstallment.findMany({
        where: { loanId: payable.id },
        orderBy: { installmentNumber: 'asc' },
      });

      // #1 PAID in a previous month.
      await prisma.loanInstallment.update({
        where: { id: installments[0].id },
        data: {
          dueDate: new Date(currentYear, currentMonth - 1, 5, 12),
          status: 'PAID',
          paidAmountCents: installments[0].totalCents,
          paidPrincipalCents: installments[0].principalCents,
          paidInterestCents: installments[0].interestCents,
        },
      });
      // #2 PENDING, overdue, in a previous month.
      await prisma.loanInstallment.update({
        where: { id: installments[1].id },
        data: { dueDate: new Date(currentYear, currentMonth - 1, 25, 12), status: 'PENDING' },
      });
      // #3 PENDING in the current calendar month.
      await prisma.loanInstallment.update({
        where: { id: installments[2].id },
        data: { dueDate: new Date(currentYear, currentMonth, 15, 12), status: 'PENDING' },
      });

      return { payable, installments };
    }

    it('expone overdue/next/currentMonth, pendingCount y el tipo de transacción esperado', async () => {
      const { payable } = await setupOptionsLoan();

      const options = await loanService.getLoansForPayment(TEST_USER_ID);
      const option = options.find((row) => row.loanId === payable.id)!;

      expect(option).toBeDefined();
      expect(option.expectedTransactionType).toBe('LOAN_PAYMENT');
      expect(option.overdueInstallment?.installmentNumber).toBe(2);
      expect(option.nextInstallment?.installmentNumber).toBe(2);
      expect(option.currentMonthInstallment?.installmentNumber).toBe(3);
      expect(option.currentMonthPaid).toBe(false);
      expect(option.pendingCount).toBe(11);
    });

    it('marca currentMonthPaid cuando la cuota del mes ya está pagada', async () => {
      const { payable, installments } = await setupOptionsLoan();

      let options = await loanService.getLoansForPayment(TEST_USER_ID);
      let option = options.find((row) => row.loanId === payable.id)!;
      const current = option.currentMonthInstallment!;

      await prisma.loanInstallment.update({
        where: { id: current.installmentId },
        data: {
          status: 'PAID',
          paidAmountCents: installments[2].totalCents,
        },
      });

      options = await loanService.getLoansForPayment(TEST_USER_ID);
      option = options.find((row) => row.loanId === payable.id)!;
      expect(option.currentMonthPaid).toBe(true);
    });

    it('filtra por dirección y moneda y usa LOAN_RECEIPT en préstamos RECEIVABLE', async () => {
      const { payable } = await setupOptionsLoan();
      const receivable = await createLoanForUser(TEST_USER_ID, {
        direction: 'RECEIVABLE',
        currency: 'USD',
        principalCents: 50000,
      });

      const all = await loanService.getLoansForPayment(TEST_USER_ID);
      expect(all.map((row) => row.loanId).sort()).toEqual([payable.id, receivable.id].sort());

      const onlyPayable = await loanService.getLoansForPayment(TEST_USER_ID, {
        direction: 'PAYABLE',
      });
      expect(onlyPayable).toHaveLength(1);
      expect(onlyPayable[0].loanId).toBe(payable.id);

      const onlyCop = await loanService.getLoansForPayment(TEST_USER_ID, { currency: 'COP' });
      expect(onlyCop.every((row) => row.currency === 'COP')).toBe(true);
      expect(onlyCop.some((row) => row.loanId === receivable.id)).toBe(false);

      const receivableOption = all.find((row) => row.loanId === receivable.id)!;
      expect(receivableOption.expectedTransactionType).toBe('LOAN_RECEIPT');
    });
  });

  // ==========================================================================
  // Serialization + reads
  // ==========================================================================

  describe('serialización y lecturas', () => {
    it('serializa BigInt/Decimal a number y los agregados son JSON-safe', async () => {
      await createLoanForUser(TEST_USER_ID);

      const details = await loanService.getLoansWithDetails(TEST_USER_ID);
      expect(details).toHaveLength(1);
      const loan = details[0];

      expect(typeof loan.principalCents).toBe('number');
      expect(typeof loan.balanceCents).toBe('number');
      expect(typeof loan.interestRateValue).toBe('number');
      expect(typeof loan.totalInterestCents).toBe('number');
      expect(loan.effectiveYieldPct === null || typeof loan.effectiveYieldPct === 'number').toBe(
        true
      );
      expect(typeof loan.installments[0].totalCents).toBe('number');
      expect(loan.installments[0].paidPrincipalCents).toBe(0);
      expect(() => JSON.stringify(details)).not.toThrow();
    });

    it('getLoanDetail devuelve null para otro usuario y getLoansWithDetails filtra', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, { direction: 'RECEIVABLE' });

      expect(await loanService.getLoanDetail(FOREIGN_USER_ID, loan.id)).toBeNull();
      expect(await loanService.getLoanDetail(TEST_USER_ID, loan.id)).not.toBeNull();

      const filtered = await loanService.getLoansWithDetails(TEST_USER_ID, {
        direction: 'PAYABLE',
      });
      expect(filtered).toHaveLength(0);

      const receivable = await loanService.getLoansWithDetails(TEST_USER_ID, {
        direction: 'RECEIVABLE',
      });
      expect(receivable).toHaveLength(1);
    });

    it('getPendingLoanInstallments filtra por moneda', async () => {
      await createLoanForUser(TEST_USER_ID, { currency: 'COP', principalCents: 30000 });
      await createLoanForUser(TEST_USER_ID, { currency: 'USD', principalCents: 30000 });

      const cop = await loanService.getPendingLoanInstallments(TEST_USER_ID, { currency: 'COP' });
      expect(cop.length).toBeGreaterThan(0);
      expect(cop.every((row) => row.currency === 'COP')).toBe(true);
      expect(cop[0].expectedTransactionType).toBe('LOAN_PAYMENT');
    });
  });

  // ==========================================================================
  // applyLoanInstallmentPayment
  // ==========================================================================

  describe('applyLoanInstallmentPayment', () => {
    it('divide interés-primero, avanza PENDING→PARTIAL→PAID y actualiza los acumulados', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, {
        rateType: 'PERIODIC',
        interestRateValue: 1,
        principalCents: 100000,
        termCount: 12,
      });
      const first = await prisma.loanInstallment.findFirstOrThrow({
        where: { loanId: loan.id, installmentNumber: 1 },
      });

      // 1000 = interés exacto → todo a interés, sin capital.
      const r1 = await applyPayment(loan.id, first.id, 1000, genUUID());
      expect(Number(r1.payment.interestCents)).toBe(1000);
      expect(Number(r1.payment.principalCents)).toBe(0);

      const after1 = await prisma.loanInstallment.findUniqueOrThrow({ where: { id: first.id } });
      expect(after1.status).toBe('PARTIAL');
      expect(Number(after1.paidPrincipalCents)).toBe(0);
      expect(Number(after1.paidInterestCents)).toBe(1000);
      // El saldo del préstamo no cambia mientras no se amortice capital.
      const loanAfter1 = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
      expect(Number(loanAfter1.balanceCents)).toBe(100000);

      // 2000 adicionales: interés ya cubierto → todo a capital.
      const r2 = await applyPayment(loan.id, first.id, 2000, genUUID());
      expect(Number(r2.payment.principalCents)).toBe(2000);
      expect(Number(r2.payment.interestCents)).toBe(0);

      const after2 = await prisma.loanInstallment.findUniqueOrThrow({ where: { id: first.id } });
      expect(Number(after2.paidPrincipalCents)).toBe(2000);
      const loanAfter2 = await prisma.loan.findUniqueOrThrow({ where: { id: loan.id } });
      expect(Number(loanAfter2.balanceCents)).toBe(98000);

      // Resto de la cuota → PAID.
      const total = Number(first.totalCents);
      const r3 = await applyPayment(loan.id, first.id, total - 3000, genUUID());
      expect(Number(r3.payment.amountCents)).toBe(total - 3000);

      const after3 = await prisma.loanInstallment.findUniqueOrThrow({ where: { id: first.id } });
      expect(after3.status).toBe('PAID');
      expect(after3.paidDate).not.toBeNull();
      expect(Number(after3.paidAmountCents)).toBe(total);
    });

    it('es idempotente: la misma key devuelve el mismo pago sin duplicar', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, {
        rateType: 'PERIODIC',
        interestRateValue: 1,
        principalCents: 100000,
      });
      const first = await prisma.loanInstallment.findFirstOrThrow({
        where: { loanId: loan.id, installmentNumber: 1 },
      });
      const key = genUUID();

      const firstRun = await applyPayment(loan.id, first.id, 1000, key);
      expect(firstRun.wasIdempotent).toBe(false);

      const secondRun = await applyPayment(loan.id, first.id, 1000, key);
      expect(secondRun.wasIdempotent).toBe(true);
      expect(secondRun.payment.id).toBe(firstRun.payment.id);

      const payments = await prisma.loanInstallmentPayment.count({
        where: { installmentId: first.id },
      });
      expect(payments).toBe(1);
    });

    it('rechaza un monto mayor al remanente', async () => {
      const loan = await createLoanForUser(TEST_USER_ID, { principalCents: 100000 });
      const first = await prisma.loanInstallment.findFirstOrThrow({
        where: { loanId: loan.id, installmentNumber: 1 },
      });

      await expect(
        applyPayment(loan.id, first.id, Number(first.totalCents) + 1, genUUID())
      ).rejects.toThrow('The payment amount must be greater than zero');
    });
  });

  // ==========================================================================
  // getLoansSummary
  // ==========================================================================

  describe('getLoansSummary', () => {
    it('agrupa por moneda sin mezclar y cuenta activos por bucket', async () => {
      await createLoanForUser(TEST_USER_ID, {
        direction: 'PAYABLE',
        currency: 'COP',
        principalCents: 100000,
      });
      await createLoanForUser(TEST_USER_ID, {
        direction: 'RECEIVABLE',
        currency: 'USD',
        principalCents: 50000,
      });

      const summary = await loanService.getLoansSummary(TEST_USER_ID);
      const cop = summary.byCurrency.find((bucket) => bucket.currency === 'COP')!;
      const usd = summary.byCurrency.find((bucket) => bucket.currency === 'USD')!;

      expect(cop).toBeDefined();
      expect(usd).toBeDefined();
      expect(cop.totalPrincipalCents).toBe(100000);
      expect(usd.totalPrincipalCents).toBe(50000);
      // El capital prestado por cobrar solo existe en USD; el pagadero solo en COP.
      expect(cop.totalReceivableCents).toBe(0);
      expect(usd.totalPayableCents).toBe(0);
      expect(cop.activeCount).toBe(1);
      expect(usd.activeCount).toBe(1);
    });
  });
});
