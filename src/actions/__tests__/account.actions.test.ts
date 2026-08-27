import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/session', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/db', () => ({
  prisma: {
    account: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
}));
vi.mock('next/headers', () => ({ headers: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));

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

const mockGetSession = vi.mocked(getSession);
const mockAccount = vi.mocked(prisma.account);
const mockUser = vi.mocked(prisma.user);
const mockHeaders = vi.mocked(headers);
const mockLog = vi.mocked(log);

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
      mockUser.findUnique.mockResolvedValue({ id: USER_ID } as never);
      mockAccount.findUnique.mockResolvedValue(makeAccountRow());
      const result = await createBankAccount(makeCreateInput());
      expect(result.success).toBe(true);
      expect(result.data?.wasIdempotent).toBe(true);
      expect(mockAccount.create).not.toHaveBeenCalled();
    });

    it('creates account with createdBy and lastModifiedBy = userId', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID } as never);
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
      mockUser.findUnique.mockResolvedValue({ id: USER_ID } as never);
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

    it('stores idempotencyKey and cardColor', async () => {
      mockGetSession.mockResolvedValue(makeSession());
      mockUser.findUnique.mockResolvedValue({ id: USER_ID } as never);
      mockAccount.findUnique.mockResolvedValue(null);
      mockAccount.create.mockResolvedValue(makeAccountRow());
      await createBankAccount(makeCreateInput({ cardColor: 'blue' }));
      expect(mockAccount.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ idempotencyKey: IDEM_KEY, cardColor: 'blue' }),
        })
      );
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
  });
});
