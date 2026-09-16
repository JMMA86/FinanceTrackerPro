/**
 * Credit Card Actions Integration Tests (real test database)
 *
 * Verifies the financial integrity of the credit-card module against the real
 * PostgreSQL test DB (Rule 3 atomicity, Rule 12 idempotency, Rule 13 source of
 * truth, credit-limit enforcement, double-entry payments).
 *
 * NOTE: `@/services/reconciliation.service` and `@/lib/repositories` are NOT
 * mocked here — `getTrueBalance` computes from the real transactional history
 * (Rule 13). Only external services (session, headers, logger, rate-limit,
 * idempotency) are mocked.
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

// ============================================================================
// Mocks (external services only — never the database)
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
}));

vi.mock('next/cache', () => {
  const revalidatePath = vi.fn();
  return { revalidatePath };
});

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
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

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/idempotency.service', () => ({
  checkAndLockIdempotency: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/utils/action-wrapper', () => ({
  safeAction: vi.fn((fn) => {
    return async (...args: unknown[]) => {
      try {
        const result = await fn(...args);
        return { success: true, data: result };
      } catch (error) {
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

// ============================================================================
// Constants & clients
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
// Unique user ids per run (never clash across CI runs).
const SPANISH_USER_ID = 'cc-test-spanish-' + Date.now();
const ENGLISH_USER_ID = 'cc-test-english-' + Date.now();
// Transfers require a CUID userId (TransferSchema).
const CUID_USER_ID = 'clccarduser00000000000001';

let pool: Pool;
let prisma: PrismaClient;

import { getSession } from '@/lib/auth/session';
import {
  getCreditCards,
  updateCreditCard,
  deleteCreditCard,
  getCreditCardStatement,
  payCreditCard,
} from '../credit-card.actions';
import { createTransaction } from '../transaction.actions';
import { transferBetweenAccounts } from '../transfer.actions';

const mockGetSession = vi.mocked(getSession);

// ============================================================================
// Helpers
// ============================================================================

async function createUser(id: string, language: Language = Language.SPANISH) {
  return prisma.user.create({
    data: {
      id,
      email: `cc-${id}-${Date.now()}@example.com`,
      name: 'Credit Card Test User',
      passwordHash: 'hashed_test_password',
      language,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createBankAccount(
  userId: string,
  balanceCents: number,
  currency: Currency = Currency.COP
) {
  const account = await prisma.account.create({
    data: {
      userId,
      name: 'Test Checking',
      type: AccountType.CHECKING,
      balanceCents,
      currency,
      isActive: true,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
  // Fund the account with a real INCOME transaction so the true balance
  // (Rule 13 snapshot) matches the cached balance.
  await prisma.transaction.create({
    data: {
      idempotencyKey: crypto.randomUUID(),
      userId,
      accountId: account.id,
      type: 'INCOME',
      amountCents: balanceCents,
      currency,
      description: 'Opening balance',
      date: new Date(),
      isActive: true,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
  return account;
}

async function createCardAccount(
  userId: string,
  overrides: Partial<{
    creditLimitCents: number | null;
    cutoffDay: number;
    paymentDueDay: number;
    name: string;
    currency: Currency;
  }> = {}
) {
  return prisma.account.create({
    data: {
      userId,
      name: overrides.name ?? 'Visa Test',
      type: AccountType.CREDIT_CARD,
      balanceCents: 0,
      currency: overrides.currency ?? Currency.COP,
      creditLimitCents:
        overrides.creditLimitCents === undefined ? 1_000_000 : overrides.creditLimitCents,
      cutoffDay: overrides.cutoffDay ?? 10,
      paymentDueDay: overrides.paymentDueDay ?? 25,
      isActive: true,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

async function cleanupUserData(userId: string) {
  await prisma.transaction.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}

function sessionFor(userId: string) {
  mockGetSession.mockResolvedValue({
    userId,
    email: `cc-${userId}@example.com`,
    name: 'CC User',
  });
}

function makeExpenseInput(accountId: string, amountCents: number) {
  return {
    idempotencyKey: crypto.randomUUID(),
    accountId,
    type: 'EXPENSE' as const,
    amountCents: -amountCents,
    currency: 'COP',
    description: 'Card consumption',
  };
}

function makePayInput(cardId: string, sourceId: string, amountCents: number) {
  return {
    idempotencyKey: crypto.randomUUID(),
    accountId: cardId,
    sourceAccountId: sourceId,
    amountCents,
    currency: 'COP',
  };
}

// ============================================================================
// Suite
// ============================================================================

describe('Credit Card Actions Integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await cleanupUserData(SPANISH_USER_ID);
    await cleanupUserData(ENGLISH_USER_ID);
    await cleanupUserData(CUID_USER_ID);
  });

  afterAll(async () => {
    await cleanupUserData(SPANISH_USER_ID);
    await cleanupUserData(ENGLISH_USER_ID);
    await cleanupUserData(CUID_USER_ID);
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanupUserData(SPANISH_USER_ID);
    await cleanupUserData(ENGLISH_USER_ID);
    await cleanupUserData(CUID_USER_ID);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('full credit card lifecycle', () => {
    it('creates a card, consumes, pays partially, pays off, then deletes it', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const bank = await createBankAccount(SPANISH_USER_ID, 5_000_000);
      const card = await createCardAccount(SPANISH_USER_ID, { creditLimitCents: 1_000_000 });

      // Consume 200.000 COP on the card
      const expense = await createTransaction(makeExpenseInput(card.id, 200_000));
      expect(expense.success).toBe(true);

      // List cards → debt is 200.000, available credit 800.000
      const cardsRes = await getCreditCards({});
      expect(cardsRes.success).toBe(true);
      const cards = cardsRes.data as Array<Record<string, unknown>>;
      expect(cards).toHaveLength(1);
      expect(cards[0].id).toBe(card.id);
      expect(cards[0].debtCents).toBe(200_000);
      expect(cards[0].availableCreditCents).toBe(800_000);

      // Pay 50.000 from the bank account
      const pay1 = await payCreditCard(makePayInput(card.id, bank.id, 50_000));
      expect(pay1.success).toBe(true);
      expect(pay1.data?.wasIdempotent).toBe(false);

      // Double-entry: EXPENSE on bank + CREDIT_PAYMENT on card, shared transferId
      const paired = await prisma.transaction.findMany({
        where: {
          transferId: (pay1.data as { sourceTransaction: { transferId: string } }).sourceTransaction
            .transferId,
        },
      });
      expect(paired).toHaveLength(2);
      const debit = paired.find((t) => t.type === 'EXPENSE');
      const credit = paired.find((t) => t.type === 'CREDIT_PAYMENT');
      expect(debit?.accountId).toBe(bank.id);
      expect(debit?.transferToAccountId).toBe(card.id);
      expect(Number(debit?.amountCents)).toBe(-50_000);
      expect(credit?.accountId).toBe(card.id);
      expect(credit?.transferFromAccountId).toBe(bank.id);
      expect(Number(credit?.amountCents)).toBe(50_000);

      // Cached balances updated: card -150.000, bank 4.950.000
      const cardAfterPay1 = await prisma.account.findUnique({ where: { id: card.id } });
      const bankAfterPay1 = await prisma.account.findUnique({ where: { id: bank.id } });
      expect(Number(cardAfterPay1?.balanceCents)).toBe(-150_000);
      expect(Number(bankAfterPay1?.balanceCents)).toBe(4_950_000);

      // Pay the remaining 150.000 → card has no debt
      const pay2 = await payCreditCard(makePayInput(card.id, bank.id, 150_000));
      expect(pay2.success).toBe(true);
      const cardAfterPay2 = await prisma.account.findUnique({ where: { id: card.id } });
      expect(Number(cardAfterPay2?.balanceCents)).toBe(0);

      // Delete the card (no debt → allowed)
      const del = await deleteCreditCard({ accountId: card.id });
      expect(del.success).toBe(true);
      const deleted = await prisma.account.findUnique({ where: { id: card.id } });
      expect(deleted?.isActive).toBe(false);
      expect(deleted?.deletedAt).not.toBeNull();
    });
  });

  describe('payCreditCard validations', () => {
    it('returns CARD_NO_DEBT when paying a card with no outstanding balance', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const bank = await createBankAccount(SPANISH_USER_ID, 1_000_000);
      const card = await createCardAccount(SPANISH_USER_ID);

      const res = await payCreditCard(makePayInput(card.id, bank.id, 50_000));
      expect(res.success).toBe(false);
      expect(res.code).toBe('CARD_NO_DEBT');
    });

    it('returns CARD_OVERPAYMENT when paying more than the outstanding debt', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const bank = await createBankAccount(SPANISH_USER_ID, 1_000_000);
      const card = await createCardAccount(SPANISH_USER_ID);

      await createTransaction(makeExpenseInput(card.id, 50_000));

      const res = await payCreditCard(makePayInput(card.id, bank.id, 100_000));
      expect(res.success).toBe(false);
      expect(res.code).toBe('CARD_OVERPAYMENT');

      // No transactions were created (rollback)
      const txCount = await prisma.transaction.count({ where: { accountId: card.id } });
      expect(txCount).toBe(1); // only the expense
    });
  });

  describe('credit limit enforcement', () => {
    it('rejects an EXPENSE that would exceed the credit limit', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const card = await createCardAccount(SPANISH_USER_ID, { creditLimitCents: 100_000 });

      // Within the limit → OK
      const ok = await createTransaction(makeExpenseInput(card.id, 60_000));
      expect(ok.success).toBe(true);

      // This would leave debt 110.000 > limit 100.000 → rejected
      const over = await createTransaction(makeExpenseInput(card.id, 50_000));
      expect(over.success).toBe(false);
      expect(over.code).toBe('CREDIT_LIMIT_EXCEEDED');

      // Only the first transaction persisted
      const txs = await prisma.transaction.count({ where: { accountId: card.id, isActive: true } });
      expect(txs).toBe(1);
    });

    it('allows EXPENSE at exactly the credit limit boundary', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const card = await createCardAccount(SPANISH_USER_ID, { creditLimitCents: 100_000 });

      const res = await createTransaction(makeExpenseInput(card.id, 100_000));
      expect(res.success).toBe(true);
    });

    it('does not enforce a limit when the card has no creditLimitCents', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const card = await createCardAccount(SPANISH_USER_ID, { creditLimitCents: null });

      const res = await createTransaction(makeExpenseInput(card.id, 10_000_000));
      expect(res.success).toBe(true);
    });
  });

  describe('INCOME on a credit card', () => {
    it('rejects INCOME registered on a credit card', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const card = await createCardAccount(SPANISH_USER_ID);

      const res = await createTransaction({
        idempotencyKey: crypto.randomUUID(),
        accountId: card.id,
        type: 'INCOME',
        amountCents: 100_000,
        currency: 'COP',
        description: 'Income on card',
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('VALIDATION_ERROR');
      expect(res.error).toContain('Income cannot be registered on a credit card');
    });
  });

  describe('transfers involving credit cards', () => {
    it('rejects a transfer to a credit card', async () => {
      await createUser(CUID_USER_ID);
      sessionFor(CUID_USER_ID);

      const bank = await createBankAccount(CUID_USER_ID, 1_000_000);
      const card = await createCardAccount(CUID_USER_ID);

      const res = await transferBetweenAccounts({
        userId: CUID_USER_ID,
        idempotencyKey: crypto.randomUUID(),
        fromAccountId: bank.id,
        toAccountId: card.id,
        amountCents: 50_000,
        currency: 'COP',
        description: 'To card',
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('VALIDATION_ERROR');
      expect(res.error).toContain('Transfers involving credit cards are not allowed');

      // Nothing persisted
      const txs = await prisma.transaction.count({
        where: { userId: CUID_USER_ID, type: { in: ['TRANSFER_OUT', 'TRANSFER_IN'] } },
      });
      expect(txs).toBe(0);
    });

    it('rejects a transfer from a credit card', async () => {
      await createUser(CUID_USER_ID);
      sessionFor(CUID_USER_ID);

      const bank = await createBankAccount(CUID_USER_ID, 1_000_000);
      const card = await createCardAccount(CUID_USER_ID);

      const res = await transferBetweenAccounts({
        userId: CUID_USER_ID,
        idempotencyKey: crypto.randomUUID(),
        fromAccountId: card.id,
        toAccountId: bank.id,
        amountCents: 50_000,
        currency: 'COP',
        description: 'From card',
      });
      expect(res.success).toBe(false);
      expect(res.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('idempotency', () => {
    it('returns the same payment for a duplicated payCreditCard key', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const bank = await createBankAccount(SPANISH_USER_ID, 1_000_000);
      const card = await createCardAccount(SPANISH_USER_ID);
      await createTransaction(makeExpenseInput(card.id, 200_000));

      const key = crypto.randomUUID();
      const input = makePayInput(card.id, bank.id, 80_000);
      input.idempotencyKey = key;

      const first = await payCreditCard(input);
      expect(first.success).toBe(true);
      expect(first.data?.wasIdempotent).toBe(false);

      const second = await payCreditCard(input);
      expect(second.success).toBe(true);
      expect(second.data?.wasIdempotent).toBe(true);
      expect((second.data as { payment: { id: string } }).payment.id).toBe(
        (first.data as { payment: { id: string } }).payment.id
      );

      // Only one CREDIT_PAYMENT was created
      const payments = await prisma.transaction.count({
        where: { accountId: card.id, type: 'CREDIT_PAYMENT' },
      });
      expect(payments).toBe(1);

      // Bank balance deducted only once
      const bankAfter = await prisma.account.findUnique({ where: { id: bank.id } });
      expect(Number(bankAfter?.balanceCents)).toBe(920_000);
    });
  });

  describe('concurrency (FOR UPDATE lock)', () => {
    it('does not overdraw a source account when two concurrent payments race', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      // Source has exactly 100.000 (funded by INCOME) and the card owes 100.000.
      const bank = await createBankAccount(SPANISH_USER_ID, 100_000);
      const card = await createCardAccount(SPANISH_USER_ID);
      await createTransaction(makeExpenseInput(card.id, 100_000));

      const [r1, r2] = await Promise.all([
        payCreditCard(makePayInput(card.id, bank.id, 100_000)),
        payCreditCard(makePayInput(card.id, bank.id, 100_000)),
      ]);

      // Exactly one succeeds; the other must fail (either no debt left or insufficient funds)
      const successes = [r1, r2].filter((r) => r.success === true);
      const failures = [r1, r2].filter((r) => r.success === false);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(['CARD_NO_DEBT', 'INSUFFICIENT_FUNDS']).toContain(failures[0].code);

      // The source account never went negative and the card has no debt.
      const bankAfter = await prisma.account.findUnique({ where: { id: bank.id } });
      const cardAfter = await prisma.account.findUnique({ where: { id: card.id } });
      expect(Number(bankAfter?.balanceCents)).toBeGreaterThanOrEqual(0);
      expect(Number(cardAfter?.balanceCents)).toBe(0);

      // Exactly one double-entry pair was created
      const creditPayments = await prisma.transaction.count({
        where: { accountId: card.id, type: 'CREDIT_PAYMENT' },
      });
      expect(creditPayments).toBe(1);
    });

    it('does not overdraw a source account when two concurrent transfers race', async () => {
      await createUser(CUID_USER_ID);
      sessionFor(CUID_USER_ID);

      // A has 100.000; each transfer tries to move 60.000 → only one fits.
      const from = await createBankAccount(CUID_USER_ID, 100_000);
      const to = await prisma.account.create({
        data: {
          userId: CUID_USER_ID,
          name: 'Destino',
          type: AccountType.SAVINGS,
          balanceCents: 0,
          currency: Currency.COP,
          isActive: true,
          createdBy: CUID_USER_ID,
          lastModifiedBy: CUID_USER_ID,
        },
      });

      const build = () => ({
        userId: CUID_USER_ID,
        idempotencyKey: crypto.randomUUID(),
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: 60_000,
        currency: 'COP',
        description: 'Concurrent transfer',
      });

      const [r1, r2] = await Promise.all([
        transferBetweenAccounts(build()),
        transferBetweenAccounts(build()),
      ]);

      const successes = [r1, r2].filter((r) => r.success === true);
      const failures = [r1, r2].filter((r) => r.success === false);
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0].code).toBe('INSUFFICIENT_FUNDS');

      // Source never overdrawn: 100.000 - 60.000 = 40.000
      const fromAfter = await prisma.account.findUnique({ where: { id: from.id } });
      const toAfter = await prisma.account.findUnique({ where: { id: to.id } });
      expect(Number(fromAfter?.balanceCents)).toBe(40_000);
      expect(Number(toAfter?.balanceCents)).toBe(60_000);

      // Only one transfer pair persisted
      const pairs = await prisma.transaction.findMany({
        where: { accountId: from.id, type: 'TRANSFER_OUT' },
      });
      expect(pairs).toHaveLength(1);
    });
  });

  describe('large amounts (BigInt)', () => {
    it('handles amounts above 21M COP without overflow or precision loss', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      // 50.000.000 COP = 5.000.000.000 cents
      const bank = await createBankAccount(SPANISH_USER_ID, 5_000_000_000);
      const card = await createCardAccount(SPANISH_USER_ID, { creditLimitCents: 5_000_000_000 });

      // Consume 21.000.000 COP = 2.100.000.000 cents
      const expense = await createTransaction(makeExpenseInput(card.id, 2_100_000_000));
      expect(expense.success).toBe(true);

      const pay = await payCreditCard(makePayInput(card.id, bank.id, 2_100_000_000));
      expect(pay.success).toBe(true);

      const cardAfter = await prisma.account.findUnique({ where: { id: card.id } });
      const bankAfter = await prisma.account.findUnique({ where: { id: bank.id } });
      expect(Number(cardAfter?.balanceCents)).toBe(0);
      expect(Number(bankAfter?.balanceCents)).toBe(2_900_000_000);

      // Statement math stays exact
      const stmt = await getCreditCardStatement({ accountId: card.id });
      expect(stmt.success).toBe(true);
      const data = stmt.data as Record<string, unknown>;
      expect(data.newBalanceCents).toBe(0);
    });
  });

  describe('localized payment description', () => {
    it('uses the English default description for an ENGLISH user', async () => {
      await createUser(ENGLISH_USER_ID, Language.ENGLISH);
      sessionFor(ENGLISH_USER_ID);

      const bank = await createBankAccount(ENGLISH_USER_ID, 1_000_000);
      const card = await createCardAccount(ENGLISH_USER_ID, { name: 'Platinum' });
      await createTransaction(makeExpenseInput(card.id, 50_000));

      const res = await payCreditCard({
        ...makePayInput(card.id, bank.id, 50_000),
        description: undefined,
      });
      expect(res.success).toBe(true);

      const payment = await prisma.transaction.findFirst({
        where: { accountId: card.id, type: 'CREDIT_PAYMENT' },
      });
      expect(payment?.description).toBe('Credit card payment Platinum');
    });

    it('uses the Spanish default description for a SPANISH user', async () => {
      await createUser(SPANISH_USER_ID, Language.SPANISH);
      sessionFor(SPANISH_USER_ID);

      const bank = await createBankAccount(SPANISH_USER_ID, 1_000_000);
      const card = await createCardAccount(SPANISH_USER_ID, { name: 'Oro' });
      await createTransaction(makeExpenseInput(card.id, 50_000));

      const res = await payCreditCard({
        ...makePayInput(card.id, bank.id, 50_000),
        description: undefined,
      });
      expect(res.success).toBe(true);

      const payment = await prisma.transaction.findFirst({
        where: { accountId: card.id, type: 'CREDIT_PAYMENT' },
      });
      expect(payment?.description).toBe('Pago tarjeta Oro');
    });
  });

  describe('updateCreditCard (integration)', () => {
    it('updates card attributes without touching balanceCents', async () => {
      await createUser(SPANISH_USER_ID);
      sessionFor(SPANISH_USER_ID);

      const card = await createCardAccount(SPANISH_USER_ID, { creditLimitCents: 1_000_000 });
      await createTransaction(makeExpenseInput(card.id, 100_000));

      const res = await updateCreditCard({
        accountId: card.id,
        name: 'Visa Negra',
        creditLimitCents: 2_000_000,
      });
      expect(res.success).toBe(true);

      const updated = await prisma.account.findUnique({ where: { id: card.id } });
      expect(updated?.name).toBe('Visa Negra');
      expect(Number(updated?.creditLimitCents)).toBe(2_000_000);
      expect(Number(updated?.balanceCents)).toBe(-100_000); // untouched
    });
  });
});
