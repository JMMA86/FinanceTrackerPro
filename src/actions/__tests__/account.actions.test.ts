import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db', () => {
  const mockAccount = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const mockTransaction = { create: vi.fn(), count: vi.fn(), updateMany: vi.fn() };
  const mockUser = { findUnique: vi.fn() };
  const mockInvestmentAssetHolding = { count: vi.fn() };

  const prismaMock = {
    account: mockAccount,
    transaction: mockTransaction,
    user: mockUser,
    investmentAssetHolding: mockInvestmentAssetHolding,
    $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback({
        account: mockAccount,
        transaction: mockTransaction,
      });
    }),
  };

  return { prisma: prismaMock };
});
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn(),
}));
vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn(),
}));

import {
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
} from '../account.actions';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { headers } from 'next/headers';
import { log } from '@/lib/logger';
import { getTrueBalance } from '@/services/reconciliation.service';
import { getTransactionRepository } from '@/lib/repositories';

const mockGetSession = vi.mocked(getSession);
const mockAccount = vi.mocked(prisma.account);
const mockTransaction = vi.mocked(prisma.transaction);
const mockUser = vi.mocked(prisma.user);
const mockInvestmentAssetHolding = vi.mocked(prisma.investmentAssetHolding);
const mockHeaders = vi.mocked(headers);
const mockLog = vi.mocked(log);
const mockGetTrueBalance = vi.mocked(getTrueBalance);
const mockGetTransactionRepository = vi.mocked(getTransactionRepository);

const USER_ID = 'cuser000000000000000001';
const ACCOUNT_ID = 'cacct000000000000000001';
const IDEM_KEY = '550e8400-e29b-41d4-a716-446655440000';

function makeSession() {
  return { userId: USER_ID, email: 'test@example.com', name: 'Test' };
}

function makeAccountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ACCOUNT_ID,
    name: 'Test Account',
    type: 'CHECKING',
    currency: 'COP',
    balanceCents: 500_000,
    interestRateEA: null,
    parentAccountId: null,
    cardColor: null,
    idempotencyKey: IDEM_KEY,
    isActive: true,
    userId: USER_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: USER_ID,
    lastModifiedBy: USER_ID,
    creditLimitCents: null,
    cutoffDay: null,
    paymentDueDay: null,
    lastReconciled: null,
    ...overrides,
  } as unknown as NonNullable<Awaited<ReturnType<typeof prisma.account.findUnique>>>;
}

function makeHeaders(ip = '127.0.0.1', ua = 'Vitest') {
  return {
    get: (k: string) => (k === 'x-forwarded-for' ? ip : k === 'user-agent' ? ua : null),
  } as unknown as Awaited<ReturnType<typeof headers>>;
}

function makeCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    idempotencyKey: IDEM_KEY,
    name: 'Mi Cuenta',
    type: 'CHECKING',
    currency: 'COP',
    initialBalanceCents: 0,
    ...overrides,
  };
}

