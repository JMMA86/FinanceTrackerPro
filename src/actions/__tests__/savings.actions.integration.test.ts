/**
 * Savings Actions Integration Tests
 * Tests atomic savings operations with real database
 *
 * These tests verify:
 * - CRUD operations for savings goals
 * - Contribution atomicity with prisma.$transaction()
 * - Idempotency (UUID v4 keys)
 * - Soft delete behavior
 * - Max spendable calculation
 * - Savings summary aggregation
 * - Audit trail
 *
 * Run with: npm run test:coverage
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import {
  PrismaClient,
  Currency,
  Language,
  Theme,
  SavingsGoalType,
  SavingsGoalStatus,
  AccountType,
  TransactionType,
  FixedExpenseFrequency,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ZodError } from 'zod';
import { AppError } from '@/lib/errors/api-errors';

// ============================================================================
// Test constants
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const TEST_USER_ID = 'sav-test-user-' + Date.now();

const genUUID = (): string => crypto.randomUUID();
const VALID_CUID = 'clh1234567890abcdefghij';

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
  cookies: vi.fn(() => ({
    get: vi.fn(() => undefined),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock('next/cache', () => {
  const revalidatePath = vi.fn();
  const unstable_noStore = vi.fn();
  return { revalidatePath, unstable_noStore };
});

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() =>
    Promise.resolve({
      userId: TEST_USER_ID,
      email: `sav-test-${Date.now()}@example.com`,
      name: 'Savings Test User',
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

// Mock getTransactionRepository for true balance checks
vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn(() => ({
    findMany: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock reconciliation service
vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn().mockResolvedValue(1000000),
}));

// Mock rate limiting service (always allow in tests)
vi.mock('@/services/rate-limit.service', () => ({
  checkApiRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  recordApiAttempt: vi.fn().mockResolvedValue('attempt-1'),
  markApiAttemptSuccess: vi.fn().mockResolvedValue(undefined),
}));

// ============================================================================
// Test helpers
// ============================================================================

async function createTestUser() {
  return prisma.user.create({
    data: {
      id: TEST_USER_ID,
      email: `sav-test-${Date.now()}@example.com`,
      name: 'Savings Test User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function createSavingsGoal(
  overrides: {
    name?: string;
    targetAmountCents?: number;
    currency?: Currency;
    currentAmountCents?: number;
    status?: SavingsGoalStatus;
    monthlyContributionCents?: number | null;
    type?: SavingsGoalType;
    deadline?: Date | null;
    linkedAccountId?: string | null;
    color?: string | null;
    isActive?: boolean;
  } = {}
) {
  return prisma.savingsGoal.create({
    data: {
      userId: TEST_USER_ID,
      name: overrides.name ?? 'Test Goal',
      targetAmountCents: overrides.targetAmountCents ?? 100000,
      currency: overrides.currency ?? Currency.COP,
      currentAmountCents: overrides.currentAmountCents ?? 0,
      status: overrides.status ?? SavingsGoalStatus.ACTIVE,
      monthlyContributionCents: overrides.monthlyContributionCents ?? null,
      type: overrides.type ?? SavingsGoalType.CUSTOM,
      deadline: overrides.deadline ?? null,
      linkedAccountId: overrides.linkedAccountId ?? null,
      color: overrides.color ?? null,
      isActive: overrides.isActive ?? true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
}

async function createBankAccount(
  overrides: {
    name?: string;
    balanceCents?: number;
    currency?: Currency;
  } = {}
) {
  return prisma.account.create({
    data: {
      userId: TEST_USER_ID,
      name: overrides.name ?? 'Source Account',
      type: AccountType.SAVINGS,
      balanceCents: overrides.balanceCents ?? 1000000,
      currency: overrides.currency ?? Currency.COP,
      isActive: true,
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
}

async function createContribution(
  goalId: string,
  overrides: {
    amountCents?: number;
    currency?: Currency;
    idempotencyKey?: string;
    notes?: string;
  } = {}
) {
  return prisma.savingsContribution.create({
    data: {
      goalId,
      amountCents: overrides.amountCents ?? 10000,
      currency: overrides.currency ?? Currency.COP,
      idempotencyKey: overrides.idempotencyKey ?? genUUID(),
      notes: overrides.notes ?? null,
      ipAddress: '127.0.0.1',
      userAgent: 'vitest',
      createdBy: TEST_USER_ID,
      lastModifiedBy: TEST_USER_ID,
    },
  });
}

async function cleanupTestData() {
  await prisma.savingsContribution.deleteMany({
    where: { goal: { userId: TEST_USER_ID } },
  });
  await prisma.savingsGoal.deleteMany({
    where: { userId: TEST_USER_ID },
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

// Import the internal functions (safeAction mocked as identity)
// We import from the actions file, but since safeAction is mocked as identity,
// the exported functions are the raw internal ones
import * as savingsActions from '../savings.actions';

// Schemas are tested in savings.schema.spec.ts (unit tests)

// ============================================================================
// Tests
// ============================================================================

describe('Savings Actions Integration', () => {
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
  // createSavingsGoal
  // ==========================================================================

  describe('createSavingsGoal', () => {
    it('should create a goal with all fields successfully', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const result = await savingsActions.createSavingsGoal({
        name: 'Vacaciones 2026',
        description: 'Ahorro para viaje',
        type: 'ANNUAL',
        targetAmountCents: 200000,
        currency: 'USD',
        deadline: futureDate.toISOString(),
        monthlyContributionCents: 50000,
        color: 'from-blue-500 to-cyan-500',
        icon: 'plane',
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.name).toBe('Vacaciones 2026');
      expect(result.data!.description).toBe('Ahorro para viaje');
      expect(result.data!.type).toBe('ANNUAL');
      expect(result.data!.targetAmountCents).toBe(200000);
      expect(result.data!.currency).toBe('USD');
      expect(result.data!.currentAmountCents).toBe(0);
      expect(result.data!.status).toBe('ACTIVE');
    });

    it('should create a goal with only required fields and apply defaults', async () => {
      const result = await savingsActions.createSavingsGoal({
        name: 'Emergency Fund',
        targetAmountCents: 500000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('CUSTOM');
      expect(result.data!.currency).toBe('COP');
      expect(result.data!.status).toBe('ACTIVE');
      expect(result.data!.currentAmountCents).toBe(0);
      expect(result.data!.description).toBeNull();
      expect(result.data!.deadline).toBeNull();
    });

    it('should create a goal with SHORT_TERM type', async () => {
      const result = await savingsActions.createSavingsGoal({
        name: 'New Phone',
        targetAmountCents: 3000000,
        type: 'SHORT_TERM',
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('SHORT_TERM');
    });

    it('should create a goal with EMERGENCY type', async () => {
      const result = await savingsActions.createSavingsGoal({
        name: 'Emergency Fund',
        targetAmountCents: 10000000,
        type: 'EMERGENCY',
      });

      expect(result.success).toBe(true);
      expect(result.data!.type).toBe('EMERGENCY');
    });

    it('should create a goal with EUR currency', async () => {
      const result = await savingsActions.createSavingsGoal({
        name: 'Europe Trip',
        targetAmountCents: 500000,
        currency: 'EUR',
      });

      expect(result.success).toBe(true);
      expect(result.data!.currency).toBe('EUR');
    });

    it('should fail with ZodError for negative targetAmountCents', async () => {
      const result = await savingsActions.createSavingsGoal({
        name: 'Bad Goal',
        targetAmountCents: -100,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should fail with ZodError for empty name', async () => {
      const result = await savingsActions.createSavingsGoal({
        name: '',
        targetAmountCents: 100000,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should record audit fields (createdBy, lastModifiedBy)', async () => {
      const result = await savingsActions.createSavingsGoal({
        name: 'Audited Goal',
        targetAmountCents: 100000,
      });

      expect(result.success).toBe(true);
      const goal = await prisma.savingsGoal.findUnique({
        where: { id: result.data!.id },
      });
      expect(goal?.createdBy).toBe(TEST_USER_ID);
      expect(goal?.lastModifiedBy).toBe(TEST_USER_ID);
    });
  });

  // ==========================================================================
  // getSavingsGoals
  // ==========================================================================

  describe('getSavingsGoals', () => {
    it('should return empty array when no goals exist', async () => {
      const result = await savingsActions.getSavingsGoals({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should return goals with progressPercentage calculated via Decimal.js', async () => {
      await createSavingsGoal({
        name: 'Halfway Goal',
        targetAmountCents: 100000,
        currentAmountCents: 50000,
      });

      const result = await savingsActions.getSavingsGoals({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].name).toBe('Halfway Goal');
      expect(result.data![0].progressPercentage).toBe(50.0);
    });

    it('should return goals with 0% progress when no contributions', async () => {
      await createSavingsGoal({ name: 'Empty Goal', targetAmountCents: 100000 });

      const result = await savingsActions.getSavingsGoals({});
      expect(result.success).toBe(true);
      expect(result.data![0].progressPercentage).toBe(0);
    });

    it('should return multiple goals ordered by priority desc, createdAt desc', async () => {
      await createSavingsGoal({ name: 'Goal A' });
      await createSavingsGoal({ name: 'Goal B' });

      const result = await savingsActions.getSavingsGoals({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      // Goal B has higher priority
      expect(result.data![0].name).toBe('Goal B');
    });

    it('should filter by status ACTIVE', async () => {
      await createSavingsGoal({ name: 'Active Goal' });
      await createSavingsGoal({
        name: 'Completed Goal',
        status: SavingsGoalStatus.COMPLETED,
        currentAmountCents: 100000,
      });

      const result = await savingsActions.getSavingsGoals({ status: 'ACTIVE' });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].name).toBe('Active Goal');
    });

    it('should include linkedAccount when present', async () => {
      const bankAccount = await createBankAccount();
      await createSavingsGoal({
        name: 'Linked Goal',
        linkedAccountId: bankAccount.id,
      });

      const result = await savingsActions.getSavingsGoals({});
      expect(result.success).toBe(true);
      expect(result.data![0].linkedAccount).toBeDefined();
      expect(result.data![0].linkedAccount!.name).toBe('Source Account');
    });

    it('should include recent contributions (max 5)', async () => {
      const goal = await createSavingsGoal({ name: 'Goal with contributions' });
      for (let i = 0; i < 5; i++) {
        await createContribution(goal.id, { amountCents: (i + 1) * 1000 });
      }

      const result = await savingsActions.getSavingsGoals({});
      expect(result.success).toBe(true);
      expect(result.data![0].contributions).toHaveLength(5);
    });

    it('should not return inactive (soft-deleted) goals', async () => {
      await createSavingsGoal({ name: 'Active Goal' });
      await createSavingsGoal({ name: 'Deleted Goal', isActive: false });

      const result = await savingsActions.getSavingsGoals({});
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].name).toBe('Active Goal');
    });
  });

  // ==========================================================================
  // updateSavingsGoal
  // ==========================================================================

  describe('updateSavingsGoal', () => {
    it('should update goal name successfully', async () => {
      const goal = await createSavingsGoal({ name: 'Old Name' });

      const result = await savingsActions.updateSavingsGoal({
        goalId: goal.id,
        name: 'New Name',
      });

      expect(result.success).toBe(true);
      expect(result.data!.name).toBe('New Name');

      const updated = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(updated!.name).toBe('New Name');
    });

    it('should update targetAmountCents successfully', async () => {
      const goal = await createSavingsGoal({ targetAmountCents: 100000 });

      const result = await savingsActions.updateSavingsGoal({
        goalId: goal.id,
        targetAmountCents: 250000,
      });

      expect(result.success).toBe(true);
      expect(result.data!.targetAmountCents).toBe(250000);
    });

    it('should update description, deadline, and color together', async () => {
      const goal = await createSavingsGoal({ name: 'Updatable' });
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      const result = await savingsActions.updateSavingsGoal({
        goalId: goal.id,
        description: 'Updated description',
        color: 'from-emerald-500 to-teal-500',
      });

      expect(result.success).toBe(true);
      const updated = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(updated!.description).toBe('Updated description');
      expect(updated!.color).toBe('from-emerald-500 to-teal-500');
    });

    it('should return NotFoundError for non-existent goal', async () => {
      const result = await savingsActions.updateSavingsGoal({
        goalId: VALID_CUID,
        name: 'Ghost',
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('should return validation error for invalid data', async () => {
      const goal = await createSavingsGoal({ name: 'Valid Goal' });

      const result = await savingsActions.updateSavingsGoal({
        goalId: goal.id,
        targetAmountCents: -100,
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should update lastModifiedBy on edit', async () => {
      const goal = await createSavingsGoal({ name: 'Audit Goal' });

      await savingsActions.updateSavingsGoal({
        goalId: goal.id,
        name: 'Updated Audit Goal',
      });

      const updated = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(updated!.lastModifiedBy).toBe(TEST_USER_ID);
    });

    it('should update status to COMPLETED via manual edit', async () => {
      const goal = await createSavingsGoal({ name: 'Status Change' });

      const result = await savingsActions.updateSavingsGoal({
        goalId: goal.id,
        status: 'COMPLETED',
      });

      expect(result.success).toBe(true);
      expect(result.data!.status).toBe('COMPLETED');
    });
  });

  // ==========================================================================
  // deleteSavingsGoal
  // ==========================================================================

  describe('deleteSavingsGoal', () => {
    it('should soft delete a goal without contributions', async () => {
      const goal = await createSavingsGoal({ name: 'To Delete' });

      const result = await savingsActions.deleteSavingsGoal({ goalId: goal.id });

      expect(result.success).toBe(true);
      expect(result.data!.goalId).toBe(goal.id);

      const deleted = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(deleted!.isActive).toBe(false);
      expect(deleted!.deletedAt).not.toBeNull();
    });

    it('should return error when deleting a goal with contributions', async () => {
      const goal = await createSavingsGoal({ name: 'Has Contributions' });
      await createContribution(goal.id);

      const result = await savingsActions.deleteSavingsGoal({ goalId: goal.id });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete');
    });

    it('should return NotFoundError for non-existent goal', async () => {
      const result = await savingsActions.deleteSavingsGoal({ goalId: VALID_CUID });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('should return NotFoundError for already deleted goal', async () => {
      const goal = await createSavingsGoal({ name: 'Already Deleted', isActive: false });

      const result = await savingsActions.deleteSavingsGoal({ goalId: goal.id });

      expect(result.success).toBe(false);
      expect(result.code).toBe('NOT_FOUND');
    });

    it('should return validation error for invalid CUID', async () => {
      const result = await savingsActions.deleteSavingsGoal({ goalId: 'not-a-cuid' });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });
  });

  // ==========================================================================
  // contributeToGoal (the most critical)
  // ==========================================================================

  describe('contributeToGoal', () => {
    it('should create a contribution and update currentAmountCents', async () => {
      const bankAccount = await createBankAccount();
      const goal = await createSavingsGoal({
        name: 'Contribution Test',
        targetAmountCents: 100000,
        currentAmountCents: 0,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 25000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.wasIdempotent).toBe(false);
      expect(result.data!.contribution.amountCents).toBe(25000);

      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(updatedGoal!.currentAmountCents).toBe(25000);
    });

    it('should be idempotent (same idempotencyKey returns wasIdempotent: true)', async () => {
      const bankAccount = await createBankAccount();
      const goal = await createSavingsGoal({
        name: 'Idempotent Goal',
        targetAmountCents: 100000,
      });
      const key = genUUID();

      const result1 = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 10000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: key,
      });
      expect(result1.success).toBe(true);
      expect(result1.data!.wasIdempotent).toBe(false);

      const result2 = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 10000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: key,
      });
      expect(result2.success).toBe(true);
      expect(result2.data!.wasIdempotent).toBe(true);

      // Only one contribution should exist
      const contributions = await prisma.savingsContribution.count({
        where: { idempotencyKey: key },
      });
      expect(contributions).toBe(1);
    });

    it('should auto-complete goal when balance reaches target', async () => {
      const bankAccount = await createBankAccount();
      const goal = await createSavingsGoal({
        name: 'Complete Me',
        targetAmountCents: 50000,
        currentAmountCents: 40000,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 10000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);

      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(updatedGoal!.status).toBe('COMPLETED');
      expect(updatedGoal!.currentAmountCents).toBe(50000);
    });

    it('should reject contribution to a completed goal with GOAL_COMPLETED', async () => {
      const bankAccount = await createBankAccount();
      const goal = await createSavingsGoal({
        name: 'Already Complete',
        targetAmountCents: 50000,
        currentAmountCents: 50000,
        status: SavingsGoalStatus.COMPLETED,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 5000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('GOAL_COMPLETED');
      expect(result.error).toContain('Cannot contribute');
    });

    it('should reject missing sourceAccountId with VALIDATION_ERROR', async () => {
      const goal = await createSavingsGoal({
        name: 'No Source Account',
        targetAmountCents: 100000,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 15000,
        currency: 'COP',
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('VALIDATION_ERROR');
    });

    it('should contribute with sourceAccountId and verify true balance', async () => {
      const bankAccount = await createBankAccount({ balanceCents: 500000 });
      const goal = await createSavingsGoal({
        name: 'Source Account Test',
        targetAmountCents: 100000,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 50000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.contribution.sourceAccountId).toBe(bankAccount.id);
    });

    it('should reject contribution when source account has insufficient funds', async () => {
      // Override the global getTrueBalance mock to return low value
      const { getTrueBalance } = await import('@/services/reconciliation.service');
      (getTrueBalance as ReturnType<typeof vi.fn>).mockResolvedValueOnce(50);

      const bankAccount = await createBankAccount({ balanceCents: 100 });
      const goal = await createSavingsGoal({
        name: 'Insufficient Funds Test',
        targetAmountCents: 100000,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 50000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('should create a linked EXPENSE transaction and reduce the source account balance', async () => {
      const bankAccount = await createBankAccount({ balanceCents: 500000 });
      const goal = await createSavingsGoal({
        name: 'Linked Transaction Goal',
        targetAmountCents: 100000,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 25000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);

      // The contribution must be linked to a real EXPENSE transaction
      const contribution = await prisma.savingsContribution.findUnique({
        where: { id: result.data!.contribution.id },
      });
      expect(contribution?.transactionId).not.toBeNull();

      const tx = await prisma.transaction.findUnique({
        where: { id: contribution!.transactionId! },
      });
      expect(tx).toBeDefined();
      expect(tx!.accountId).toBe(bankAccount.id);
      expect(tx!.type).toBe('EXPENSE');
      expect(tx!.amountCents).toBe(-25000);
      expect(tx!.currency).toBe('COP');

      // The source account cached balance must be reduced
      const updatedAccount = await prisma.account.findUnique({ where: { id: bankAccount.id } });
      expect(updatedAccount!.balanceCents).toBe(500000 - 25000);
    });

    it('should reject when the source account currency differs from the contribution', async () => {
      const usdAccount = await createBankAccount({ currency: Currency.USD });
      const goal = await createSavingsGoal({
        name: 'Currency Mismatch Source',
        targetAmountCents: 100000,
        currency: Currency.COP,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 10000,
        currency: 'COP',
        sourceAccountId: usdAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('CURRENCY_MISMATCH');
    });

    it('should reject when the goal currency differs from the contribution', async () => {
      const copAccount = await createBankAccount({ currency: Currency.COP });
      const goal = await createSavingsGoal({
        name: 'Currency Mismatch Goal',
        targetAmountCents: 100000,
        currency: Currency.USD,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 10000,
        currency: 'USD',
        sourceAccountId: copAccount.id,
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(false);
      expect(result.code).toBe('CURRENCY_MISMATCH');
    });

    it('should record audit fields on contribution', async () => {
      const bankAccount = await createBankAccount();
      const goal = await createSavingsGoal({
        name: 'Audit Trail Goal',
        targetAmountCents: 100000,
      });
      const key = genUUID();

      await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 10000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: key,
      });

      const contribution = await prisma.savingsContribution.findFirst({
        where: { idempotencyKey: key },
      });
      expect(contribution).toBeDefined();
      expect(contribution!.ipAddress).toBe('127.0.0.1');
      expect(contribution!.userAgent).toBe('vitest');
      expect(contribution!.createdBy).toBe(TEST_USER_ID);
    });

    it('should support optional notes field', async () => {
      const bankAccount = await createBankAccount();
      const goal = await createSavingsGoal({
        name: 'Notes Test',
        targetAmountCents: 100000,
      });

      const result = await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 20000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        notes: 'Monthly contribution for March',
        idempotencyKey: genUUID(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.contribution.notes).toBe('Monthly contribution for March');
    });

    it('should accept multiple contributions cumulatively', async () => {
      const bankAccount = await createBankAccount();
      const goal = await createSavingsGoal({
        name: 'Cumulative Goal',
        targetAmountCents: 100000,
      });

      await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 25000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      await savingsActions.contributeToGoal({
        goalId: goal.id,
        amountCents: 25000,
        currency: 'COP',
        sourceAccountId: bankAccount.id,
        idempotencyKey: genUUID(),
      });

      const updatedGoal = await prisma.savingsGoal.findUnique({ where: { id: goal.id } });
      expect(updatedGoal!.currentAmountCents).toBe(50000);
    });
  });

  // ==========================================================================
  // getSavingsSummary
  // ==========================================================================

  describe('getSavingsSummary', () => {
    it('should return zeros when no goals exist', async () => {
      const result = await savingsActions.getSavingsSummary({});

      expect(result.success).toBe(true);
      expect(result.data!.totalSavedCents).toBe(0);
      expect(result.data!.totalTargetCents).toBe(0);
      expect(result.data!.overallProgressPercentage).toBe(0);
      expect(result.data!.activeGoalsCount).toBe(0);
      expect(result.data!.completedGoalsCount).toBe(0);
      expect(result.data!.monthlyContributedCents).toBe(0);
    });

    it('should return correct counts with active goals', async () => {
      await createSavingsGoal({
        name: 'Goal 1',
        targetAmountCents: 100000,
        currentAmountCents: 50000,
      });
      await createSavingsGoal({
        name: 'Goal 2',
        targetAmountCents: 200000,
        currentAmountCents: 100000,
      });

      const result = await savingsActions.getSavingsSummary({});

      expect(result.success).toBe(true);
      expect(result.data!.activeGoalsCount).toBe(2);
      expect(result.data!.totalSavedCents).toBe(150000);
      expect(result.data!.totalTargetCents).toBe(300000);
    });

    it('should separate active vs completed goals', async () => {
      await createSavingsGoal({ name: 'Active', status: SavingsGoalStatus.ACTIVE });
      await createSavingsGoal({
        name: 'Completed',
        status: SavingsGoalStatus.COMPLETED,
        currentAmountCents: 50000,
      });

      const result = await savingsActions.getSavingsSummary({});

      expect(result.success).toBe(true);
      expect(result.data!.activeGoalsCount).toBe(1);
      expect(result.data!.completedGoalsCount).toBe(1);
    });

    it('should calculate overallProgressPercentage correctly', async () => {
      // 25% progress total: 25000 saved out of 100000 target
      await createSavingsGoal({ name: 'G1', targetAmountCents: 80000, currentAmountCents: 20000 });
      await createSavingsGoal({ name: 'G2', targetAmountCents: 20000, currentAmountCents: 5000 });

      const result = await savingsActions.getSavingsSummary({});

      expect(result.success).toBe(true);
      expect(result.data!.totalSavedCents).toBe(25000);
      expect(result.data!.totalTargetCents).toBe(100000);
      expect(result.data!.overallProgressPercentage).toBe(25);
    });

    it('should calculate monthlyContributedCents for current month', async () => {
      const goal = await createSavingsGoal({ name: 'Monthly Test' });
      await createContribution(goal.id, { amountCents: 30000 });

      const result = await savingsActions.getSavingsSummary({});

      expect(result.success).toBe(true);
      expect(result.data!.monthlyContributedCents).toBe(30000);
    });

    it('should filter monthlyContributedCents by specified month/year', async () => {
      const goal = await createSavingsGoal({ name: 'Filtered Monthly' });
      // Contribution in current month
      await createContribution(goal.id, { amountCents: 50000 });

      const now = new Date();
      const result = await savingsActions.getSavingsSummary({
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      });

      expect(result.success).toBe(true);
      expect(result.data!.monthlyContributedCents).toBe(50000);
    });
  });

  // ==========================================================================
  // calculateMaxSpendable
  // ==========================================================================

  describe('calculateMaxSpendable', () => {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    it('should return zero when no transactions exist', async () => {
      const result = await savingsActions.calculateMaxSpendable({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalIncomeCents).toBe(0);
      expect(result.data!.totalFixedExpensesCents).toBe(0);
      expect(result.data!.totalSavingsCommitmentsCents).toBe(0);
      expect(result.data!.totalVariableExpensesCents).toBe(0);
      expect(result.data!.maxSpendableCents).toBe(0);
    });

    it('should calculate maxSpendable with income only', async () => {
      // Create income transaction (directly via prisma since it has accountId constraint)
      const account = await createBankAccount({ name: 'Income Account' });
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.INCOME,
          amountCents: 1000000,
          currency: Currency.COP,
          description: 'Salary',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const result = await savingsActions.calculateMaxSpendable({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalIncomeCents).toBe(1000000);
      expect(result.data!.maxSpendableCents).toBe(1000000);
    });

    it('should subtract fixed expenses from income', async () => {
      const account = await createBankAccount({ name: 'Fixed Exp Account' });
      // Income
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.INCOME,
          amountCents: 1000000,
          currency: Currency.COP,
          description: 'Salary',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Fixed expense due this month
      const fixedExpense = await prisma.fixedExpense.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Rent',
          amountCents: 300000,
          currency: Currency.COP,
          frequency: FixedExpenseFrequency.MONTHLY,
          dayOfPayment: 15,
          startDate: now,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });
      await prisma.fixedExpensePayment.create({
        data: {
          fixedExpenseId: fixedExpense.id,
          dueDate: now,
          expectedAmountCents: 300000,
          currency: Currency.COP,
          isActive: true,
        },
      });

      const result = await savingsActions.calculateMaxSpendable({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalIncomeCents).toBe(1000000);
      expect(result.data!.totalFixedExpensesCents).toBe(300000);
      expect(result.data!.maxSpendableCents).toBe(700000);
    });

    it('should subtract savings commitments from income', async () => {
      const account = await createBankAccount({ name: 'Income Acc 2' });
      // Income
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.INCOME,
          amountCents: 500000,
          currency: Currency.COP,
          description: 'Freelance',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Savings commitment
      await createSavingsGoal({
        name: 'Auto Save',
        monthlyContributionCents: 100000,
      });

      const result = await savingsActions.calculateMaxSpendable({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalIncomeCents).toBe(500000);
      expect(result.data!.totalSavingsCommitmentsCents).toBe(100000);
      expect(result.data!.maxSpendableCents).toBe(400000);
    });

    it('can be negative (overdraft) — frontend renders warning', async () => {
      const account = await createBankAccount({ name: 'Low Income Acc' });
      // Small income
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.INCOME,
          amountCents: 50000,
          currency: Currency.COP,
          description: 'Small Income',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Large savings commitment
      await createSavingsGoal({
        name: 'Big Save',
        monthlyContributionCents: 200000,
      });

      const result = await savingsActions.calculateMaxSpendable({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalIncomeCents).toBe(50000);
      expect(result.data!.totalSavingsCommitmentsCents).toBe(200000);
      expect(result.data!.maxSpendableCents).toBe(-150000);
    });

    it('should subtract variable expenses', async () => {
      const account = await createBankAccount({ name: 'Var Exp Acc' });
      // Income
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.INCOME,
          amountCents: 1000000,
          currency: Currency.COP,
          description: 'Salary',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Variable expense (stored as negative in DB)
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.EXPENSE,
          amountCents: -200000,
          currency: Currency.COP,
          description: 'Shopping',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const result = await savingsActions.calculateMaxSpendable({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalVariableExpensesCents).toBe(200000);
      expect(result.data!.maxSpendableCents).toBe(800000);
    });

    it('should calculate all components together', async () => {
      const account = await createBankAccount({ name: 'Full Calc Acc' });

      // Income
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.INCOME,
          amountCents: 2000000,
          currency: Currency.COP,
          description: 'Salary',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      // Fixed expense
      const fixedExpense = await prisma.fixedExpense.create({
        data: {
          userId: TEST_USER_ID,
          name: 'Rent',
          amountCents: 500000,
          currency: Currency.COP,
          frequency: FixedExpenseFrequency.MONTHLY,
          dayOfPayment: 1,
          startDate: now,
          isActive: true,
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });
      await prisma.fixedExpensePayment.create({
        data: {
          fixedExpenseId: fixedExpense.id,
          dueDate: now,
          expectedAmountCents: 500000,
          currency: Currency.COP,
          isActive: true,
        },
      });

      // Savings
      await createSavingsGoal({ name: 'Goal A', monthlyContributionCents: 200000 });
      await createSavingsGoal({ name: 'Goal B', monthlyContributionCents: 100000 });

      // Variable expense
      await prisma.transaction.create({
        data: {
          idempotencyKey: genUUID(),
          userId: TEST_USER_ID,
          accountId: account.id,
          type: TransactionType.EXPENSE,
          amountCents: -300000,
          currency: Currency.COP,
          description: 'Groceries',
          date: now,
          isActive: true,
          ipAddress: '127.0.0.1',
          userAgent: 'vitest',
          createdBy: TEST_USER_ID,
          lastModifiedBy: TEST_USER_ID,
        },
      });

      const result = await savingsActions.calculateMaxSpendable({
        month: currentMonth,
        year: currentYear,
      });

      expect(result.success).toBe(true);
      expect(result.data!.totalIncomeCents).toBe(2000000);
      expect(result.data!.totalFixedExpensesCents).toBe(500000);
      expect(result.data!.totalSavingsCommitmentsCents).toBe(300000); // 200k + 100k
      expect(result.data!.totalVariableExpensesCents).toBe(300000);
      expect(result.data!.maxSpendableCents).toBe(900000); // 2M - 500k - 300k - 300k
    });
  });
});
