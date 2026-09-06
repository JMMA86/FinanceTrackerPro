/**
 * Credit Card Actions Unit Tests (mocked DB — Rule 3/5/12/13)
 *
 * Covers the six server actions of the credit-card module:
 * - getCreditCards
 * - createCreditCard
 * - updateCreditCard
 * - deleteCreditCard
 * - getCreditCardStatement
 * - payCreditCard
 *
 * All database access is mocked following the transfer.actions.test.ts pattern.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

import {
  getCreditCards,
  createCreditCard,
  updateCreditCard,
  deleteCreditCard,
  getCreditCardStatement,
  payCreditCard,
} from '../credit-card.actions';
import type { Prisma, Transaction, Currency } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(),
    account: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => {
    const headersMap = new Map();
    headersMap.set('x-forwarded-for', '192.168.1.1');
    headersMap.set('x-real-ip', '192.168.1.1');
    headersMap.set('user-agent', 'test-agent');
    return headersMap;
  }),
}));

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn(),
}));

vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-123'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn(() => ({
    findManyByAccountId: vi.fn(() => Promise.resolve([])),
    findByIdempotencyKey: vi.fn(() => Promise.resolve(null)),
    findPairedTransfers: vi.fn(() => Promise.resolve([])),
    create: vi.fn(),
    findById: vi.fn(),
    createMany: vi.fn(),
    softDelete: vi.fn(),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { getSession } from '@/lib/auth/session';
import { getTrueBalance } from '@/services/reconciliation.service';
import { checkApiRateLimit } from '@/services/rate-limit.service';
import { prisma } from '@/lib/db';

const mockGetSession = vi.mocked(getSession);
const mockGetTrueBalance = vi.mocked(getTrueBalance);
const mockCheckApiRateLimit = vi.mocked(checkApiRateLimit);

const VALID_USER_ID = 'clh1234567890abcdefghij';
const VALID_CARD_ID = 'clh1234567890abcdefghik';
const VALID_SOURCE_ID = 'clh1234567890abcdefghil';

const asTransactionClient = (tx: object): Prisma.TransactionClient =>
  tx as Prisma.TransactionClient;

const buildCardAccount = (overrides: Record<string, unknown> = {}) => ({
  id: VALID_CARD_ID,
  userId: VALID_USER_ID,
  name: 'Visa Oro',
  type: 'CREDIT_CARD',
  currency: 'USD',
  balanceCents: BigInt(-1000000),
  creditLimitCents: BigInt(5000000),
  cutoffDay: 10,
  paymentDueDay: 25,
  cardColor: 'blue',
  cardNetwork: 'VISA',
  createdAt: new Date('2026-01-01'),
  transactions: [],
  isActive: true,
  idempotencyKey: null,
  ...overrides,
});

const buildMockTransaction = (
  overrides: Partial<Omit<Transaction, 'amountCents' | 'originalAmountCents'>> & {
    amountCents?: number;
    originalAmountCents?: number | null;
  } = {}
): Transaction => {
  const { amountCents, originalAmountCents, ...rest } = overrides;
  return {
    id: 'tx-1',
    idempotencyKey: 'key-1',
    userId: VALID_USER_ID,
    accountId: VALID_CARD_ID,
    type: 'EXPENSE',
    amountCents: amountCents == null ? BigInt(-10000) : BigInt(amountCents),
    currency: 'USD' as Currency,
    description: 'Test',
    date: new Date(),
    originalAmountCents: originalAmountCents == null ? null : BigInt(originalAmountCents),
    originalCurrency: null,
    exchangeRate: null,
    transferId: 'transfer-1',
    transferToAccountId: null,
    transferFromAccountId: null,
    categoryId: null,
    fixedExpensePaymentId: null,
    loanInstallmentId: null,
    ipAddress: '192.168.1.1',
    userAgent: 'test',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: VALID_USER_ID,
    lastModifiedBy: VALID_USER_ID,
    openingBalance: false,
    ...rest,
  };
};

const validCreateInput = () => ({
  idempotencyKey: crypto.randomUUID(),
  name: 'Visa Oro',
  currency: 'USD',
  creditLimitCents: 5_000_000,
  cutoffDay: 10,
  paymentDueDay: 25,
  cardColor: 'blue',
  cardNetwork: 'VISA',
});

const validPayInput = (overrides: Record<string, unknown> = {}) => ({
  idempotencyKey: crypto.randomUUID(),
  accountId: VALID_CARD_ID,
  sourceAccountId: VALID_SOURCE_ID,
  amountCents: 50000,
  currency: 'USD',
  description: 'Pago tarjeta',
  ...overrides,
});

describe('credit-card.actions.ts (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      userId: VALID_USER_ID,
      email: 'test@example.com',
      name: 'Test User',
    });
    mockGetTrueBalance.mockResolvedValue(0);
    mockCheckApiRateLimit.mockResolvedValue({ allowed: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCreditCards', () => {
    it('returns UNAUTHORIZED when there is no session', async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await getCreditCards({});
      expect(res.success).toBe(false);
      expect(res.code).toBe('UNAUTHORIZED');
    });

    it('returns cards with debtCents, availableCreditCents and paymentStatus', async () => {
      const card = buildCardAccount({ id: VALID_CARD_ID });
      vi.mocked(prisma.account.findMany).mockResolvedValue([card] as never);

      // trueBalance = -200000 → debt 200000
      mockGetTrueBalance.mockResolvedValue(-200000);

      const res = await getCreditCards({});
      expect(res.success).toBe(true);
      const cards = res.data as Array<Record<string, unknown>>;
      expect(cards).toHaveLength(1);
      expect(cards[0].debtCents).toBe(200000);
      expect(cards[0].availableCreditCents).toBe(5000000 - 200000);
      expect(cards[0].paymentStatus).toBeDefined();
      // transactions are serialized to numbers
      expect(cards[0].transactions).toEqual([]);
    });

    it('computes availableCreditCents as null when the card has no credit limit', async () => {
      const card = buildCardAccount({ creditLimitCents: null });
      vi.mocked(prisma.account.findMany).mockResolvedValue([card] as never);
      mockGetTrueBalance.mockResolvedValue(-50000);

      const res = await getCreditCards({});
      expect(res.success).toBe(true);
      const cards = res.data as Array<Record<string, unknown>>;
      expect(cards[0].availableCreditCents).toBeNull();
    });

    it('maps recent transactions with serialized amounts', async () => {
      const card = buildCardAccount({
        transactions: [
          {
            id: 't-1',
            description: 'Compra',
            amountCents: BigInt(-25000),
            currency: 'USD',
            type: 'EXPENSE',
            date: new Date('2026-08-01'),
          },
        ],
      });
      vi.mocked(prisma.account.findMany).mockResolvedValue([card] as never);
      mockGetTrueBalance.mockResolvedValue(-25000);

      const res = await getCreditCards({});
      expect(res.success).toBe(true);
      const cards = res.data as Array<Record<string, unknown>>;
      const txs = cards[0].transactions as Array<Record<string, unknown>>;
      expect(txs[0].amountCents).toBe(-25000);
    });

    describe('payment status edge cases', () => {
      const today = new Date();

      it('marks a card as DUE_SOON when the due date is today', async () => {
        const card = buildCardAccount({ paymentDueDay: today.getDate() });
        vi.mocked(prisma.account.findMany).mockResolvedValue([card] as never);
        mockGetTrueBalance.mockResolvedValue(-1000);

        const res = await getCreditCards({});
        const cards = res.data as Array<Record<string, unknown>>;
        expect(cards[0].paymentStatus).toBe('DUE_SOON');
      });

      it('marks a card as ON_TRACK when the due date is more than 7 days away', async () => {
        const card = buildCardAccount({ paymentDueDay: today.getDate() + 10 });
        vi.mocked(prisma.account.findMany).mockResolvedValue([card] as never);
        mockGetTrueBalance.mockResolvedValue(-1000);

        const res = await getCreditCards({});
        const cards = res.data as Array<Record<string, unknown>>;
        expect(cards[0].paymentStatus).toBe('ON_TRACK');
      });

      it('marks a card with no paymentDueDay as ON_TRACK', async () => {
        const card = buildCardAccount({ paymentDueDay: null });
        vi.mocked(prisma.account.findMany).mockResolvedValue([card] as never);
        mockGetTrueBalance.mockResolvedValue(-1000);

        const res = await getCreditCards({});
        const cards = res.data as Array<Record<string, unknown>>;
        expect(cards[0].paymentStatus).toBe('ON_TRACK');
      });

      it('marks an overdue card when the due date has passed and there is debt', async () => {
        // Only meaningful when today >= 4 (guaranteed for the CI date).
        const overdueDay = Math.max(1, today.getDate() - 3);
        const card = buildCardAccount({ paymentDueDay: overdueDay });
        vi.mocked(prisma.account.findMany).mockResolvedValue([card] as never);
        mockGetTrueBalance.mockResolvedValue(-1000);

        const res = await getCreditCards({});
        const cards = res.data as Array<Record<string, unknown>>;
        expect(cards[0].paymentStatus).toBe('OVERDUE');
      });
    });
  });

  describe('createCreditCard', () => {
    it('returns UNAUTHORIZED when there is no session', async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await createCreditCard(validCreateInput());
      expect(res.success).toBe(false);
      expect(res.code).toBe('UNAUTHORIZED');
    });

    it('returns SESSION_INVALID when the user no longer exists', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
      const res = await createCreditCard(validCreateInput());
      expect(res.success).toBe(false);
      expect(res.code).toBe('SESSION_INVALID');
    });

    it('creates a card with BigInt fields and returns wasIdempotent=false', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: VALID_USER_ID } as never);
      vi.mocked(prisma.account.findUnique).mockResolvedValue(null as never);
      const created = {
        ...buildCardAccount(),
        balanceCents: BigInt(0),
      };
      vi.mocked(prisma.account.create).mockResolvedValue(created as never);

      const res = await createCreditCard(validCreateInput());
      expect(res.success).toBe(true);
      expect(res.data?.wasIdempotent).toBe(false);
      expect(res.data?.account?.id).toBe(VALID_CARD_ID);
      expect(res.data?.account?.balanceCents).toBe(0);
      expect(res.data?.account?.creditLimitCents).toBe(5000000);

      // The create data must set type CREDIT_CARD and balance 0
      const createData = vi.mocked(prisma.account.create).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createData.data.type).toBe('CREDIT_CARD');
      expect(createData.data.balanceCents).toBe(BigInt(0));
      expect(createData.data.creditLimitCents).toBe(BigInt(5000000));
      expect(createData.data.createdBy).toBe(VALID_USER_ID);
      expect(createData.data.lastModifiedBy).toBe(VALID_USER_ID);
    });

    it('is idempotent when the idempotencyKey already exists', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: VALID_USER_ID } as never);
      const existing = buildCardAccount({ idempotencyKey: 'existing-key' });
      vi.mocked(prisma.account.findUnique).mockResolvedValue(existing as never);

      const res = await createCreditCard(validCreateInput());
      expect(res.success).toBe(true);
      expect(res.data?.wasIdempotent).toBe(true);
      expect(prisma.account.create).not.toHaveBeenCalled();
    });
  });

  describe('updateCreditCard', () => {
    it('returns UNAUTHORIZED when the account belongs to another user', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(
        buildCardAccount({ userId: 'clh9999999999999999999' }) as never
      );
      const res = await updateCreditCard({ accountId: VALID_CARD_ID, name: 'Nuevo' });
      expect(res.success).toBe(false);
      expect(res.code).toBe('UNAUTHORIZED');
    });

    it('returns NOT_FOUND when the account is inactive', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(
        buildCardAccount({ isActive: false }) as never
      );
      const res = await updateCreditCard({ accountId: VALID_CARD_ID, name: 'Nuevo' });
      expect(res.success).toBe(false);
      expect(res.code).toBe('NOT_FOUND');
    });

    it('rejects updating a non credit-card account', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(
        buildCardAccount({ type: 'SAVINGS' }) as never
      );
      const res = await updateCreditCard({ accountId: VALID_CARD_ID, name: 'Nuevo' });
      expect(res.success).toBe(false);
      expect(res.code).toBe('VALIDATION_ERROR');
    });

    it('updates only editable attributes and never balanceCents', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(buildCardAccount() as never);
      vi.mocked(prisma.account.update).mockResolvedValue(
        buildCardAccount({ name: 'Visa Platinum' }) as never
      );

      const res = await updateCreditCard({
        accountId: VALID_CARD_ID,
        name: 'Visa Platinum',
        creditLimitCents: 8_000_000,
        cutoffDay: 5,
        paymentDueDay: 18,
      });
      expect(res.success).toBe(true);
      expect(res.data?.account?.name).toBe('Visa Platinum');

      const updateData = vi.mocked(prisma.account.update).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateData.data).not.toHaveProperty('balanceCents');
      expect(updateData.data.creditLimitCents).toBe(BigInt(8000000));
      expect(updateData.data.lastModifiedBy).toBe(VALID_USER_ID);
    });

    it('accepts partial updates', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(buildCardAccount() as never);
      vi.mocked(prisma.account.update).mockResolvedValue(buildCardAccount() as never);

      const res = await updateCreditCard({ accountId: VALID_CARD_ID, cardColor: 'green' });
      expect(res.success).toBe(true);

      const updateData = vi.mocked(prisma.account.update).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateData.data).not.toHaveProperty('name');
      expect(updateData.data.cardColor).toBe('green');
    });
  });

  describe('deleteCreditCard', () => {
    it('returns CARD_HAS_BALANCE when the card still has debt', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(buildCardAccount() as never);
      mockGetTrueBalance.mockResolvedValue(-250000);

      const res = await deleteCreditCard({ accountId: VALID_CARD_ID });
      expect(res.success).toBe(false);
      expect(res.code).toBe('CARD_HAS_BALANCE');
      expect(prisma.account.update).not.toHaveBeenCalled();
    });

    it('soft-deletes a card with no debt', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(buildCardAccount() as never);
      mockGetTrueBalance.mockResolvedValue(0);
      vi.mocked(prisma.account.update).mockResolvedValue({
        ...buildCardAccount(),
        isActive: false,
      } as never);

      const res = await deleteCreditCard({ accountId: VALID_CARD_ID });
      expect(res.success).toBe(true);

      const updateData = vi.mocked(prisma.account.update).mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(updateData.data.isActive).toBe(false);
      expect(updateData.data.deletedAt).toBeInstanceOf(Date);
      expect(updateData.data.lastModifiedBy).toBe(VALID_USER_ID);
    });

    it('allows deletion when the card has a positive balance (credit in favor)', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(buildCardAccount() as never);
      mockGetTrueBalance.mockResolvedValue(10000);
      vi.mocked(prisma.account.update).mockResolvedValue({
        ...buildCardAccount(),
        isActive: false,
      } as never);

      const res = await deleteCreditCard({ accountId: VALID_CARD_ID });
      expect(res.success).toBe(true);
    });
  });

  describe('getCreditCardStatement', () => {
    it('returns a statement with previous balance, charges, payments and new balance', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(
        buildCardAccount({ cutoffDay: 31, creditLimitCents: BigInt(5000000) }) as never
      );
      vi.mocked(prisma.transaction.findMany)
        .mockResolvedValueOnce([{ amountCents: BigInt(-50000) }] as never)
        .mockResolvedValueOnce([
          {
            id: 'tx-expense',
            description: 'Compra',
            amountCents: BigInt(-100000),
            type: 'EXPENSE',
            date: new Date('2026-08-10'),
            categoryId: null,
          },
          {
            id: 'tx-payment',
            description: 'Pago tarjeta',
            amountCents: BigInt(20000),
            type: 'CREDIT_PAYMENT',
            date: new Date('2026-08-15'),
            categoryId: null,
          },
        ] as never);

      const res = await getCreditCardStatement({ accountId: VALID_CARD_ID, month: 9, year: 2026 });
      expect(res.success).toBe(true);
      const data = res.data as Record<string, unknown>;
      expect(data.previousBalanceCents).toBe(-50000);
      expect(data.chargesTotalCents).toBe(-100000);
      expect(data.paymentsTotalCents).toBe(20000);
      expect(data.newBalanceCents).toBe(-130000);
      // availableCredit = 5000000 - |min(newBalance,0)| = 5000000 - 130000
      expect(data.availableCreditCents).toBe(4870000);
      expect((data.transactions as unknown[]).length).toBe(2);
    });

    it('handles the day-31 cutoff in a short month (February rollover)', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(
        buildCardAccount({ cutoffDay: 31 }) as never
      );
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never);

      // month=3 (March 2026): periodStart = new Date(2026, 1, 31) → Mar 3 (Feb has 28 days)
      const res = await getCreditCardStatement({ accountId: VALID_CARD_ID, month: 3, year: 2026 });
      expect(res.success).toBe(true);
      const data = res.data as { periodStart: Date; periodEnd: Date };
      expect(data.periodStart.getMonth()).toBe(2); // March
      expect(data.periodEnd.getMonth()).toBe(2); // March 31
      expect(data.periodEnd.getDate()).toBe(31);
    });

    it('returns availableCreditCents null when no credit limit is set', async () => {
      vi.mocked(prisma.account.findUnique).mockResolvedValue(
        buildCardAccount({ cutoffDay: 10, creditLimitCents: null }) as never
      );
      vi.mocked(prisma.transaction.findMany).mockResolvedValue([] as never);

      const res = await getCreditCardStatement({ accountId: VALID_CARD_ID });
      expect(res.success).toBe(true);
      expect((res.data as Record<string, unknown>).availableCreditCents).toBeNull();
    });
  });

  describe('payCreditCard', () => {
    // Holds the last transaction-client mock used inside $transaction so tests
    // can assert on the double-entry create payloads.
    let lastInnerTx: {
      $queryRaw: ReturnType<typeof vi.fn>;
      account: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
      transaction: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    };

    const mockPayTransaction = (language: 'SPANISH' | 'ENGLISH' = 'SPANISH') => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: VALID_USER_ID,
        language,
      } as never);

      vi.mocked(prisma.$transaction).mockImplementation(
        async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
          lastInnerTx = {
            $queryRaw: vi.fn().mockResolvedValue([{ id: VALID_SOURCE_ID }]),
            account: {
              findUnique: vi
                .fn()
                .mockResolvedValueOnce(buildCardAccount()) // card
                .mockResolvedValueOnce({
                  id: VALID_SOURCE_ID,
                  userId: VALID_USER_ID,
                  name: 'Checking',
                  balanceCents: BigInt(5000000),
                  currency: 'USD',
                  isActive: true,
                  type: 'CHECKING',
                }) // source
                .mockResolvedValueOnce({ id: VALID_SOURCE_ID, balanceCents: BigInt(5000000) }), // locked source
              update: vi.fn().mockResolvedValue({}),
            },
            transaction: {
              findMany: vi
                .fn()
                .mockResolvedValueOnce([{ amountCents: BigInt(-1000000) }]) // card debt
                .mockResolvedValueOnce([{ amountCents: BigInt(5000000) }]), // source funds
              create: vi
                .fn()
                .mockResolvedValueOnce(
                  buildMockTransaction({
                    id: 'tx-source',
                    type: 'EXPENSE',
                    amountCents: -50000,
                    accountId: VALID_SOURCE_ID,
                  })
                )
                .mockResolvedValueOnce(
                  buildMockTransaction({
                    id: 'tx-card',
                    type: 'CREDIT_PAYMENT',
                    amountCents: 50000,
                    accountId: VALID_CARD_ID,
                  })
                ),
            },
          };
          return callback(asTransactionClient(lastInnerTx as never));
        }
      );
    };

    it('returns UNAUTHORIZED without a session', async () => {
      mockGetSession.mockResolvedValueOnce(null);
      const res = await payCreditCard(validPayInput());
      expect(res.success).toBe(false);
      expect(res.code).toBe('UNAUTHORIZED');
    });

    it('returns RATE_LIMITED when the API limit is exceeded', async () => {
      mockCheckApiRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterMs: 60000 });
      const res = await payCreditCard(validPayInput());
      expect(res.success).toBe(false);
      expect(res.code).toBe('RATE_LIMITED');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns wasIdempotent=true for a duplicate idempotencyKey', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(
        buildMockTransaction({
          id: 'existing-payment',
          type: 'CREDIT_PAYMENT',
          amountCents: 50000,
        }) as never
      );
      const res = await payCreditCard(validPayInput());
      expect(res.success).toBe(true);
      expect(res.data?.wasIdempotent).toBe(true);
      expect(res.data?.payment?.id).toBe('existing-payment');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns SESSION_INVALID when the user no longer exists', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null as never);
      const res = await payCreditCard(validPayInput());
      expect(res.success).toBe(false);
      expect(res.code).toBe('SESSION_INVALID');
    });

    it('creates a double-entry payment (EXPENSE on source + CREDIT_PAYMENT on card)', async () => {
      mockPayTransaction();
      const input = validPayInput();

      const res = await payCreditCard(input);
      expect(res.success).toBe(true);
      expect(res.data?.wasIdempotent).toBe(false);
      expect(res.data?.payment?.id).toBe('tx-card');
      expect(res.data?.sourceTransaction?.id).toBe('tx-source');

      const sourceCall = lastInnerTx.transaction.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      const paymentCall = lastInnerTx.transaction.create.mock.calls[1][0] as {
        data: Record<string, unknown>;
      };

      expect(sourceCall.data.type).toBe('EXPENSE');
      expect(sourceCall.data.amountCents).toBe(-50000);
      expect(sourceCall.data.accountId).toBe(VALID_SOURCE_ID);
      expect(sourceCall.data.transferToAccountId).toBe(VALID_CARD_ID);
      expect(paymentCall.data.type).toBe('CREDIT_PAYMENT');
      expect(paymentCall.data.amountCents).toBe(50000);
      expect(paymentCall.data.accountId).toBe(VALID_CARD_ID);
      expect(paymentCall.data.transferFromAccountId).toBe(VALID_SOURCE_ID);
      expect(sourceCall.data.transferId).toBe(paymentCall.data.transferId);
      expect(paymentCall.data.idempotencyKey).toBe(input.idempotencyKey);

      // Source and card cached balances are updated with addCents/subtractCents
      const updateCalls = lastInnerTx.account.update.mock.calls.map(
        (c) =>
          c[0] as {
            where: { id: string };
            data: Record<string, unknown>;
          }
      );
      const sourceUpdate = updateCalls.find((c) => c.where.id === VALID_SOURCE_ID);
      const cardUpdate = updateCalls.find((c) => c.where.id === VALID_CARD_ID);
      expect(Number(sourceUpdate?.data.balanceCents)).toBe(4950000);
      expect(Number(cardUpdate?.data.balanceCents)).toBe(-950000);
    });

    it('returns CARD_NO_DEBT when the card has no outstanding debt', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: VALID_USER_ID,
        language: 'SPANISH',
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(
        async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
          const mockTx = {
            account: {
              findUnique: vi.fn().mockResolvedValue(buildCardAccount() as never),
            },
            transaction: {
              findMany: vi.fn().mockResolvedValue([{ amountCents: BigInt(5000) }] as never),
              create: vi.fn(),
            },
          };
          return callback(asTransactionClient(mockTx));
        }
      );
      const res = await payCreditCard(validPayInput());
      expect(res.success).toBe(false);
      expect(res.code).toBe('CARD_NO_DEBT');
    });

    it('returns CARD_OVERPAYMENT when paying more than the outstanding debt', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: VALID_USER_ID,
        language: 'SPANISH',
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(
        async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
          const mockTx = {
            account: {
              findUnique: vi.fn().mockResolvedValue(buildCardAccount() as never),
            },
            transaction: {
              findMany: vi.fn().mockResolvedValue([{ amountCents: BigInt(-10000) }] as never),
              create: vi.fn(),
            },
          };
          return callback(asTransactionClient(mockTx));
        }
      );
      const res = await payCreditCard(validPayInput({ amountCents: 50000 }));
      expect(res.success).toBe(false);
      expect(res.code).toBe('CARD_OVERPAYMENT');
    });

    it('returns INSUFFICIENT_FUNDS when the source account cannot fund the payment', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: VALID_USER_ID,
        language: 'SPANISH',
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(
        async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
          const mockTx = {
            $queryRaw: vi.fn().mockResolvedValue([{ id: VALID_SOURCE_ID }]),
            account: {
              findUnique: vi
                .fn()
                .mockResolvedValueOnce(buildCardAccount() as never)
                .mockResolvedValueOnce({
                  id: VALID_SOURCE_ID,
                  userId: VALID_USER_ID,
                  balanceCents: BigInt(1000),
                  currency: 'USD',
                  isActive: true,
                  type: 'CHECKING',
                } as never)
                .mockResolvedValueOnce({
                  id: VALID_SOURCE_ID,
                  balanceCents: BigInt(1000),
                } as never),
              update: vi.fn(),
            },
            transaction: {
              findMany: vi
                .fn()
                .mockResolvedValueOnce([{ amountCents: BigInt(-100000) }] as never)
                .mockResolvedValueOnce([{ amountCents: BigInt(1000) }] as never),
              create: vi.fn(),
            },
          };
          return callback(asTransactionClient(mockTx));
        }
      );
      const res = await payCreditCard(validPayInput({ amountCents: 50000 }));
      expect(res.success).toBe(false);
      expect(res.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('rejects paying from another credit card (source must be a bank account/pocket)', async () => {
      vi.mocked(prisma.transaction.findUnique).mockResolvedValue(null as never);
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: VALID_USER_ID,
        language: 'SPANISH',
      } as never);
      vi.mocked(prisma.$transaction).mockImplementation(
        async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
          const mockTx = {
            account: {
              findUnique: vi
                .fn()
                .mockResolvedValueOnce(buildCardAccount() as never)
                .mockResolvedValueOnce(
                  buildCardAccount({ id: VALID_SOURCE_ID, type: 'CREDIT_CARD' }) as never
                ),
            },
            transaction: {
              findMany: vi.fn().mockResolvedValue([{ amountCents: BigInt(-100000) }] as never),
              create: vi.fn(),
            },
          };
          return callback(asTransactionClient(mockTx));
        }
      );
      const res = await payCreditCard(validPayInput());
      expect(res.success).toBe(false);
      expect(res.code).toBe('VALIDATION_ERROR');
    });

    it('uses the localized default description for ENGLISH users', async () => {
      mockPayTransaction('ENGLISH');

      const res = await payCreditCard(validPayInput({ description: undefined }));
      expect(res.success).toBe(true);

      const createCall = lastInnerTx.transaction.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.description).toBe(`Credit card payment Visa Oro`);
    });

    it('uses the Spanish default description for SPANISH users', async () => {
      mockPayTransaction('SPANISH');

      const res = await payCreditCard(validPayInput({ description: undefined }));
      expect(res.success).toBe(true);

      const createCall = lastInnerTx.transaction.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.description).toBe(`Pago tarjeta Visa Oro`);
    });

    it('prefers the explicit description over the default', async () => {
      mockPayTransaction('SPANISH');

      const res = await payCreditCard(validPayInput({ description: 'Pago manual' }));
      expect(res.success).toBe(true);

      const createCall = lastInnerTx.transaction.create.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(createCall.data.description).toBe('Pago manual');
    });
  });
});