describe('account.actions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(makeHeaders());
  });

  describe('getBankAccounts', () => {
    it('returns UnauthorizedError when session is null', async () => {
      mockGetSession.mockResolvedValue(null);
      const result = await getBankAccounts({} as Record<string, never>);
      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
    });

    it('queries only bank account types for the session user', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findMany.mockResolvedValue([]);
      await getBankAccounts({} as Record<string, never>);
      expect(mockAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            isActive: true,
            type: { in: ['CHECKING', 'CASH', 'SAVINGS', 'POCKET'] },
          }),
        })
      );
    });
  });

  describe('createBankAccount', () => {
    it('returns UnauthorizedError when no session', async () => {
      mockGetSession.mockResolvedValue(null);
      const result = await createBankAccount(makeCreateInput());
      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(mockAccount.create).not.toHaveBeenCalled();
    });

    it('returns SESSION_INVALID when user does not exist in DB', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue(null);
      mockAccount.findUnique.mockResolvedValue(null);
      const result = await createBankAccount(makeCreateInput());
      expect(result.success).toBe(false);
      expect(result.code).toBe('SESSION_INVALID');
    });

    it('returns wasIdempotent=true for duplicate idempotency key', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      const result = await createBankAccount(makeCreateInput());
      expect(result.success).toBe(true);
      expect(result.data?.wasIdempotent).toBe(true);
      expect(mockAccount.create).not.toHaveBeenCalled();
      expect(mockTransaction.create).not.toHaveBeenCalled();
    });

    it('creates account with createdBy and lastModifiedBy = userId', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(makeAccountRow());
      await createBankAccount(makeCreateInput());
      expect(mockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: USER_ID, lastModifiedBy: USER_ID }),
        })
      );
    });

    it('captures and logs ipAddress and userAgent from headers', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(makeAccountRow());
      mockHeaders.mockResolvedValue(makeHeaders('203.0.113.5', 'TestBrowser/2.0'));
      await createBankAccount(makeCreateInput());
      expect(mockLog.info).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: '203.0.113.5', userAgent: 'TestBrowser/2.0' }),
        expect.any(String)
      );
    });

    it('returns ValidationError for name with script injection', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      const result = await createBankAccount(
        makeCreateInput({ name: '<script>alert(1)</script>' })
      );
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns ValidationError for invalid idempotency key', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      const result = await createBankAccount(makeCreateInput({ idempotencyKey: 'not-a-uuid' }));
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('returns ValidationError for negative initialBalanceCents', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      const result = await createBankAccount(makeCreateInput({ initialBalanceCents: -100 }));
      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('stores idempotencyKey and cardColor', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(makeAccountRow());
      await createBankAccount(makeCreateInput({ cardColor: 'blue' }));
      expect(mockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idempotencyKey: IDEM_KEY, cardColor: 'blue' }),
        })
      );
    });

    it('creates opening INCOME transaction when initialBalanceCents > 0', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(makeAccountRow({ balanceCents: 100_000 }));
      const result = await createBankAccount(makeCreateInput({ initialBalanceCents: 100_000 }));
      expect(result.success).toBe(true);
      expect(mockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'INCOME',
            amountCents: 100_000,
            description: 'Saldo inicial',
            currency: 'COP',
            openingBalance: true,
            userId: USER_ID,
            accountId: ACCOUNT_ID,
          }),
        })
      );
    });

    it('does not create opening transaction when initialBalanceCents is 0', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(makeAccountRow({ balanceCents: 0 }));
      const result = await createBankAccount(makeCreateInput({ initialBalanceCents: 0 }));
      expect(result.success).toBe(true);
      expect(mockTransaction.create).not.toHaveBeenCalled();
    });

    it('uses English description when user language is ENGLISH', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'ENGLISH' } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(makeAccountRow({ balanceCents: 50_000 }));
      await createBankAccount(makeCreateInput({ initialBalanceCents: 50_000 }));
      expect(mockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: 'Initial balance' }),
        })
      );
    });

    it('creates opening transaction for POCKET with positive balance', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(
        makeAccountRow({ type: 'POCKET', balanceCents: 25_000 })
      );
      await createBankAccount(makeCreateInput({ type: 'POCKET', initialBalanceCents: 25_000 }));
      expect(mockTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'INCOME', amountCents: 25_000 }),
        })
      );
    });

    it('is idempotent: same idempotencyKey returns wasIdempotent=true and no duplicate opening transaction', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID, language: 'SPANISH' } as never);
      mockAccount.findUnique.mockResolvedValue(makeAccountRow({ balanceCents: 100_000 }));
      const result = await createBankAccount(makeCreateInput({ initialBalanceCents: 100_000 }));
      expect(result.success).toBe(true);
      expect(result.data?.wasIdempotent).toBe(true);
      expect(mockAccount.create).not.toHaveBeenCalled();
      expect(mockTransaction.create).not.toHaveBeenCalled();
    });
  });

  describe('updateBankAccount', () => {
    it('returns UnauthorizedError when account belongs to another user', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(
        makeAccountRow({ userId: 'cother00000000000000001' })
      );
      const result = await updateBankAccount({ accountId: ACCOUNT_ID, name: 'New Name' });
      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(mockAccount.update).not.toHaveBeenCalled();
    });

    it('updates name and cardColor when called by owner', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      mockAccount.update.mockResolvedValue(
        makeAccountRow({ name: 'Updated', cardColor: 'violet' })
      );
      const result = await updateBankAccount({
        accountId: ACCOUNT_ID,
        name: 'Updated',
        cardColor: 'violet',
      });
      expect(result.success).toBe(true);
      expect(mockAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: 'Updated', cardColor: 'violet' }),
        })
      );
    });
  });

  describe('deleteBankAccount', () => {
    beforeEach(() => {
      mockGetTransactionRepository.mockReturnValue({} as never);
      mockGetTrueBalance.mockResolvedValue(0);
      mockAccount.findMany.mockResolvedValue([]);
      mockInvestmentAssetHolding.count.mockResolvedValue(0);
      mockTransaction.count.mockResolvedValue(0);
    });

    it('returns UnauthorizedError when account belongs to another user', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(
        makeAccountRow({ userId: 'cother00000000000000001' })
      );
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');
      expect(mockAccount.update).not.toHaveBeenCalled();
    });

    it('soft-deletes: sets isActive=false and deletedAt', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      mockAccount.update.mockResolvedValue(makeAccountRow({ isActive: false }));
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(true);
      expect(mockAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
        })
      );
    });

    it('returns NotFoundError for non-existent account', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(null);
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns NotFoundError for already-deleted account', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow({ isActive: false }));
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('returns ACCOUNT_HAS_BALANCE when true balance is not zero', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      mockGetTrueBalance.mockResolvedValue(50000);
      mockTransaction.count.mockResolvedValue(1);
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(false);
      expect(result.code).toBe('ACCOUNT_HAS_BALANCE');
      expect(mockAccount.update).not.toHaveBeenCalled();
    });

    it('allows deleting account with only opening balance (non-zero trueBalance, zero non-opening)', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      mockGetTrueBalance.mockResolvedValue(50000);
      mockTransaction.count.mockResolvedValue(0);
      mockAccount.update.mockResolvedValue(makeAccountRow({ isActive: false }));
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockAccount.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
        })
      );
      expect(mockTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            accountId: ACCOUNT_ID,
            isActive: true,
            openingBalance: true,
          }),
          data: expect.objectContaining({ isActive: false, deletedAt: expect.any(Date) }),
        })
      );
    });

    it('does NOT call updateMany transactions when trueBalance is 0', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      mockGetTrueBalance.mockResolvedValue(0);
      mockTransaction.count.mockResolvedValue(2);
      mockAccount.update.mockResolvedValue(makeAccountRow({ isActive: false }));
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(true);
      expect(mockTransaction.updateMany).not.toHaveBeenCalled();
    });

    it('returns POCKET_HAS_BALANCE when a pocket still has funds', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      mockGetTrueBalance.mockImplementation(async (_accountId: string) => {
        // parent balance = 0, pocket balance = 25000
        return 0;
      });
      mockAccount.findMany.mockResolvedValue([
        { id: 'pocket-1', name: 'Vacation Pocket' },
      ] as never);
      // Second call to getTrueBalance for the pocket
      mockGetTrueBalance.mockResolvedValueOnce(0).mockResolvedValueOnce(25000);
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(false);
      expect(result.code).toBe('POCKET_HAS_BALANCE');
      expect(mockAccount.update).not.toHaveBeenCalled();
    });

    it('returns ACCOUNT_HAS_HOLDINGS when investment account has active holdings', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockAccount.findUnique.mockResolvedValue(makeAccountRow({ type: 'INVESTMENT' }));
      mockInvestmentAssetHolding.count.mockResolvedValue(2);
      const result = await deleteBankAccount({ accountId: ACCOUNT_ID });
      expect(result.success).toBe(false);
      expect(result.code).toBe('ACCOUNT_HAS_HOLDINGS');
      expect(mockAccount.update).not.toHaveBeenCalled();
    });
  });
});
