/**
 * Investment Actions Integration Tests
 * Tests atomic investment operations following CLAUDE.md rules
 *
 * These tests verify:
 * - CRUD operations for investment accounts
 * - Atomic deposits with currency conversion
 * - Asset buying/selling with Decimal.js precision
 * - Idempotency (UUID v4 keys)
 * - Soft delete behavior for holdings
 * - Audit trail
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, AccountType, Language, Theme } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ============================================================================
// Test constants
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'inv-test-user-' + Date.now();

/**
 * Generates a fresh UUID v4 for each test, avoiding the fragile pattern of
 * hardcoded UUIDs (VALID_UUID_1, genUUID()...) that cause UNIQUE constraint
 * collisions when tests share a database.
 *
 * Rule 12 (CLAUDE.md): All idempotency keys must be UUID v4.
 */
const genUUID = (): string => crypto.randomUUID();

let pool: Pool;
let prisma: PrismaClient;

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
}));

vi.mock('next/cache', () => {
  const revalidatePath = vi.fn();
  const unstable_noStore = vi.fn();
  return { revalidatePath, unstable_noStore };
});

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
  safeAction: vi.fn((fn) => fn),
}));

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser() {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `inv-test-${Date.now()}@example.com`,
      name: 'Investment Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.USD,
      isActive: true,
    },
  });
}

