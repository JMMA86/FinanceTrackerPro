/**
 * Loan Server Actions Integration Tests
 *
 * Runs against the dedicated test database (port 5434) and verifies the full
 * money lifecycle: creation (with/without account), installment payment/receipt,
 * adjustments (extra money + schedule regeneration), soft delete, per-currency
 * summary and ownership isolation.
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import {
  PrismaClient,
  Currency,
  Language,
  Theme,
  AccountType,
  TransactionType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ============================================================================
// Mocks for server-only dependencies
// ============================================================================

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (key: string) => {
        if (key === 'x-forwarded-for') return '127.0.0.1';
        if (key === 'user-agent') return 'vitest';
        return null;
      },
    })
  ),
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_noStore: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({
      userId: TEST_USER_ID,
      email: `loan-actions-${Date.now()}@example.com`,
      name: 'Loan Actions Test User',
    })
  ),
}));

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

vi.mock('@/lib/utils/action-wrapper', () => ({
  safeAction: vi.fn((fn) => {
    return async (...args: unknown[]) => {
      try {
        const result = await fn(...args);
        return { success: true, data: result };
      } catch (error) {
        const { ZodError } = await import('zod');
        const { AppError } = await import('@/lib/errors/api-errors');
        if (error instanceof ZodError) {
          const firstError = error.issues?.[0];
          const message = firstError?.path
            ? `${firstError.path.join('.')}: ${firstError.message}`
            : 'Validation failed';
          return { success: false, error: message, code: 'VALIDATION_ERROR' };
        }
        if (error instanceof AppError) {
          return { success: false, error: error.message, code: error.code };
        }
        return { success: false, error: (error as Error).message, code: 'INTERNAL_SERVER_ERROR' };
      }
    };
  }),
}));

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// Test constants + helpers
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'loan-act-user-' + Date.now();
const FOREIGN_USER_ID = 'loan-act-foreign-' + Date.now();

const genUUID = (): string => crypto.randomUUID();

let pool: Pool;
let prisma: PrismaClient;

import * as loanActions from '../loan.actions';
import { createLoanWithSchedule } from '@/services/loan.service';

function createLoanInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Préstamo Acciones',
    type: 'PERSONAL',
    direction: 'PAYABLE',
    principalCents: 100000,
    currency: 'COP',
    rateType: 'PERIODIC',
    interestRateValue: 0,
    interestMode: 'COMPOUND',
    interestAccrual: 'PERIODIC',
    dayCountBasis: 'ACTUAL_365',
    amortizationType: 'FRENCH',
    paymentFrequency: 'MONTHLY',
    scheduleMode: 'TERM',
    termCount: 10,
    interestOnlyInstallments: 0,
    startDate: new Date(2026, 0, 1),
    firstPaymentDate: new Date(2026, 1, 1),
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

async function createBankAccount(
  owner: string,
  overrides: { name?: string; balanceCents?: number; currency?: Currency } = {}
) {
  const balanceCents = overrides.balanceCents ?? 500000;
  const currency = overrides.currency ?? Currency.COP;
  const account = await prisma.account.create({
    data: {
      userId: owner,
      name: overrides.name ?? 'Cuenta Origen',
      type: AccountType.SAVINGS,
      balanceCents,
      currency,
      isActive: true,
      createdBy: owner,
      lastModifiedBy: owner,
    },
  });

  if (balanceCents > 0) {
    await prisma.transaction.create({
      data: {
        idempotencyKey: genUUID(),
        userId: owner,
        accountId: account.id,
        type: TransactionType.INCOME,
        amountCents: balanceCents,
        currency,
        description: 'Opening balance',
        date: new Date(),
        openingBalance: true,
        isActive: true,
        ipAddress: '127.0.0.1',
        userAgent: 'vitest',
        createdBy: owner,
        lastModifiedBy: owner,
      },
    });
  }

  return account;
}

/** Creates a foreign-owned loan (fixture) with its schedule. */
async function createForeignLoan(overrides: Record<string, unknown> = {}) {
  return prisma.$transaction((tx) =>
    createLoanWithSchedule(
      tx,
      {
        ...createLoanInput(overrides),
        name: 'Foreign Loan',
        idempotencyKey: genUUID(),
      } as Parameters<typeof createLoanWithSchedule>[1],
      FOREIGN_USER_ID
    )
  );
}

