/**
 * @vitest-environment node
 *
 * Salary & projection Server Actions integration tests.
 *
 * Runs against the dedicated test database (port 5434 via `vitest.db-setup.ts`)
 * and exercises the REAL `safeAction` envelope so error codes are asserted too:
 * - upsert of the salary configuration + ATOMIC bonus synchronization (Rule 3);
 * - complete-set semantics with SOFT delete / reactivation of bonuses (Rules 4/6);
 * - ownership enforcement with full transaction rollback on a forged bonus id;
 * - projection settings upsert (COP-only monthly target);
 * - salary prefill (amount + system SALARY category lookup by type);
 * - audit trail (createdBy/lastModifiedBy/ipAddress/userAgent, Rule 14).
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient, Currency, Language, Theme, VariableExpenseCategory } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// ============================================================================
// Mocks for server-only dependencies
// ============================================================================

const sessionRef = vi.hoisted(() => ({ userId: '' }));

vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(() =>
    Promise.resolve(
      sessionRef.userId
        ? { userId: sessionRef.userId, email: `${sessionRef.userId}@example.com`, name: 'Test' }
        : null
    )
  ),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: (key: string) => {
        if (key === 'x-forwarded-for') return '203.0.113.7, 10.0.0.1';
        if (key === 'user-agent') return 'vitest-agent';
        return null;
      },
    })
  ),
  cookies: vi.fn(() => ({ get: vi.fn(() => undefined), set: vi.fn(), delete: vi.fn() })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_noStore: vi.fn() }));

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

import {
  getProjectionSettings,
  getSalaryConfiguration,
  getSalaryPrefill,
  saveProjectionSettings,
  saveSalaryConfiguration,
} from '../salary.actions';

// ============================================================================
// Test constants + helpers
// ============================================================================

const TEST_DB_URL = process.env.DATABASE_URL!;
const RUN = Date.now();
const USER_A = `salary-it-a-${RUN}`;
const USER_B = `salary-it-b-${RUN}`;
const GHOST = `salary-it-ghost-${RUN}`;

let pool: Pool;
let prisma: PrismaClient;
let systemSalaryCategoryId: string | null = null;
let createdSystemCategoryId: string | null = null;

async function createUser(id: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@example.com`,
      name: 'Salary IT User',
      passwordHash: 'hashed_test_password',
      language: Language.SPANISH,
      theme: Theme.LIGHT,
      baseCurrency: Currency.COP,
      isActive: true,
    },
  });
}

async function cleanup() {
  const userIds = [USER_A, USER_B, GHOST];
  await prisma.salaryBonus.deleteMany({ where: { salaryConfig: { userId: { in: userIds } } } });
  await prisma.salaryConfiguration.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.projectionSettings.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

const validSalary = {
  amountCents: 3_000_000,
  currency: 'COP' as const,
  frequency: 'MONTHLY' as const,
  payDays: [15],
};

beforeAll(async () => {
  pool = new Pool({ connectionString: TEST_DB_URL });
  prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  const existing = await prisma.category.findFirst({
    where: { type: VariableExpenseCategory.SALARY, userId: null, isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (existing) {
    systemSalaryCategoryId = existing.id;
  } else {
    const created = await prisma.category.create({
      data: {
        name: `salary-it-system-${RUN}`,
        type: VariableExpenseCategory.SALARY,
        userId: null,
        isActive: true,
        createdBy: 'system',
        lastModifiedBy: 'system',
      },
    });
    systemSalaryCategoryId = created.id;
    createdSystemCategoryId = created.id;
  }
});

afterAll(async () => {
  await cleanup();
  if (createdSystemCategoryId) {
    await prisma.category.delete({ where: { id: createdSystemCategoryId } }).catch(() => undefined);
  }
  await prisma.$disconnect();
  await pool.end();
});

describe('Salary Actions Integration', () => {
  beforeEach(async () => {
    await cleanup();
    await createUser(USER_A);
    await createUser(USER_B);
    sessionRef.userId = USER_A;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // getSalaryConfiguration
  // ==========================================================================

  it('reports "not configured" when no active configuration exists', async () => {
    const result = await getSalaryConfiguration({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ configured: false, configuration: null });
  });

  it('returns an INACTIVE configuration as "not configured" (soft delete, Rule 4)', async () => {
    await prisma.salaryConfiguration.create({
      data: {
        userId: USER_A,
        amountCents: BigInt(1_000_000),
        currency: Currency.COP,
        frequency: 'MONTHLY',
        payDays: [10],
        isActive: false,
        deletedAt: new Date(),
        createdBy: USER_A,
        lastModifiedBy: USER_A,
      },
    });

    const result = await getSalaryConfiguration({});

    expect(result.data).toEqual({ configured: false, configuration: null });
  });

  it('returns UNAUTHORIZED without a session', async () => {
    sessionRef.userId = '';

    const result = await getSalaryConfiguration({});

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');
  });

  // ==========================================================================
  // saveSalaryConfiguration
  // ==========================================================================

  it('creates the configuration with its bonuses and serializes BigInt cents to numbers', async () => {
    const result = await saveSalaryConfiguration({
      ...validSalary,
      bonuses: [
        {
          name: 'Prima de servicios',
          amountCents: 1_200_000,
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 6,
          dayOfMonth: 20,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.configured).toBe(true);
    expect(result.data?.configuration).toMatchObject({
      amountCents: 3_000_000,
      currency: 'COP',
      frequency: 'MONTHLY',
      payDays: [15],
    });
    expect(result.data?.configuration?.bonuses).toHaveLength(1);
    expect(result.data?.configuration?.bonuses[0].amountCents).toBe(1_200_000);
    expect(typeof result.data?.configuration?.amountCents).toBe('number');

    // Rule 12: server-generated UUID v4 idempotency key.
    const storedBonus = await prisma.salaryBonus.findFirstOrThrow({
      where: { salaryConfig: { userId: USER_A } },
    });
    expect(storedBonus.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it('persists the audit trail (Rule 14)', async () => {
    await saveSalaryConfiguration(validSalary);

    const config = await prisma.salaryConfiguration.findUniqueOrThrow({
      where: { userId: USER_A },
    });
    expect(config.createdBy).toBe(USER_A);
    expect(config.lastModifiedBy).toBe(USER_A);
    expect(config.ipAddress).toBe('203.0.113.7');
    expect(config.userAgent).toBe('vitest-agent');
  });

  it('updates an existing configuration in place (upsert)', async () => {
    await saveSalaryConfiguration(validSalary);
    const first = await prisma.salaryConfiguration.findUniqueOrThrow({
      where: { userId: USER_A },
    });

    const result = await saveSalaryConfiguration({
      ...validSalary,
      amountCents: 4_000_000,
      frequency: 'BIWEEKLY',
      payDays: [15, 30],
    });

    expect(result.data?.configuration?.amountCents).toBe(4_000_000);
    const updated = await prisma.salaryConfiguration.findUniqueOrThrow({
      where: { userId: USER_A },
    });
    expect(updated.id).toBe(first.id);
    expect(updated.amountCents).toBe(BigInt(4_000_000));
    expect(updated.payDays).toEqual([15, 30]);
  });

  it('soft-deletes bonuses omitted from the complete set (Rule 4/6)', async () => {
    const first = await saveSalaryConfiguration({
      ...validSalary,
      bonuses: [
        {
          name: 'Prima A',
          amountCents: 100_000,
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 6,
          dayOfMonth: null,
        },
        {
          name: 'Prima B',
          amountCents: 200_000,
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 12,
          dayOfMonth: null,
        },
      ],
    });
    const bonusA = first.data!.configuration!.bonuses.find((b) => b.name === 'Prima A')!;
    const bonusB = first.data!.configuration!.bonuses.find((b) => b.name === 'Prima B')!;

    // The second save only sends Prima A → Prima B must be soft-deleted.
    const second = await saveSalaryConfiguration({
      ...validSalary,
      bonuses: [
        {
          id: bonusA.id,
          name: 'Prima A',
          amountCents: 150_000,
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 6,
          dayOfMonth: null,
        },
      ],
    });

    expect(second.data?.configuration?.bonuses).toHaveLength(1);

    const storedB = await prisma.salaryBonus.findUniqueOrThrow({ where: { id: bonusB.id } });
    expect(storedB.isActive).toBe(false);
    expect(storedB.deletedAt).not.toBeNull();
    // Never a physical DELETE.
    expect(await prisma.salaryBonus.count({ where: { id: bonusB.id } })).toBe(1);
  });

  it('reactivates the SAME row when a removed bonus is re-added', async () => {
    const first = await saveSalaryConfiguration({
      ...validSalary,
      bonuses: [
        {
          name: 'Prima A',
          amountCents: 100_000,
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 6,
          dayOfMonth: null,
        },
      ],
    });
    const bonusA = first.data!.configuration!.bonuses[0];

    await saveSalaryConfiguration({ ...validSalary, bonuses: [] });
    expect(
      (await prisma.salaryBonus.findUniqueOrThrow({ where: { id: bonusA.id } })).isActive
    ).toBe(false);

    const third = await saveSalaryConfiguration({
      ...validSalary,
      bonuses: [
        {
          id: bonusA.id,
          name: 'Prima A',
          amountCents: 100_000,
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 6,
          dayOfMonth: null,
        },
      ],
    });

    expect(third.data?.configuration?.bonuses[0].id).toBe(bonusA.id);
    const reactivated = await prisma.salaryBonus.findUniqueOrThrow({ where: { id: bonusA.id } });
    expect(reactivated.isActive).toBe(true);
    expect(reactivated.deletedAt).toBeNull();
  });

  it('rolls back the whole transaction when a bonus belongs to another user (ownership)', async () => {
    // USER_B owns the bonus.
    const configB = await prisma.salaryConfiguration.create({
      data: {
        userId: USER_B,
        amountCents: BigInt(9_000_000),
        currency: Currency.COP,
        frequency: 'MONTHLY',
        payDays: [1],
        createdBy: USER_B,
        lastModifiedBy: USER_B,
      },
    });
    const bonusB = await prisma.salaryBonus.create({
      data: {
        salaryConfigId: configB.id,
        name: "B's bonus",
        amountCents: BigInt(50_000),
        currency: Currency.COP,
        frequency: 'ANNUAL',
        anchorMonth: 1,
        idempotencyKey: crypto.randomUUID(),
        createdBy: USER_B,
        lastModifiedBy: USER_B,
      },
    });

    const result = await saveSalaryConfiguration({
      ...validSalary,
      bonuses: [
        {
          id: bonusB.id,
          name: 'Forged',
          amountCents: 1,
          currency: 'COP',
          frequency: 'ANNUAL',
          anchorMonth: 1,
          dayOfMonth: null,
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('UNAUTHORIZED');

    // The config upsert that ran BEFORE the failure must be rolled back.
    expect(await prisma.salaryConfiguration.findUnique({ where: { userId: USER_A } })).toBeNull();
    // The other user's bonus is untouched.
    const untouched = await prisma.salaryBonus.findUniqueOrThrow({ where: { id: bonusB.id } });
    expect(untouched.name).toBe("B's bonus");
    expect(untouched.isActive).toBe(true);
  });

  it('rejects an invalid payDays/frequency combination before touching the DB', async () => {
    const result = await saveSalaryConfiguration({
      ...validSalary,
      frequency: 'WEEKLY',
      payDays: [1, 2],
    });

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(await prisma.salaryConfiguration.findUnique({ where: { userId: USER_A } })).toBeNull();
  });

  // ==========================================================================
  // Projection settings
  // ==========================================================================

  it('returns a zeroed, not-configured settings response by default', async () => {
    const result = await getProjectionSettings({});

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      configured: false,
      monthlySavingsTargetCents: 0,
      currency: 'COP',
    });
  });

  it('upserts the monthly COP savings target and reads it back', async () => {
    const saved = await saveProjectionSettings({ monthlySavingsTargetCents: 500_000 });
    expect(saved.success).toBe(true);
    expect(saved.data).toEqual({
      configured: true,
      monthlySavingsTargetCents: 500_000,
      currency: 'COP',
    });

    const read = await getProjectionSettings({});
    expect(read.data?.monthlySavingsTargetCents).toBe(500_000);

    // Update keeps a single row and persists the audit fields.
    const updated = await saveProjectionSettings({ monthlySavingsTargetCents: 250_000 });
    expect(updated.data?.monthlySavingsTargetCents).toBe(250_000);
    expect(await prisma.projectionSettings.count({ where: { userId: USER_A } })).toBe(1);
    const row = await prisma.projectionSettings.findUniqueOrThrow({ where: { userId: USER_A } });
    expect(row.ipAddress).toBe('203.0.113.7');
    expect(row.lastModifiedBy).toBe(USER_A);
  });

  it('allows a zero savings target (explicitly disabling the commitment)', async () => {
    const result = await saveProjectionSettings({ monthlySavingsTargetCents: 0 });

    expect(result.success).toBe(true);
    expect(result.data?.monthlySavingsTargetCents).toBe(0);
  });

  it('rejects a negative savings target', async () => {
    const result = await saveProjectionSettings({ monthlySavingsTargetCents: -1 });

    expect(result.success).toBe(false);
    expect(result.code).toBe('VALIDATION_ERROR');
    expect(await prisma.projectionSettings.findUnique({ where: { userId: USER_A } })).toBeNull();
  });

  // ==========================================================================
  // Salary prefill
  // ==========================================================================

  it('resolves the system SALARY category by type and the configured amount', async () => {
    await saveSalaryConfiguration({ ...validSalary, amountCents: 7_500_000 });

    const result = await getSalaryPrefill({});

    expect(result.success).toBe(true);
    expect(result.data?.configured).toBe(true);
    expect(result.data?.amountCents).toBe(7_500_000);
    expect(result.data?.currency).toBe('COP');
    expect(result.data?.description).toBe('Sueldo');
    expect(result.data?.categoryId).toBe(systemSalaryCategoryId);
  });

  it('returns a zeroed prefill when there is no active salary configuration', async () => {
    const result = await getSalaryPrefill({});

    expect(result.data).toMatchObject({
      configured: false,
      amountCents: 0,
      description: 'Sueldo',
      currency: 'COP',
    });
  });

  it('returns NOT_FOUND/root error when the user was deleted mid-session', async () => {
    sessionRef.userId = GHOST;

    // Upsert on a non-existent user fails the FK — mapped to an internal error.
    const result = await saveSalaryConfiguration(validSalary);

    expect(result.success).toBe(false);
  });
});