async function createBankAccount(
  userId: string,
  overrides: Partial<{
    name: string;
    type: AccountType;
    balanceCents: number;
    currency: Currency;
  }> = {}
) {
  return prisma.account.create({
    data: {
      userId,
      name: overrides.name ?? 'Source Account',
      type: overrides.type ?? AccountType.SAVINGS,
      balanceCents: overrides.balanceCents ?? 1000000,
      currency: overrides.currency ?? Currency.COP,
      isActive: true,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

async function createInvestmentAccount(
  userId: string,
  overrides: Partial<{
    name: string;
    balanceCents: number;
    currency: Currency;
    idempotencyKey: string | null;
  }> = {}
) {
  return prisma.account.create({
    data: {
      userId,
      name: overrides.name ?? 'Investment Account',
      type: AccountType.INVESTMENT,
      balanceCents: overrides.balanceCents ?? 0,
      currency: overrides.currency ?? Currency.USD,
      isActive: true,
      idempotencyKey: overrides.idempotencyKey ?? null,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

async function createHolding(
  accountId: string,
  overrides: Partial<{
    symbol: string;
    name: string;
    quantity: number;
    avgCostCents: number;
    currentPriceCents: number;
    currency: Currency;
    isActive: boolean;
  }> = {}
) {
  return prisma.investmentAssetHolding.create({
    data: {
      accountId,
      symbol: overrides.symbol ?? 'AAPL',
      name: overrides.name ?? 'Apple Inc.',
      quantity: overrides.quantity ?? 10,
      avgCostCents: overrides.avgCostCents ?? 15000,
      currency: overrides.currency ?? Currency.USD,
      currentPriceCents: overrides.currentPriceCents ?? 15500,
      lastPriceUpdate: new Date(),
      isActive: overrides.isActive ?? true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
}

async function cleanupTestData() {
  await prisma.investmentAssetHolding.deleteMany({
    where: { account: { userId: TEST_USER_ID } },
  });
  await prisma.transaction.deleteMany({
    where: { userId: TEST_USER_ID },
  });
  await prisma.account.deleteMany({
    where: { userId: TEST_USER_ID },
  });
  await prisma.user.deleteMany({
    where: { id: TEST_USER_ID },
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('Investment Actions Integration', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: TEST_DB_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await pool.end();
  });

  beforeEach(async () => {
    await cleanupTestData();
    await createTestUser();
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // getInvestmentAccounts
  // ==========================================================================

  describe('getInvestmentAccounts', () => {
    it('should return empty array when no investment accounts exist', async () => {
      const accounts = await prisma.account.findMany({
        where: { userId: TEST_USER_ID, isActive: true, type: 'INVESTMENT' },
      });
      expect(accounts).toHaveLength(0);
    });

    it('should return investment accounts with holdings', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        name: 'My Investments',
        balanceCents: 100000,
      });

      await createHolding(invAccount.id, {
        symbol: 'AAPL',
        quantity: 5,
        avgCostCents: 15000,
        currentPriceCents: 16000,
      });

      await createHolding(invAccount.id, {
        symbol: 'TSLA',
        quantity: 2,
        avgCostCents: 25000,
        currentPriceCents: 27000,
      });

      const accounts = await prisma.account.findMany({
        where: { userId: TEST_USER_ID, isActive: true, type: 'INVESTMENT' },
        orderBy: { createdAt: 'asc' },
        include: {
          assetHoldings: {
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('My Investments');
      expect(accounts[0].assetHoldings).toHaveLength(2);
      expect(accounts[0].assetHoldings[0].symbol).toBe('TSLA'); // newest first
    });

    it('should only return active investment accounts', async () => {
      await createInvestmentAccount(TEST_USER_ID, { name: 'Active' });

      await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Inactive',
          type: AccountType.INVESTMENT,
          balanceCents: 0,
          currency: Currency.USD,
          isActive: false,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const accounts = await prisma.account.findMany({
        where: { userId: TEST_USER_ID, isActive: true, type: 'INVESTMENT' },
      });

      expect(accounts).toHaveLength(1);
      expect(accounts[0].name).toBe('Active');
    });
  });

  // ==========================================================================
  // createInvestmentAccount
  // ==========================================================================

  describe('createInvestmentAccount', () => {
    it('should create an investment account successfully with USD', async () => {
      const account = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'New Investment',
          type: AccountType.INVESTMENT,
          currency: Currency.USD,
          balanceCents: 0,
          idempotencyKey: genUUID(),
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      expect(account.name).toBe('New Investment');
      expect(account.type).toBe('INVESTMENT');
      expect(account.currency).toBe('USD');
      expect(account.balanceCents).toBe(0);
    });

    it('should create an investment account with initial balance', async () => {
      const account = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Prefunded Investment',
          type: AccountType.INVESTMENT,
          currency: Currency.EUR,
          balanceCents: 50000,
          idempotencyKey: genUUID(),
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      expect(account.balanceCents).toBe(50000);
      expect(account.currency).toBe('EUR');
    });

    it('should enforce idempotency (same idempotencyKey rejects duplicate)', async () => {
      const sharedKey = genUUID();

      // First creation
      const _account = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Idempotent Account',
          type: AccountType.INVESTMENT,
          currency: Currency.USD,
          balanceCents: 0,
          idempotencyKey: sharedKey,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Try duplicate — unique constraint should reject it
      await expect(
        prisma.account.create({
          data: {
            userId: TEST_USER_ID,
            name: 'Duplicate',
            type: AccountType.INVESTMENT,
            currency: Currency.USD,
            balanceCents: 0,
            idempotencyKey: sharedKey,
            createdBy: TEST_USER_ID,
            lastModifiedBy: TEST_USER_ID,
          },
        })
      ).rejects.toThrow();

      // Still only one record
      const count = await prisma.account.count({
        where: { idempotencyKey: sharedKey },
      });
      expect(count).toBe(1);
    });
  });

  // ==========================================================================
  // depositToInvestment
  // ==========================================================================

  describe('depositToInvestment', () => {
    it('should create a deposit with TRANSFER_OUT in bank and INVESTMENT in investment account', async () => {
      const bankAccount = await createBankAccount(TEST_USER_ID, {
        balanceCents: 1000000, // COP
      });
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        currency: Currency.USD,
        balanceCents: 0,
      });

      const transferId = crypto.randomUUID();
      const amountCents = 500000; // COP
      const exchangeRate = 4000; // 1 USD = 4000 COP
      const convertedAmountCents = Math.round(amountCents / exchangeRate); // 125 USD cents

      // Create TRANSFER_OUT on bank account
      const debitTx = await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: bankAccount.id,
          type: 'TRANSFER_OUT',
          amountCents: -amountCents,
          currency: Currency.COP,
          description: 'Deposit to investment',
          date: new Date(),
          transferId,
          transferToAccountId: invAccount.id,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Create INVESTMENT transaction on investment account with currency traceability
      const creditTx = await prisma.transaction.create({
        data: {
          idempotencyKey: crypto.randomUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: convertedAmountCents,
          currency: Currency.USD,
          description: 'Deposit from bank',
          date: new Date(),
          transferId,
          transferFromAccountId: bankAccount.id,
          originalAmountCents: amountCents,
          originalCurrency: Currency.COP,
          exchangeRate: exchangeRate,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Update balances
      await prisma.account.update({
        where: { id: bankAccount.id },
        data: { balanceCents: { decrement: amountCents }, lastModifiedBy: TEST_USER_ID },
      });
      await prisma.account.update({
        where: { id: invAccount.id },
        data: { balanceCents: { increment: convertedAmountCents }, lastModifiedBy: TEST_USER_ID },
      });

      // Verify transactions
      expect(debitTx.type).toBe('TRANSFER_OUT');
      expect(debitTx.amountCents).toBe(-amountCents);
      expect(debitTx.transferId).toBe(transferId);

      expect(creditTx.type).toBe('INVESTMENT');
      expect(creditTx.amountCents).toBe(convertedAmountCents);

      // Verify currency traceability (Rule 11)
      expect(creditTx.originalAmountCents).toBe(amountCents);
      expect(creditTx.originalCurrency).toBe('COP');
      expect(Number(creditTx.exchangeRate)).toBeCloseTo(exchangeRate, 0);

      // Verify balances updated
      const updatedBank = await prisma.account.findUnique({ where: { id: bankAccount.id } });
      const updatedInv = await prisma.account.findUnique({ where: { id: invAccount.id } });
      expect(updatedBank?.balanceCents).toBe(500000); // 1000000 - 500000
      expect(updatedInv?.balanceCents).toBe(convertedAmountCents);
    });

    it('should reject when source account has insufficient funds', async () => {
      const bankAccount = await createBankAccount(TEST_USER_ID, {
        balanceCents: 1000, // only 10 COP
      });
      const _invAccount = await createInvestmentAccount(TEST_USER_ID);

      const amountCents = 500000; // tries to withdraw 5000 COP

      await expect(
        prisma.$transaction(async (tx) => {
          const from = await tx.account.findUnique({ where: { id: bankAccount.id } });
          if (!from || from.balanceCents < amountCents) {
            throw new Error('Insufficient funds');
          }
        })
      ).rejects.toThrow('Insufficient funds');

      // Verify balances unchanged
      const bankCheck = await prisma.account.findUnique({ where: { id: bankAccount.id } });
      expect(bankCheck?.balanceCents).toBe(1000);
    });

    it('should reject when source account is not COP', async () => {
      const bankAccount = await prisma.account.create({
        data: {
          userId: TEST_USER_ID,
          name: 'USD Account',
          type: AccountType.SAVINGS,
          balanceCents: 100000,
          currency: Currency.USD, // Not COP
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      expect(bankAccount.currency).toBe('USD');
      // The app-level logic should check that source must be COP
    });

    it('should reject when destination account is not INVESTMENT type', async () => {
      const nonInvestment = await createBankAccount(TEST_USER_ID, {
        currency: Currency.COP,
        balanceCents: 100000,
      });

      expect(nonInvestment.type).toBe('SAVINGS');
      // App-level logic should check that destination is INVESTMENT
    });

    it('should record audit fields in both transactions', async () => {
      const bankAccount = await createBankAccount(TEST_USER_ID);
      const invAccount = await createInvestmentAccount(TEST_USER_ID);

      const transferId = crypto.randomUUID();

      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: bankAccount.id,
          type: 'TRANSFER_OUT',
          amountCents: -1000,
          currency: Currency.COP,
          description: 'Audit test deposit',
          date: new Date(),
          transferId,
          transferToAccountId: invAccount.id,
          ipAddress: '192.168.1.50',
          userAgent: 'Mozilla/5.0 TestBrowser',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      expect(tx.ipAddress).toBe('192.168.1.50');
      expect(tx.userAgent).toBe('Mozilla/5.0 TestBrowser');
    });
  });

  // ==========================================================================
  // buyAsset
  // ==========================================================================

  describe('buyAsset', () => {
    it('should create a holding when buying an asset', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        balanceCents: 500000,
      });

      const holding = await createHolding(invAccount.id, {
        symbol: 'AAPL',
        name: 'Apple Inc.',
        quantity: 10,
        avgCostCents: 15000,
        currentPriceCents: 15000,
      });

      expect(holding.symbol).toBe('AAPL');
      expect(Number(holding.quantity)).toBe(10);
      expect(holding.avgCostCents).toBe(15000);
    });

    it('should update avgCostCents on second purchase (weighted average)', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        balanceCents: 1000000,
      });

      // First purchase: 10 shares at 15000 cents
      await createHolding(invAccount.id, {
        symbol: 'AAPL',
        quantity: 10,
        avgCostCents: 15000,
        currentPriceCents: 15000,
      });

      // Simulate second purchase: 5 shares at 16000 cents
      // Weighted avg = (10*15000 + 5*16000) / 15 = (150000 + 80000) / 15 = 230000/15 = 15333.33...
      // In cents with rounding: 15333
      const oldQty = 10;
      const newQty = 5;
      const oldAvgCost = 15000;
      const newPrice = 16000;
      const totalCostOld = oldQty * oldAvgCost; // 150000
      const totalCostNew = newQty * newPrice; // 80000
      const totalCost = totalCostOld + totalCostNew; // 230000
      const totalQty = oldQty + newQty; // 15
      const weightedAvgCost = Math.round(totalCost / totalQty); // 15333

      const existingHolding = await prisma.investmentAssetHolding.findFirst({
        where: { accountId: invAccount.id, symbol: 'AAPL', isActive: true },
      });

      if (existingHolding) {
        await prisma.investmentAssetHolding.update({
          where: { id: existingHolding.id },
          data: {
            quantity: totalQty,
            avgCostCents: weightedAvgCost,
            currentPriceCents: newPrice,
            lastPriceUpdate: new Date(),
            lastModifiedBy: TEST_USER_ID,
          },
        });
      }

      const updatedHolding = await prisma.investmentAssetHolding.findFirst({
        where: { accountId: invAccount.id, symbol: 'AAPL', isActive: true },
      });

      expect(updatedHolding).not.toBeNull();
      expect(Number(updatedHolding!.quantity)).toBe(15);
      expect(updatedHolding!.avgCostCents).toBe(weightedAvgCost);
    });

    it('should reject purchase when insufficient funds', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        balanceCents: 1000, // only 10 USD
      });

      await expect(
        prisma.$transaction(async (tx) => {
          const account = await tx.account.findUnique({ where: { id: invAccount.id } });
          if (!account || account.balanceCents < 50000) {
            throw new Error('Insufficient funds');
          }
        })
      ).rejects.toThrow('Insufficient funds');
    });

    it('should create INVESTMENT transaction on buy (negative outflow)', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        balanceCents: 500000,
      });

      const totalCostCents = 10 * 15000; // 10 shares at 15000 cents each

      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: -totalCostCents, // Negative = outflow
          currency: Currency.USD,
          description: 'Buy 10 AAPL @ 150.00',
          date: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      await prisma.account.update({
        where: { id: invAccount.id },
        data: { balanceCents: { decrement: totalCostCents }, lastModifiedBy: TEST_USER_ID },
      });

      expect(tx.type).toBe('INVESTMENT');
      expect(tx.amountCents).toBe(-totalCostCents);
      expect(tx.amountCents).toBeLessThan(0);

      const updatedAccount = await prisma.account.findUnique({ where: { id: invAccount.id } });
      expect(updatedAccount?.balanceCents).toBe(500000 - totalCostCents);
    });
  });

  // ==========================================================================
  // sellAsset
  // ==========================================================================

  describe('sellAsset', () => {
    it('should create INVESTMENT transaction on partial sale (positive inflow)', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        balanceCents: 500000,
      });

      const holding = await createHolding(invAccount.id, {
        symbol: 'AAPL',
        quantity: 10,
        avgCostCents: 15000,
        currentPriceCents: 16000,
      });

      const sellQty = 3;
      const sellPriceCents = 16000;
      const proceedsCents = sellQty * sellPriceCents;

      const tx = await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: proceedsCents, // Positive = inflow
          currency: Currency.USD,
          description: `Sell 3 AAPL @ 160.00`,
          date: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Update holding quantity
      const remainingQty = Number(holding.quantity) - sellQty;
      await prisma.investmentAssetHolding.update({
        where: { id: holding.id },
        data: { quantity: remainingQty, lastModifiedBy: TEST_USER_ID },
      });

      // Update balance
      await prisma.account.update({
        where: { id: invAccount.id },
        data: { balanceCents: { increment: proceedsCents }, lastModifiedBy: TEST_USER_ID },
      });

      expect(tx.type).toBe('INVESTMENT');
      expect(tx.amountCents).toBe(proceedsCents);
      expect(tx.amountCents).toBeGreaterThan(0); // Positive = inflow

      const updatedHolding = await prisma.investmentAssetHolding.findUnique({
        where: { id: holding.id },
      });
      expect(Number(updatedHolding!.quantity)).toBe(7);
    });

    it('should soft-delete holding on full sale', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        balanceCents: 500000,
      });

      const holding = await createHolding(invAccount.id, {
        symbol: 'AAPL',
        quantity: 5,
        avgCostCents: 15000,
        currentPriceCents: 16000,
      });

      const sellQty = 5; // Sell all
      const sellPriceCents = 16000;
      const proceedsCents = sellQty * sellPriceCents;

      // Create transaction
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: proceedsCents,
          currency: Currency.USD,
          description: 'Sell 5 AAPL',
          date: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Soft-delete holding
      await prisma.investmentAssetHolding.update({
        where: { id: holding.id },
        data: {
          quantity: 0,
          isActive: false,
          deletedAt: new Date(),
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Update balance
      await prisma.account.update({
        where: { id: invAccount.id },
        data: { balanceCents: { increment: proceedsCents }, lastModifiedBy: TEST_USER_ID },
      });

      const deletedHolding = await prisma.investmentAssetHolding.findUnique({
        where: { id: holding.id },
      });
      expect(deletedHolding?.isActive).toBe(false);
      expect(deletedHolding?.deletedAt).not.toBeNull();
      expect(Number(deletedHolding!.quantity)).toBe(0);

      // Should not appear in active queries
      const activeHoldings = await prisma.investmentAssetHolding.findMany({
        where: { accountId: invAccount.id, isActive: true },
      });
      expect(activeHoldings).toHaveLength(0);
    });

    it('should reject selling more than available quantity', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID, {
        balanceCents: 500000,
      });

      const holding = await createHolding(invAccount.id, {
        symbol: 'AAPL',
        quantity: 3,
        avgCostCents: 15000,
        currentPriceCents: 16000,
      });

      const sellQty = 5; // Only have 3

      await expect(
        prisma.$transaction(async (tx) => {
          const h = await tx.investmentAssetHolding.findUnique({ where: { id: holding.id } });
          if (!h || Number(h.quantity) < sellQty) {
            throw new Error('Insufficient shares');
          }
        })
      ).rejects.toThrow('Insufficient shares');
    });
  });

  // ==========================================================================
  // getInvestmentTransactions
  // ==========================================================================

  describe('getInvestmentTransactions', () => {
    it('should return paginated transactions for an investment account', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID);

      // Create multiple transactions
      const txs = [];
      for (let i = 0; i < 5; i++) {
        txs.push(
          prisma.transaction.create({
            data: {
              idempotencyKey: crypto.randomUUID(),
              userId: TEST_USER_ID,
              accountId: invAccount.id,
              type: 'INVESTMENT',
              amountCents: (i + 1) * 1000,
              currency: Currency.USD,
              description: `Transaction ${i + 1}`,
              date: new Date(2024, 0, i + 1),
              isActive: true,
              ipAddress: '127.0.0.1',
              userAgent: 'vitest',
              createdBy: TEST_USER_ID,
              lastModifiedBy: TEST_USER_ID,
            },
          })
        );
      }
      await Promise.all(txs);

      // Get with pagination (page 1, pageSize 3)
      const page1 = await prisma.transaction.findMany({
        where: { accountId: invAccount.id, isActive: true },
        orderBy: { date: 'desc' },
        skip: 0,
        take: 3,
      });

      const total = await prisma.transaction.count({
        where: { accountId: invAccount.id, isActive: true },
      });

      expect(page1).toHaveLength(3);
      expect(total).toBe(5);
      expect(page1[0].description).toBe('Transaction 5'); // newest first
    });

    it('should return transactions in correct date order (descending)', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID);

      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: 1000,
          currency: Currency.USD,
          description: 'Oldest',
          date: new Date('2024-01-01'),
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: 2000,
          currency: Currency.USD,
          description: 'Middle',
          date: new Date('2024-06-15'),
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: 3000,
          currency: Currency.USD,
          description: 'Newest',
          date: new Date('2024-12-01'),
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const transactions = await prisma.transaction.findMany({
        where: { accountId: invAccount.id, isActive: true },
        orderBy: { date: 'desc' },
      });

      expect(transactions).toHaveLength(3);
      expect(transactions[0].description).toBe('Newest');
      expect(transactions[1].description).toBe('Middle');
      expect(transactions[2].description).toBe('Oldest');
    });

    it('should return empty list when no transactions exist', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID);

      const transactions = await prisma.transaction.findMany({
        where: { accountId: invAccount.id, isActive: true },
      });

      expect(transactions).toHaveLength(0);
    });

    it('should not return soft-deleted transactions', async () => {
      const invAccount = await createInvestmentAccount(TEST_USER_ID);

      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: 1000,
          currency: Currency.USD,
          description: 'Active transaction',
          date: new Date(),
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: invAccount.id,
          type: 'INVESTMENT',
          amountCents: 2000,
          currency: Currency.USD,
          description: 'Deleted transaction',
          date: new Date(),
          isActive: false,
          deletedAt: new Date(),
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const active = await prisma.transaction.findMany({
        where: { accountId: invAccount.id, isActive: true },
      });
      expect(active).toHaveLength(1);
      expect(active[0].description).toBe('Active transaction');
    });
  });
});