async function cleanupUserData(userId: string) {
  await prisma.loanInstallmentPayment.deleteMany({ where: { installment: { loan: { userId } } } });
  await prisma.loanAdjustment.deleteMany({ where: { loan: { userId } } });
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.loanInstallment.deleteMany({ where: { loan: { userId } } });
  await prisma.loan.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

async function cleanupTestData() {
  await cleanupUserData(TEST_USER_ID);
  await cleanupUserData(FOREIGN_USER_ID);
}

describe('Loan Actions Integration', () => {
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

  async function firstInstallment(loanId: string) {
    return prisma.loanInstallment.findFirstOrThrow({
      where: { loanId, installmentNumber: 1 },
    });
  }

  // ==========================================================================
  // createLoan
  // ==========================================================================

  describe('createLoan', () => {
    it('crea el préstamo sin cuenta y sin movimientos', async () => {
      const result = await loanActions.createLoan(createLoanInput());

      expect(result.success).toBe(true);
      expect(result.data!.wasIdempotent).toBe(false);
      expect(result.data!.loan!.installments).toHaveLength(10);
      expect(await prisma.transaction.count({ where: { userId: TEST_USER_ID } })).toBe(0);
    });

    it('con cuenta RECEIVABLE descuenta el ledger y crea una transacción EXPENSE', async () => {
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 500000 });

      const result = await loanActions.createLoan(
        createLoanInput({ direction: 'RECEIVABLE', accountId: account.id })
      );

      expect(result.success).toBe(true);
      const key = result.data!.loan!.idempotencyKey as string;
      const transaction = await prisma.transaction.findUnique({ where: { idempotencyKey: key } });
      expect(transaction!.type).toBe('EXPENSE');
      expect(Number(transaction!.amountCents)).toBe(-100000);
      expect(transaction!.accountId).toBe(account.id);

      const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(Number(updatedAccount.balanceCents)).toBe(400000);
    });

    it('con cuenta PAYABLE acredita el ledger y crea una transacción INCOME', async () => {
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 500000 });

      const result = await loanActions.createLoan(createLoanInput({ accountId: account.id }));

      expect(result.success).toBe(true);
      const key = result.data!.loan!.idempotencyKey as string;
      const transaction = await prisma.transaction.findUnique({ where: { idempotencyKey: key } });
      expect(transaction!.type).toBe('INCOME');
      expect(Number(transaction!.amountCents)).toBe(100000);

      const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(Number(updatedAccount.balanceCents)).toBe(600000);
    });

    it('retorna INSUFFICIENT_FUNDS cuando la cuenta no cubre el desembolso', async () => {
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 100 });

      const result = await loanActions.createLoan(
        createLoanInput({ direction: 'RECEIVABLE', accountId: account.id })
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_FUNDS');
      expect(await prisma.loan.count({ where: { userId: TEST_USER_ID } })).toBe(0);
    });

    it('retorna CURRENCY_MISMATCH cuando la moneda de la cuenta difiere', async () => {
      const account = await createBankAccount(TEST_USER_ID, {
        currency: Currency.USD,
        balanceCents: 500000,
      });

      const result = await loanActions.createLoan(
        createLoanInput({ direction: 'RECEIVABLE', accountId: account.id })
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('CURRENCY_MISMATCH');
    });

    it('es idempotente: misma key devuelve el mismo préstamo y mueve el dinero una vez', async () => {
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 500000 });
      const key = genUUID();
      const input = createLoanInput({
        direction: 'RECEIVABLE',
        accountId: account.id,
        idempotencyKey: key,
      });

      const first = await loanActions.createLoan(input);
      expect(first.success).toBe(true);
      expect(first.data!.wasIdempotent).toBe(false);

      const second = await loanActions.createLoan(input);
      expect(second.success).toBe(true);
      expect(second.data!.wasIdempotent).toBe(true);
      expect(second.data!.loan!.id).toBe(first.data!.loan!.id);

      expect(await prisma.loan.count({ where: { idempotencyKey: key } })).toBe(1);
      expect(await prisma.transaction.count({ where: { idempotencyKey: key } })).toBe(1);

      const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(Number(updatedAccount.balanceCents)).toBe(400000); // debitado una sola vez
    });

    it('modo INSTALLMENT deriva y persiste el termCount', async () => {
      const result = await loanActions.createLoan(
        createLoanInput({
          scheduleMode: 'INSTALLMENT',
          termCount: undefined,
          interestRateValue: 0,
          installmentAmountCents: 10000,
          principalCents: 100000,
        })
      );

      expect(result.success).toBe(true);
      expect(result.data!.loan!.termCount).toBe(10);
      expect(result.data!.loan!.installments).toHaveLength(10);
    });

    it('rechaza una cuota mayor al total con VALIDATION_ERROR y la clave i18n', async () => {
      const result = await loanActions.createLoan(
        createLoanInput({
          scheduleMode: 'INSTALLMENT',
          termCount: undefined,
          interestRateValue: 0,
          installmentAmountCents: 999999,
          principalCents: 100000,
        })
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
      expect(result.error).toBe('validation.installmentExceedsTotal');
    });
  });

  // ==========================================================================
  // Reads / ownership
  // ==========================================================================

  describe('lecturas y ownership', () => {
    it('getLoans y getLoanDetail devuelven solo préstamos del usuario', async () => {
      await createForeignLoan();
      const own = await loanActions.createLoan(createLoanInput());

      const list = await loanActions.getLoans({});
      expect(list.success).toBe(true);
      expect(list.data!).toHaveLength(1);
      expect(list.data![0].id).toBe(own.data!.loan!.id);

      const detail = await loanActions.getLoanDetail({ loanId: own.data!.loan!.id });
      expect(detail.success).toBe(true);

      const foreign = await createForeignLoan();
      const foreignDetail = await loanActions.getLoanDetail({ loanId: foreign.id });
      expect(foreignDetail.success).toBe(false);
      expect(foreignDetail.code).toBe('LOAN_NOT_FOUND');
    });

    it('getPendingLoanInstallments resuelve la moneda desde la cuenta', async () => {
      const result = await loanActions.createLoan(createLoanInput());
      expect(result.success).toBe(true);

      const pending = await loanActions.getPendingLoanInstallments({ currency: 'COP' });
      expect(pending.success).toBe(true);
      expect(pending.data!.length).toBeGreaterThan(0);
      expect(pending.data!.every((row) => row.currency === 'COP')).toBe(true);
    });

    it('getLoansForPayment solo incluye préstamos del usuario', async () => {
      await createForeignLoan();
      await loanActions.createLoan(createLoanInput());

      const result = await loanActions.getLoansForPayment({});
      expect(result.success).toBe(true);
      expect(result.data!).toHaveLength(1);
    });
  });

  // ==========================================================================
  // registerLoanPayment
  // ==========================================================================

  describe('registerLoanPayment', () => {
    async function setupPayablePayment() {
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 500000 });
      const created = await loanActions.createLoan(createLoanInput());
      const installment = await firstInstallment(created.data!.loan!.id);
      return { account, loanId: created.data!.loan!.id, installment };
    }

    it('PAYABLE: paga la cuota con una transacción LOAN_PAYMENT negativa', async () => {
      const { account, loanId, installment } = await setupPayablePayment();
      const key = genUUID();

      const result = await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        idempotencyKey: key,
      });

      expect(result.success).toBe(true);
      expect(result.data!.wasIdempotent).toBe(false);

      const tx = await prisma.transaction.findUnique({ where: { idempotencyKey: key } });
      expect(tx!.type).toBe('LOAN_PAYMENT');
      expect(Number(tx!.amountCents)).toBe(-Number(installment.totalCents));
      expect(tx!.loanInstallmentId).toBe(installment.id);

      const updated = await prisma.loanInstallment.findUniqueOrThrow({
        where: { id: installment.id },
      });
      expect(updated.status).toBe('PAID');

      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(Number(loan.balanceCents)).toBe(90000);

      const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(Number(updatedAccount.balanceCents)).toBe(500000 - Number(installment.totalCents));
    });

    it('RECEIVABLE: registra el recibo con una transacción LOAN_RECEIPT positiva', async () => {
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 500000 });
      const created = await loanActions.createLoan(
        createLoanInput({ direction: 'RECEIVABLE', accountId: account.id })
      );
      // El desembolso inicial baja la cuenta a 400000; el recibo la vuelve a subir.
      const installment = await firstInstallment(created.data!.loan!.id);
      const key = genUUID();

      const result = await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        idempotencyKey: key,
      });

      expect(result.success).toBe(true);
      const tx = await prisma.transaction.findUnique({ where: { idempotencyKey: key } });
      expect(tx!.type).toBe('LOAN_RECEIPT');
      expect(Number(tx!.amountCents)).toBe(Number(installment.totalCents));

      const updatedAccount = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
      expect(Number(updatedAccount.balanceCents)).toBe(400000 + Number(installment.totalCents));
    });

    it('acepta un pago parcial (PARTIAL)', async () => {
      const { account, installment } = await setupPayablePayment();

      const result = await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        amountCents: 5000,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      const updated = await prisma.loanInstallment.findUniqueOrThrow({
        where: { id: installment.id },
      });
      expect(updated.status).toBe('PARTIAL');
      expect(Number(updated.paidAmountCents)).toBe(5000);
    });

    it('rechaza pagar una cuota ya pagada', async () => {
      const { account, installment } = await setupPayablePayment();
      await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      const result = await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('LOAN_INSTALLMENT_ALREADY_PAID');
    });

    it('es idempotente: misma key no duplica la transacción', async () => {
      const { account, installment } = await setupPayablePayment();
      const key = genUUID();

      const first = await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        idempotencyKey: key,
      });
      expect(first.success).toBe(true);
      expect(first.data!.wasIdempotent).toBe(false);

      const second = await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        idempotencyKey: key,
      });
      expect(second.success).toBe(true);
      expect(second.data!.wasIdempotent).toBe(true);
      expect(second.data!.payment.id).toBe(first.data!.payment.id);

      expect(await prisma.transaction.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('rechaza pagar una cuota de otro usuario con NOT_FOUND', async () => {
      const foreign = await createForeignLoan();
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 500000 });
      const installment = await firstInstallment(foreign.id);

      const result = await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('LOAN_NOT_FOUND');
    });
  });

  // ==========================================================================
  // addLoanAdjustment
  // ==========================================================================

  describe('addLoanAdjustment', () => {
    async function setupAdjustableLoan(overrides: Record<string, unknown> = {}) {
      const created = await loanActions.createLoan(createLoanInput(overrides));
      return created.data!.loan!.id;
    }

    it('EXTRA_PAYMENT reduce el saldo y regenera el cronograma con Σ capital == saldo', async () => {
      const loanId = await setupAdjustableLoan();

      const result = await loanActions.addLoanAdjustment({
        loanId,
        type: 'EXTRA_PAYMENT',
        effectiveDate: new Date(),
        amountCents: 20000,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.wasIdempotent).toBe(false);
      expect(result.data!.adjustment.type).toBe('EXTRA_PAYMENT');

      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(Number(loan.balanceCents)).toBe(80000);

      const installments = await prisma.loanInstallment.findMany({
        where: { loanId, isActive: true },
      });
      const programmed = installments.reduce(
        (acc, row) => acc + (Number(row.principalCents) - Number(row.paidPrincipalCents)),
        0
      );
      expect(programmed).toBe(80000);
      expect(Number(installments.reduce((a, r) => a + Number(r.totalCents), 0))).toBeGreaterThan(0);
    });

    it('rechaza un sobrepago con LOAN_OVERPAYMENT', async () => {
      const loanId = await setupAdjustableLoan();

      const result = await loanActions.addLoanAdjustment({
        loanId,
        type: 'EXTRA_PAYMENT',
        effectiveDate: new Date(),
        amountCents: 999999,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('LOAN_OVERPAYMENT');

      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(Number(loan.balanceCents)).toBe(100000);
    });

    it('RATE_CHANGE actualiza la tasa y regenera los intereses', async () => {
      const loanId = await setupAdjustableLoan();

      const result = await loanActions.addLoanAdjustment({
        loanId,
        type: 'RATE_CHANGE',
        effectiveDate: new Date(),
        newRateValue: 5,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(Number(loan.interestRateValue)).toBe(5);
      const active = await prisma.loanInstallment.findMany({ where: { loanId, isActive: true } });
      expect(active.reduce((a, r) => a + Number(r.interestCents), 0)).toBeGreaterThan(0);
    });

    it('RESCHEDULE cambia el plazo y regenera el número de cuotas activas', async () => {
      const loanId = await setupAdjustableLoan();

      const result = await loanActions.addLoanAdjustment({
        loanId,
        type: 'RESCHEDULE',
        effectiveDate: new Date(),
        newTermCount: 6,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(loan.termCount).toBe(6);
      const activeCount = await prisma.loanInstallment.count({
        where: { loanId, isActive: true },
      });
      expect(activeCount).toBe(6);
    });

    it('INTEREST_ONLY_PERIOD marca las primeras cuotas como solo interés', async () => {
      const loanId = await setupAdjustableLoan();

      const result = await loanActions.addLoanAdjustment({
        loanId,
        type: 'INTEREST_ONLY_PERIOD',
        effectiveDate: new Date(),
        installmentNumber: 2,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(loan.interestOnlyInstallments).toBe(2);

      const first = await firstInstallment(loanId);
      expect(Number(first.principalCents)).toBe(0);
      expect(first.isInterestOnly).toBe(true);
    });

    it('CUSTOM_INSTALLMENT fija el total de una cuota pendiente', async () => {
      const loanId = await setupAdjustableLoan();
      const target = await firstInstallment(loanId);

      const result = await loanActions.addLoanAdjustment({
        loanId,
        type: 'CUSTOM_INSTALLMENT',
        effectiveDate: new Date(),
        installmentNumber: target.installmentNumber,
        amountCents: 5000,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      const updated = await prisma.loanInstallment.findUniqueOrThrow({ where: { id: target.id } });
      expect(Number(updated.totalCents)).toBe(5000);
      expect(updated.isCustomTotal).toBe(true);
    });

    it('es idempotente con la misma key', async () => {
      const loanId = await setupAdjustableLoan();
      const key = genUUID();
      const input = {
        loanId,
        type: 'EXTRA_PAYMENT' as const,
        effectiveDate: new Date(),
        amountCents: 20000,
        idempotencyKey: key,
      };

      const first = await loanActions.addLoanAdjustment(input);
      expect(first.success).toBe(true);
      expect(first.data!.wasIdempotent).toBe(false);

      const second = await loanActions.addLoanAdjustment(input);
      expect(second.success).toBe(true);
      expect(second.data!.wasIdempotent).toBe(true);
      expect(second.data!.adjustment.id).toBe(first.data!.adjustment.id);
      expect(await prisma.loanAdjustment.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it('rechaza ajustar un préstamo de otro usuario', async () => {
      const foreign = await createForeignLoan();

      const result = await loanActions.addLoanAdjustment({
        loanId: foreign.id,
        type: 'EXTRA_PAYMENT',
        effectiveDate: new Date(),
        amountCents: 1000,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('LOAN_NOT_FOUND');
    });
  });

  // ==========================================================================
  // deleteLoan
  // ==========================================================================

  describe('deleteLoan', () => {
    it('hace soft delete del préstamo y de las cuotas pendientes', async () => {
      const created = await loanActions.createLoan(createLoanInput());
      const loanId = created.data!.loan!.id;

      const result = await loanActions.deleteLoan({ loanId });

      expect(result.success).toBe(true);
      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(loan.isActive).toBe(false);
      expect(loan.deletedAt).not.toBeNull();
      expect(loan.status).toBe('CANCELLED');

      const activeInstallments = await prisma.loanInstallment.count({
        where: { loanId, isActive: true },
      });
      expect(activeInstallments).toBe(0);
    });

    it('bloquea el borrado cuando hay cuotas pagadas o parciales', async () => {
      const account = await createBankAccount(TEST_USER_ID, { balanceCents: 500000 });
      const created = await loanActions.createLoan(createLoanInput());
      const loanId = created.data!.loan!.id;
      const installment = await firstInstallment(loanId);
      await loanActions.registerLoanPayment({
        installmentId: installment.id,
        accountId: account.id,
        amountCents: 5000,
        idempotencyKey: genUUID(),
      });

      const result = await loanActions.deleteLoan({ loanId });

      expect(result.success).toBe(false);
      expect(result.code).toBe('LOAN_ADJUSTMENT_NOT_ALLOWED');
      const loan = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(loan.isActive).toBe(true);
    });

    it('rechaza borrar un préstamo de otro usuario', async () => {
      const foreign = await createForeignLoan();

      const result = await loanActions.deleteLoan({ loanId: foreign.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('LOAN_NOT_FOUND');
    });
  });

  // ==========================================================================
  // getLoansSummary
  // ==========================================================================

  describe('getLoansSummary', () => {
    it('devuelve buckets por moneda sin mezclar', async () => {
      await loanActions.createLoan(
        createLoanInput({ direction: 'PAYABLE', currency: 'COP', principalCents: 100000 })
      );
      await loanActions.createLoan(
        createLoanInput({ direction: 'RECEIVABLE', currency: 'USD', principalCents: 50000 })
      );

      const result = await loanActions.getLoansSummary({});

      expect(result.success).toBe(true);
      const cop = result.data!.byCurrency.find((bucket) => bucket.currency === 'COP')!;
      const usd = result.data!.byCurrency.find((bucket) => bucket.currency === 'USD')!;
      expect(cop.totalPrincipalCents).toBe(100000);
      expect(usd.totalPrincipalCents).toBe(50000);
      expect(cop.totalPayableCents).toBe(100000);
      expect(usd.totalReceivableCents).toBe(50000);
      expect(cop.totalReceivableCents).toBe(0);
      expect(usd.totalPayableCents).toBe(0);
    });

    it('no incluye préstamos de otro usuario', async () => {
      await createForeignLoan();
      const result = await loanActions.getLoansSummary({});
      expect(result.success).toBe(true);
      expect(result.data!.byCurrency).toHaveLength(0);
    });
  });

  // ==========================================================================
  // updateLoan
  // ==========================================================================

  describe('updateLoan', () => {
    it('actualiza los metadatos y devuelve el préstamo serializado', async () => {
      const created = await loanActions.createLoan(createLoanInput());
      const loanId = created.data!.loan!.id;

      const result = await loanActions.updateLoan({
        loanId,
        name: 'Préstamo renombrado',
        notes: 'Nota actualizada',
        status: 'COMPLETED',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('Préstamo renombrado');
      expect(result.data!.notes).toBe('Nota actualizada');
      expect(result.data!.status).toBe('COMPLETED');

      const row = await prisma.loan.findUniqueOrThrow({ where: { id: loanId } });
      expect(row.lastModifiedBy).toBe(TEST_USER_ID);
      expect(row.ipAddress).toBe('127.0.0.1');
      expect(row.userAgent).toBe('vitest');
    });

    it('rechaza actualizar un préstamo de otro usuario', async () => {
      const foreign = await createForeignLoan();

      const result = await loanActions.updateLoan({ loanId: foreign.id, name: 'Hijacked' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('LOAN_NOT_FOUND');
    });
  });

  // ==========================================================================
  // Reads filtradas
  // ==========================================================================

  describe('lecturas filtradas', () => {
    it('getLoans aplica el filtro de dirección', async () => {
      await loanActions.createLoan(createLoanInput({ direction: 'PAYABLE' }));
      await loanActions.createLoan(createLoanInput({ direction: 'RECEIVABLE' }));

      const payable = await loanActions.getLoans({ direction: 'PAYABLE' });
      expect(payable.success).toBe(true);
      expect(payable.data!).toHaveLength(1);
      expect(payable.data![0].direction).toBe('PAYABLE');
    });

    it('getLoansForPayment aplica filtros de dirección y moneda', async () => {
      await loanActions.createLoan(createLoanInput({ direction: 'PAYABLE', currency: 'COP' }));
      await loanActions.createLoan(createLoanInput({ direction: 'RECEIVABLE', currency: 'USD' }));

      const onlyCop = await loanActions.getLoansForPayment({ currency: 'COP' });
      expect(onlyCop.success).toBe(true);
      expect(onlyCop.data!).toHaveLength(1);
      expect(onlyCop.data![0].currency).toBe('COP');

      const onlyReceivable = await loanActions.getLoansForPayment({ direction: 'RECEIVABLE' });
      expect(onlyReceivable.data!).toHaveLength(1);
      expect(onlyReceivable.data![0].expectedTransactionType).toBe('LOAN_RECEIPT');
    });

    it('getPendingLoanInstallments resuelve la moneda por cuenta y falla si no existe', async () => {
      await loanActions.createLoan(createLoanInput({ currency: 'COP' }));
      const account = await createBankAccount(TEST_USER_ID, { currency: Currency.COP });

      const byAccount = await loanActions.getPendingLoanInstallments({ accountId: account.id });
      expect(byAccount.success).toBe(true);
      expect(byAccount.data!.every((row) => row.currency === 'COP')).toBe(true);

      const missing = await loanActions.getPendingLoanInstallments({
        accountId: 'clh1234567890abcdefghij',
      });
      expect(missing.success).toBe(false);
      expect(missing.code).toBe('NOT_FOUND');
    });
  });
});
