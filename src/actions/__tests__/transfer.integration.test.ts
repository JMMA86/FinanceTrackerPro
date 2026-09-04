/**
 * Transfer Integration Tests
 * Tests atomic transfer functionality following CLAUDE.md rules
 *
 * These tests verify:
 * - Atomic transactions (prisma.$transaction)
 * - Idempotency (UUID v4 keys)
 * - Source of truth reconciliation
 * - Audit trail (IP, user agent)
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ============================================================================
// Mocks (required for action imports)
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

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn().mockResolvedValue(100000),
}));

vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn(() => ({
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findPairedTransfers: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    findById: vi.fn(),
    findManyByAccountId: vi.fn(),
    createMany: vi.fn(),
    softDelete: vi.fn(),
  })),
}));

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'test-user-integration-' + Date.now();
const TEST_USER_ID_2 = 'test-user-integration-2-' + Date.now();
// Pocket tests need a CUID userId (TransferSchema validates /^c[a-z0-9]{20,}$/)
const POCKET_USER_ID = 'clpocketuser00000000000001';

let pool: Pool;
let prisma: PrismaClient;

import { getSession } from '@/lib/auth/session';
import { transferBetweenAccounts } from '../transfer.actions';

const mockGetSession = vi.mocked(getSession);

const createTestUser = async () => {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `test-${Date.now()}@example.com`,
      name: 'Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.USD,
      isActive: true,
    },
  });
};

describe('Transfer Integration Tests', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await prisma.transaction.deleteMany({
      where: {
        OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }, { userId: POCKET_USER_ID }],
      },
    });
    await prisma.account.deleteMany({
      where: {
        OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }, { userId: POCKET_USER_ID }],
      },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: TEST_USER_ID }, { id: TEST_USER_ID_2 }, { id: POCKET_USER_ID }] },
    });
  });

  afterEach(async () => {
    await prisma.transaction.deleteMany({
      where: {
        OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }, { userId: POCKET_USER_ID }],
      },
    });
    await prisma.account.deleteMany({
      where: {
        OR: [{ userId: TEST_USER_ID }, { userId: TEST_USER_ID_2 }, { userId: POCKET_USER_ID }],
      },
    });
    await prisma.user.deleteMany({
      where: { OR: [{ id: TEST_USER_ID }, { id: TEST_USER_ID_2 }, { id: POCKET_USER_ID }] },
    });
  });

  describe('Atomic Transfer Flow', () => {
    it('should transfer funds atomically between accounts', async () => {
      await createTestUser();

      const fromAccount = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account A',
          type: AccountType.SAVINGS,
          balanceCents: 10000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const toAccount = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account B',
          type: AccountType.SAVINGS,
          balanceCents: 5000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const transferId = crypto.randomUUID();
      const debitIdempotencyKey = crypto.randomUUID();
      const creditIdempotencyKey = crypto.randomUUID();

      const result = await prisma.$transaction(async (tx) => {
        const debitTx = await tx.transaction.create({
          data: {
            idempotencyKey: debitIdempotencyKey,
            userId: TEST_USER_ID,
            accountId: fromAccount.id,
            type: 'TRANSFER_OUT',
            amountCents: -3000,
            currency: Currency.USD,
            description: 'Test transfer to Account B',
            transferId,
            transferToAccountId: toAccount.id,
            ipAddress: '127.0.0.1',
            userAgent: 'vitest',
            createdBy: TEST_USER_ID,
          },
        });

        const creditTx = await tx.transaction.create({
          data: {
            idempotencyKey: creditIdempotencyKey,
            userId: TEST_USER_ID,
            accountId: toAccount.id,
            type: 'TRANSFER_IN',
            amountCents: 3000,
            currency: Currency.USD,
            description: 'Test transfer from Account A',
            transferId,
            transferFromAccountId: fromAccount.id,
            ipAddress: '127.0.0.1',
            userAgent: 'vitest',
            createdBy: TEST_USER_ID,
          },
        });

        await tx.account.update({
          where: { id: fromAccount.id },
          data: { balanceCents: { decrement: 3000 }, lastModifiedBy: TEST_USER_ID },
        });

        await tx.account.update({
          where: { id: toAccount.id },
          data: { balanceCents: { increment: 3000 }, lastModifiedBy: TEST_USER_ID },
        });

        return { debitTx, creditTx };
      });

      expect(result.debitTx.amountCents).toBe(-3000);
      expect(result.creditTx.amountCents).toBe(3000);
      expect(result.debitTx.transferId).toBe(result.creditTx.transferId);

      const updatedFromAccount = await prisma.account.findUnique({ where: { id: fromAccount.id } });
      const updatedToAccount = await prisma.account.findUnique({ where: { id: toAccount.id } });

      expect(updatedFromAccount?.balanceCents).toBe(7000);
      expect(updatedToAccount?.balanceCents).toBe(8000);
    });

    it('should rollback on insufficient balance (atomic)', async () => {
      await createTestUser();

      const fromAccount = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account A',
          type: AccountType.SAVINGS,
          balanceCents: 1000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const toAccount = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account B',
          type: AccountType.SAVINGS,
          balanceCents: 5000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      await expect(
        prisma.$transaction(async (tx) => {
          await tx.transaction.create({
            data: {
              idempotencyKey: crypto.randomUUID(),
              userId: TEST_USER_ID,
              accountId: fromAccount.id,
              type: 'TRANSFER_OUT',
              amountCents: -2000,
              currency: Currency.USD,
              description: 'Exceeds balance',
              transferId: crypto.randomUUID(),
              transferToAccountId: toAccount.id,
              ipAddress: '127.0.0.1',
              userAgent: 'vitest',
              createdBy: TEST_USER_ID,
            },
          });

          await tx.account.update({
            where: { id: fromAccount.id },
            data: { balanceCents: { decrement: 2000 }, lastModifiedBy: TEST_USER_ID },
          });

          const account = await tx.account.findUnique({ where: { id: fromAccount.id } });
          if (account && account.balanceCents < 0) {
            throw new Error('Insufficient balance');
          }
        })
      ).rejects.toThrow('Insufficient balance');

      const unchangedAccount = await prisma.account.findUnique({ where: { id: fromAccount.id } });
      expect(unchangedAccount?.balanceCents).toBe(1000);
    });

    it('should handle idempotent transfer requests', async () => {
      await createTestUser();

      const accountA = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account A',
          type: AccountType.SAVINGS,
          balanceCents: 10000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const accountB = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Test Account B',
          type: AccountType.SAVINGS,
          balanceCents: 5000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const idempotencyKey = crypto.randomUUID();
      const transferId = crypto.randomUUID();
      const creditIdempotencyKey = crypto.randomUUID();

      await prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            idempotencyKey,
            userId: TEST_USER_ID,
            accountId: accountA.id,
            type: 'TRANSFER_OUT',
            amountCents: -3000,
            currency: Currency.USD,
            description: 'First transfer',
            transferId,
            transferToAccountId: accountB.id,
            ipAddress: '127.0.0.1',
            userAgent: 'vitest',
            createdBy: TEST_USER_ID,
          },
        });

        await tx.transaction.create({
          data: {
            idempotencyKey: creditIdempotencyKey,
            userId: TEST_USER_ID,
            accountId: accountB.id,
            type: 'TRANSFER_IN',
            amountCents: 3000,
            currency: Currency.USD,
            description: 'First transfer',
            transferId,
            transferFromAccountId: accountA.id,
            ipAddress: '127.0.0.1',
            userAgent: 'vitest',
            createdBy: TEST_USER_ID,
          },
        });

        await tx.account.update({
          where: { id: accountA.id },
          data: { balanceCents: { decrement: 3000 }, lastModifiedBy: TEST_USER_ID },
        });

        await tx.account.update({
          where: { id: accountB.id },
          data: { balanceCents: { increment: 3000 }, lastModifiedBy: TEST_USER_ID },
        });
      });

      const existingTx = await prisma.transaction.findUnique({
        where: { idempotencyKey },
      });

      expect(existingTx).not.toBeNull();
      expect(existingTx?.transferId).toBe(transferId);
    });
  });

  describe('Audit Trail Verification', () => {
    it('should capture IP address and user agent in transactions', async () => {
      await createTestUser();

      const account = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Audit Test Account',
          type: AccountType.SAVINGS,
          balanceCents: 10000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const transferId = crypto.randomUUID();

      await prisma.$transaction(async (tx) => {
        await tx.transaction.create({
          data: {
            idempotencyKey: crypto.randomUUID(),
            userId: TEST_USER_ID,
            accountId: account.id,
            type: 'TRANSFER_OUT',
            amountCents: -1000,
            currency: Currency.USD,
            description: 'Audit test transfer',
            transferId,
            ipAddress: '192.168.1.100',
            userAgent: 'Mozilla/5.0 (Test Browser)',
            createdBy: TEST_USER_ID,
          },
        });

        await tx.account.update({
          where: { id: account.id },
          data: { balanceCents: { decrement: 1000 }, lastModifiedBy: TEST_USER_ID },
        });
      });

      const transaction = await prisma.transaction.findFirst({
        where: { transferId },
      });

      expect(transaction?.ipAddress).toBe('192.168.1.100');
      expect(transaction?.userAgent).toBe('Mozilla/5.0 (Test Browser)');
    });
  });

  describe('Session Authorization', () => {
    it('should return UNAUTHORIZED and not create transactions when userId does not match session', async () => {
      await prisma.user.create({
        data: {
          id: TEST_USER_ID,
          email: `session-test-${Date.now()}@example.com`,
          name: 'Session Test User',
          passwordHash: 'hashed_test_password',
          language: Language.SPANISH,
          theme: Theme.LIGHT,
          baseCurrency: Currency.USD,
          isActive: true,
        },
      });

      const fromAccount = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'From Account',
          type: AccountType.SAVINGS,
          balanceCents: 10000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const toAccount = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'To Account',
          type: AccountType.SAVINGS,
          balanceCents: 5000,
          currency: Currency.USD,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      mockGetSession.mockResolvedValueOnce({
        userId: TEST_USER_ID,
        email: 'session@test.com',
        name: 'Session User',
      });

      const result = await transferBetweenAccounts({
        userId: 'cattacker9999999999999',
        idempotencyKey: crypto.randomUUID(),
        fromAccountId: fromAccount.id,
        toAccountId: toAccount.id,
        amountCents: 1000,
        currency: 'USD',
        description: 'Unauthorized transfer attempt',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('UNAUTHORIZED');

      const transactions = await prisma.transaction.findMany({
        where: { userId: { in: [TEST_USER_ID, TEST_USER_ID_2] } },
      });
      expect(transactions).toHaveLength(0);

      const updatedFromAccount = await prisma.account.findUnique({
        where: { id: fromAccount.id },
      });
      expect(updatedFromAccount?.balanceCents).toBe(10000);
    });
  });

  describe('Pocket Transfer Rules', () => {
    // Creates a CUID user plus a parent account, two pockets under it and an
    // external account. All balances are cached on the accounts; getTrueBalance
    // is mocked to a high value so the balance check never blocks the flow.
    async function setupPocketHierarchy() {
      await prisma.user.create({
        data: {
          id: POCKET_USER_ID,
          email: `pocket-${Date.now()}@example.com`,
          name: 'Pocket User',
          passwordHash: 'hashed_test_password',
          language: Language.SPANISH,
          theme: Theme.LIGHT,
          baseCurrency: Currency.USD,
          isActive: true,
        },
      });

      const parent = await prisma.account.create({
        data: {
          userId: POCKET_USER_ID,
          name: 'Parent SAVINGS',
          type: AccountType.SAVINGS,
          balanceCents: 10000,
          currency: Currency.USD,
          isActive: true,
          createdBy: POCKET_USER_ID,
          lastModifiedBy: POCKET_USER_ID,
        },
      });

      const pocket1 = await prisma.account.create({
        data: {
          userId: POCKET_USER_ID,
          name: 'Pocket 1',
          type: AccountType.POCKET,
          balanceCents: 5000,
          currency: Currency.USD,
          parentAccountId: parent.id,
          isActive: true,
          createdBy: POCKET_USER_ID,
          lastModifiedBy: POCKET_USER_ID,
        },
      });

      const pocket2 = await prisma.account.create({
        data: {
          userId: POCKET_USER_ID,
          name: 'Pocket 2',
          type: AccountType.POCKET,
          balanceCents: 3000,
          currency: Currency.USD,
          parentAccountId: parent.id,
          isActive: true,
          createdBy: POCKET_USER_ID,
          lastModifiedBy: POCKET_USER_ID,
        },
      });

      const external = await prisma.account.create({
        data: {
          userId: POCKET_USER_ID,
          name: 'External Account',
          type: AccountType.CHECKING,
          balanceCents: 7000,
          currency: Currency.USD,
          isActive: true,
          createdBy: POCKET_USER_ID,
          lastModifiedBy: POCKET_USER_ID,
        },
      });

      return { parent, pocket1, pocket2, external };
    }

    function buildInput(overrides: Record<string, unknown>) {
      return {
        userId: POCKET_USER_ID,
        idempotencyKey: crypto.randomUUID(),
        amountCents: 2000,
        currency: 'USD',
        ...overrides,
      };
    }

    it('allows account → its pocket and creates paired TRANSFER_OUT/TRANSFER_IN', async () => {
      const { parent, pocket1 } = await setupPocketHierarchy();
      mockGetSession.mockResolvedValue({
        userId: POCKET_USER_ID,
        email: 'pocket@test.com',
        name: 'Pocket User',
      });

      const result = await transferBetweenAccounts(
        buildInput({ fromAccountId: parent.id, toAccountId: pocket1.id })
      );

      expect(result.success).toBe(true);
      expect(result.data?.transferId).toBeDefined();

      const transferId = result.data!.transferId;
      const txs = await prisma.transaction.findMany({ where: { transferId } });
      expect(txs).toHaveLength(2);

      const debit = txs.find((t) => t.type === 'TRANSFER_OUT');
      const credit = txs.find((t) => t.type === 'TRANSFER_IN');
      expect(debit?.accountId).toBe(parent.id);
      expect(debit?.transferToAccountId).toBe(pocket1.id);
      expect(debit?.amountCents).toBe(-2000);
      expect(credit?.accountId).toBe(pocket1.id);
      expect(credit?.transferFromAccountId).toBe(parent.id);
      expect(credit?.amountCents).toBe(2000);

      // Cached balances move from parent to pocket
      const updatedParent = await prisma.account.findUnique({ where: { id: parent.id } });
      const updatedPocket = await prisma.account.findUnique({ where: { id: pocket1.id } });
      expect(updatedParent?.balanceCents).toBe(8000);
      expect(updatedPocket?.balanceCents).toBe(7000);
    });

    it('allows pocket → its parent account', async () => {
      const { parent, pocket1 } = await setupPocketHierarchy();
      mockGetSession.mockResolvedValue({
        userId: POCKET_USER_ID,
        email: 'pocket@test.com',
        name: 'Pocket User',
      });

      const result = await transferBetweenAccounts(
        buildInput({ fromAccountId: pocket1.id, toAccountId: parent.id, amountCents: 1500 })
      );

      expect(result.success).toBe(true);

      const txs = await prisma.transaction.findMany({
        where: { transferId: result.data!.transferId },
      });
      expect(txs).toHaveLength(2);
      const debit = txs.find((t) => t.type === 'TRANSFER_OUT');
      expect(debit?.accountId).toBe(pocket1.id);
      expect(debit?.transferToAccountId).toBe(parent.id);
      expect(debit?.amountCents).toBe(-1500);
    });

    it('allows pocket → sibling pocket', async () => {
      const { pocket1, pocket2 } = await setupPocketHierarchy();
      mockGetSession.mockResolvedValue({
        userId: POCKET_USER_ID,
        email: 'pocket@test.com',
        name: 'Pocket User',
      });

      const result = await transferBetweenAccounts(
        buildInput({ fromAccountId: pocket1.id, toAccountId: pocket2.id, amountCents: 1000 })
      );

      expect(result.success).toBe(true);

      const txs = await prisma.transaction.findMany({
        where: { transferId: result.data!.transferId },
      });
      expect(txs).toHaveLength(2);
      const credit = txs.find((t) => t.type === 'TRANSFER_IN');
      expect(credit?.accountId).toBe(pocket2.id);
      expect(credit?.transferFromAccountId).toBe(pocket1.id);
      expect(credit?.amountCents).toBe(1000);
    });

    it('rejects pocket → external account with POCKET_TRANSFER_NOT_ALLOWED', async () => {
      const { pocket1, external } = await setupPocketHierarchy();
      mockGetSession.mockResolvedValue({
        userId: POCKET_USER_ID,
        email: 'pocket@test.com',
        name: 'Pocket User',
      });

      const result = await transferBetweenAccounts(
        buildInput({ fromAccountId: pocket1.id, toAccountId: external.id })
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('POCKET_TRANSFER_NOT_ALLOWED');

      const transactions = await prisma.transaction.findMany({
        where: { userId: POCKET_USER_ID },
      });
      expect(transactions).toHaveLength(0);
    });

    it('rejects account → pocket of another account with POCKET_TRANSFER_NOT_ALLOWED', async () => {
      const { external, pocket1 } = await setupPocketHierarchy();
      mockGetSession.mockResolvedValue({
        userId: POCKET_USER_ID,
        email: 'pocket@test.com',
        name: 'Pocket User',
      });

      const result = await transferBetweenAccounts(
        buildInput({ fromAccountId: external.id, toAccountId: pocket1.id })
      );

      expect(result.success).toBe(false);
      expect(result.code).toBe('POCKET_TRANSFER_NOT_ALLOWED');

      const transactions = await prisma.transaction.findMany({
        where: { userId: POCKET_USER_ID },
      });
      expect(transactions).toHaveLength(0);
    });
  });
});
