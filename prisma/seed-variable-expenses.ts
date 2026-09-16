/**
 * Demo Variable Expenses Seeder
 *
 * Generates realistic demo data for the /variable-expenses module:
 * - Monitored `VariableExpense` definitions ("Fútbol", "Salidas Novia", ...)
 *   with optional expected targets.
 * - EXPENSE transactions for the last 6 months (current month included) linked
 *   to those definitions via `variableExpenseId`, keeping a coherent
 *   `categoryId`. A few rows stay UNMONITORED (normal expenses).
 *
 * Rules:
 * - Rule 1/2: amounts are integer cents (BigInt) and always negative (EXPENSE).
 * - Rule 13: after inserting rows the affected accounts are reconciled so
 *   `Account.balanceCents` (cache) === sum of the active ledger.
 *
 * Idempotent: definitions and transactions have deterministic `idempotencyKey`s
 * (`seed-var-def-<key>` / `seed-var-<year>-<month>-<index>`) so re-running
 * upserts instead of duplicating. The PRNG is seeded to a constant, so the
 * generated amounts/dates are stable across runs.
 *
 * Standalone run: npm run db:seed:variables
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { Decimal } from 'decimal.js';
import { pathToFileURL } from 'node:url';

// ============================================================================
// Constants
// ============================================================================

const DEMO_EMAIL = 'demo@financetracker.com';
const DEMO_MONTHS = 6;
const RNG_SEED = 20260101;
const OPENING_BALANCE_DATE = new Date('2025-01-01');

/** Fixed system category ids (must match prisma/seed.ts). */
const SYSTEM_CATEGORIES = {
  GROCERIES: 'cgroceries000000000000000',
  TRANSPORTATION: 'ctransportation000000000000',
  ENTERTAINMENT: 'centertainment00000000000',
  HEALTHCARE: 'chealthcare00000000000000',
  SHOPPING: 'cshopping0000000000000000',
  DINING: 'cdining000000000000000000',
  OTHER: 'cother0000000000000000000',
} as const;

/** Card probability per system category (monitored rows). */
const CARD_SHARE: Record<string, number> = {
  [SYSTEM_CATEGORIES.GROCERIES]: 0.2,
  [SYSTEM_CATEGORIES.TRANSPORTATION]: 0.2,
  [SYSTEM_CATEGORIES.ENTERTAINMENT]: 0.6,
  [SYSTEM_CATEGORIES.HEALTHCARE]: 0.15,
  [SYSTEM_CATEGORIES.SHOPPING]: 0.8,
  [SYSTEM_CATEGORIES.DINING]: 0.45,
  [SYSTEM_CATEGORIES.OTHER]: 0.2,
};

const ACCOUNT_NAMES = {
  cash: 'Efectivo',
  bank: 'Bancolombia (Ahorros)',
  card: 'NuBank (Crédito)',
} as const;

// ============================================================================
// Demo definitions
// ============================================================================

interface DefinitionSpec {
  /** Stable slug used in the deterministic idempotency key. */
  key: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  expectedTimesPerMonth: number;
  expectedAmountCents: number;
  categoryId: string;
  descriptions: readonly string[];
}

const DEFINITION_SPECS: readonly DefinitionSpec[] = [
  {
    key: 'futbol',
    name: 'Fútbol',
    description: 'Partidos y canchas',
    color: '#22C55E',
    icon: 'volleyball',
    expectedTimesPerMonth: 4,
    expectedAmountCents: 4_000_000, // $40.000 COP
    categoryId: SYSTEM_CATEGORIES.ENTERTAINMENT,
    descriptions: ['Cancha fútbol', 'Alquiler cancha', 'Fútbol 5'],
  },
  {
    key: 'salidas-novia',
    name: 'Salidas Novia',
    description: 'Planes con mi novia',
    color: '#F97316',
    icon: 'heart',
    expectedTimesPerMonth: 5,
    expectedAmountCents: 8_000_000, // $80.000 COP
    categoryId: SYSTEM_CATEGORIES.DINING,
    descriptions: ['Cena con novia', 'Salida con novia', 'Cine con novia'],
  },
  {
    key: 'mercado',
    name: 'Mercado',
    description: 'Mercado del hogar',
    color: '#3B82F6',
    icon: 'shopping-cart',
    expectedTimesPerMonth: 4,
    expectedAmountCents: 25_000_000, // $250.000 COP
    categoryId: SYSTEM_CATEGORIES.GROCERIES,
    descriptions: ['Mercado Éxito', 'Mercado D1', 'Mercado Carulla', 'Mercado Olímpica'],
  },
  {
    key: 'transporte',
    name: 'Transporte',
    description: 'Movilidad diaria',
    color: '#EF4444',
    icon: 'bus',
    expectedTimesPerMonth: 20,
    expectedAmountCents: 1_500_000, // $15.000 COP
    categoryId: SYSTEM_CATEGORIES.TRANSPORTATION,
    descriptions: ['Uber', 'Gasolina', 'TransMilenio', 'Taxi'],
  },
  {
    key: 'cafe',
    name: 'Café',
    description: 'Café y tintos',
    color: '#A16207',
    icon: 'coffee',
    expectedTimesPerMonth: 10,
    expectedAmountCents: 800_000, // $8.000 COP
    categoryId: SYSTEM_CATEGORIES.DINING,
    descriptions: ['Café Juan Valdez', 'Café', 'Tinto'],
  },
];

interface NormalSpec {
  categoryId: string;
  label: string;
  merchants: readonly string[];
  minCount: number;
  maxCount: number;
  minCents: number;
  maxCents: number;
  cardShare: number;
}

/** Unmonitored ("normal") demo expenses so not everything is monitored. */
const NORMAL_SPECS: readonly NormalSpec[] = [
  {
    categoryId: SYSTEM_CATEGORIES.SHOPPING,
    label: 'Compras',
    merchants: ['Amazon', 'Zara', 'Falabella', 'MercadoLibre'],
    minCount: 0,
    maxCount: 2,
    minCents: 5_000_000,
    maxCents: 40_000_000,
    cardShare: 0.8,
  },
  {
    categoryId: SYSTEM_CATEGORIES.HEALTHCARE,
    label: 'Salud',
    merchants: ['Farmacia', 'Cita médica', 'Laboratorio', 'Odontología'],
    minCount: 0,
    maxCount: 2,
    minCents: 3_000_000,
    maxCents: 20_000_000,
    cardShare: 0.15,
  },
  {
    categoryId: SYSTEM_CATEGORIES.OTHER,
    label: 'Otros',
    merchants: ['Regalo', 'Donación', 'Imprevisto'],
    minCount: 0,
    maxCount: 1,
    minCents: 1_500_000,
    maxCents: 10_000_000,
    cardShare: 0.2,
  },
];

// ============================================================================
// Deterministic RNG + small helpers
// ============================================================================

/** Mulberry32: tiny deterministic PRNG so re-runs generate identical data. */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  if (max <= min) return min;
  return min + Math.floor(rng() * (max - min + 1));
}

function pickOne<T>(rng: () => number, values: readonly T[]): T {
  return values[randomInt(rng, 0, values.length - 1)];
}

/** Whole-peso amount in cents within [minCents, maxCents]. */
function randomAmountInRange(rng: () => number, minCents: number, maxCents: number): number {
  const raw = randomInt(rng, minCents, maxCents);
  const factor = 0.75 + rng() * 0.6; // 0.75 .. 1.35 month-to-month variation
  const adjusted = new Decimal(raw)
    .times(factor)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  return Math.max(100, Math.round(adjusted / 100) * 100);
}

/** Whole-peso amount in cents around a target (monitored expected amount). */
function randomAmountAround(rng: () => number, targetCents: number): number {
  const factor = 0.75 + rng() * 0.5; // 0.75 .. 1.25
  const adjusted = new Decimal(targetCents)
    .times(factor)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
    .toNumber();
  return Math.max(100, Math.round(adjusted / 100) * 100);
}

interface MonthKey {
  year: number;
  month: number;
}

/** Ascending list of the last `count` months (current month included). */
function lastMonths(now: Date, count: number): MonthKey[] {
  const keys: MonthKey[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    keys.push({ year: date.getFullYear(), month: date.getMonth() + 1 });
  }
  return keys;
}

function randomDate(rng: () => number, monthKey: MonthKey, maxDay: number): Date {
  const day = randomInt(rng, 1, maxDay);
  const hour = randomInt(rng, 8, 21);
  const minute = randomInt(rng, 0, 59);
  return new Date(monthKey.year, monthKey.month - 1, day, hour, minute, 0, 0);
}

function cardShareFor(categoryId: string | null): number {
  if (categoryId === null) return 0.3;
  return CARD_SHARE[categoryId] ?? 0.3;
}

// ============================================================================
// Accounts
// ============================================================================

interface SeedAccountRef {
  id: string;
  name: string;
}

interface AccountSet {
  cash?: SeedAccountRef;
  bank?: SeedAccountRef;
  card?: SeedAccountRef;
  all: SeedAccountRef[];
}

/**
 * Resolve the COP demo accounts by name, falling back to any active COP
 * non-investment account when a named one is missing. Throws only when the
 * user has no usable COP account at all.
 */
async function resolveAccounts(prisma: PrismaClient, userId: string): Promise<AccountSet> {
  const accounts = await prisma.account.findMany({
    where: { userId, isActive: true, currency: 'COP', type: { not: 'INVESTMENT' } },
    select: { id: true, name: true, type: true },
    orderBy: { name: 'asc' },
  });

  if (accounts.length === 0) {
    throw new Error(`No active COP accounts found for user ${userId}`);
  }

  const findByName = (name: string): SeedAccountRef | undefined => {
    const match = accounts.find((account) => account.name === name);
    return match ? { id: match.id, name: match.name } : undefined;
  };

  const savingsAccounts = accounts.filter((account) => account.type === 'SAVINGS');
  const creditAccount = accounts.find((account) => account.type === 'CREDIT_CARD');
  const asRef = (index: number): SeedAccountRef | undefined => {
    const account = savingsAccounts[index];
    return account ? { id: account.id, name: account.name } : undefined;
  };

  return {
    cash: findByName(ACCOUNT_NAMES.cash) ??
      asRef(0) ?? { id: accounts[0].id, name: accounts[0].name },
    bank: findByName(ACCOUNT_NAMES.bank) ??
      asRef(1) ??
      asRef(0) ?? { id: accounts[0].id, name: accounts[0].name },
    card:
      findByName(ACCOUNT_NAMES.card) ??
      (creditAccount ? { id: creditAccount.id, name: creditAccount.name } : undefined),
    all: accounts.map((account) => ({ id: account.id, name: account.name })),
  };
}

function pickAccount(rng: () => number, accounts: AccountSet, cardShare: number): SeedAccountRef {
  if (accounts.card && rng() < cardShare) {
    return accounts.card;
  }
  if (accounts.cash && accounts.bank) {
    return rng() < 0.35 ? accounts.cash : accounts.bank;
  }
  const fallback = accounts.bank ?? accounts.cash ?? accounts.card;
  if (!fallback) {
    throw new Error('No usable account to attach a demo variable expense');
  }
  return fallback;
}

// ============================================================================
// Ledger reconciliation (Rule 13)
// ============================================================================

/**
 * Ensure `Account.balanceCents` (cache) equals the sum of the account's active
 * transactions. When they differ, upsert a deterministic opening transaction
 * (`repair-opening-balance-<accountId>`) that absorbs the difference. Same
 * pattern as prisma/repair-account-ledgers.ts.
 *
 * The previous balancing row is EXCLUDED from the ledger sum, so the computed
 * gap is the net of the "real" transactions. This keeps the function correct
 * and idempotent when a balancing row already exists and new transactions were
 * added afterwards (recomputing the difference must not double-count it).
 *
 * @returns true when the balancing row was created, updated or soft-deleted.
 */
export async function reconcileAccountToCache(
  prisma: PrismaClient,
  accountId: string,
  userId: string
): Promise<boolean> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, currency: true, balanceCents: true },
  });
  if (!account) return false;

  const idempotencyKey = `repair-opening-balance-${accountId}`;

  const transactions = await prisma.transaction.findMany({
    where: { accountId, isActive: true, idempotencyKey: { not: idempotencyKey } },
    select: { amountCents: true },
  });

  let ledger = new Decimal(0);
  for (const transaction of transactions) {
    ledger = ledger.plus(transaction.amountCents.toString());
  }

  const diff = new Decimal(account.balanceCents.toString()).minus(ledger);

  if (diff.isZero()) {
    // No gap: soft-delete a now-redundant balancing row (if any) so the cached
    // balance stays coherent with the ledger.
    const stale = await prisma.transaction.findUnique({
      where: { idempotencyKey },
      select: { isActive: true },
    });
    if (stale?.isActive) {
      await prisma.transaction.update({
        where: { idempotencyKey },
        data: { isActive: false, deletedAt: new Date(), lastModifiedBy: userId },
      });
      return true;
    }
    return false;
  }

  const diffNumber = diff.toNumber();
  const type = diffNumber > 0 ? 'INCOME' : 'EXPENSE';

  await prisma.transaction.upsert({
    where: { idempotencyKey },
    update: {
      type,
      amountCents: BigInt(diffNumber),
      currency: account.currency,
      description: 'Saldo inicial',
      openingBalance: true,
      isActive: true,
      deletedAt: null,
      lastModifiedBy: userId,
    },
    create: {
      idempotencyKey,
      userId,
      accountId,
      type,
      amountCents: BigInt(diffNumber),
      currency: account.currency,
      description: 'Saldo inicial',
      date: OPENING_BALANCE_DATE,
      openingBalance: true,
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });

  return true;
}

// ============================================================================
// Definitions
// ============================================================================

interface SeedDefinition {
  id: string;
}

/**
 * Upsert the demo monitored definitions (idempotent by deterministic key).
 * Returns a map keyed by the spec slug.
 */
async function upsertDefinitions(
  prisma: PrismaClient,
  userId: string
): Promise<Map<string, SeedDefinition>> {
  const result = new Map<string, SeedDefinition>();

  for (const spec of DEFINITION_SPECS) {
    const idempotencyKey = `seed-var-def-${spec.key}`;
    const definition = await prisma.variableExpense.upsert({
      where: { idempotencyKey },
      update: {
        name: spec.name,
        description: spec.description,
        color: spec.color,
        icon: spec.icon,
        categoryId: spec.categoryId,
        expectedTimesPerMonth: spec.expectedTimesPerMonth,
        expectedAmountCents: BigInt(spec.expectedAmountCents),
        currency: 'COP',
        isActive: true,
        deletedAt: null,
        lastModifiedBy: userId,
      },
      create: {
        idempotencyKey,
        userId,
        name: spec.name,
        description: spec.description,
        color: spec.color,
        icon: spec.icon,
        categoryId: spec.categoryId,
        expectedTimesPerMonth: spec.expectedTimesPerMonth,
        expectedAmountCents: BigInt(spec.expectedAmountCents),
        currency: 'COP',
        createdBy: userId,
        lastModifiedBy: userId,
      },
      select: { id: true },
    });
    result.set(spec.key, { id: definition.id });
  }

  return result;
}

// ============================================================================
// Row planning
// ============================================================================

interface SeedExpenseRow {
  idempotencyKey: string;
  accountId: string;
  amountCents: bigint;
  currency: 'COP';
  description: string;
  date: Date;
  categoryId: string | null;
  variableExpenseId: string | null;
}

interface PlanContext {
  rng: () => number;
  accounts: AccountSet;
  monthKey: MonthKey;
  maxDay: number;
  rows: SeedExpenseRow[];
  affectedAccountIds: Set<string>;
}

interface PlanRowParams {
  description: string;
  categoryId: string | null;
  variableExpenseId: string | null;
  amountCents: number;
}

function planRow(context: PlanContext, index: number, params: PlanRowParams): void {
  const { rng, accounts, monthKey, maxDay, rows, affectedAccountIds } = context;
  const account = pickAccount(rng, accounts, cardShareFor(params.categoryId));
  affectedAccountIds.add(account.id);
  rows.push({
    idempotencyKey: `seed-var-${monthKey.year}-${monthKey.month}-${index}`,
    accountId: account.id,
    amountCents: BigInt(-params.amountCents),
    currency: 'COP',
    description: params.description,
    date: randomDate(rng, monthKey, maxDay),
    categoryId: params.categoryId,
    variableExpenseId: params.variableExpenseId,
  });
}

function planMonth(context: PlanContext, definitions: Map<string, SeedDefinition>): void {
  let index = 0;

  for (const spec of DEFINITION_SPECS) {
    const definition = definitions.get(spec.key);
    if (!definition) continue;
    const count = randomInt(
      context.rng,
      Math.max(0, spec.expectedTimesPerMonth - 1),
      spec.expectedTimesPerMonth + 1
    );
    for (let i = 0; i < count; i += 1) {
      planRow(context, index, {
        description: pickOne(context.rng, spec.descriptions),
        categoryId: spec.categoryId,
        variableExpenseId: definition.id,
        amountCents: randomAmountAround(context.rng, spec.expectedAmountCents),
      });
      index += 1;
    }
  }

  // Unmonitored "normal" expenses.
  for (const spec of NORMAL_SPECS) {
    const count = randomInt(context.rng, spec.minCount, spec.maxCount);
    for (let i = 0; i < count; i += 1) {
      const merchant = pickOne(context.rng, spec.merchants);
      planRow(context, index, {
        description: `${merchant} - ${spec.label}`,
        categoryId: spec.categoryId,
        variableExpenseId: null,
        amountCents: randomAmountInRange(context.rng, spec.minCents, spec.maxCents),
      });
      index += 1;
    }
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Insert the demo variable expenses for the last 6 months and reconcile the
 * affected accounts. Also upserts the monitored definitions.
 *
 * @returns `inserted` = number of NEW transactions (0 on an idempotent re-run);
 *   `months` = length of the generated window; `definitions` = definitions.
 */
export async function seedVariableExpenses(
  prisma: PrismaClient,
  userId: string,
  options?: { now?: Date }
): Promise<{ inserted: number; months: number; definitions: number }> {
  const now = options?.now ?? new Date();
  const accounts = await resolveAccounts(prisma, userId);
  const definitions = await upsertDefinitions(prisma, userId);
  const monthKeys = lastMonths(now, DEMO_MONTHS);
  const rng = createRng(RNG_SEED);
  const rows: SeedExpenseRow[] = [];
  const affectedAccountIds = new Set<string>();

  for (const monthKey of monthKeys) {
    const isCurrentMonth =
      monthKey.year === now.getFullYear() && monthKey.month === now.getMonth() + 1;
    const maxDay = isCurrentMonth ? now.getDate() : 28;
    planMonth({ rng, accounts, monthKey, maxDay, rows, affectedAccountIds }, definitions);
  }

  const existing = await prisma.transaction.findMany({
    where: { idempotencyKey: { in: rows.map((row) => row.idempotencyKey) } },
    select: { idempotencyKey: true },
  });
  const existingKeys = new Set(existing.map((transaction) => transaction.idempotencyKey));

  for (const row of rows) {
    await prisma.transaction.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      update: {
        accountId: row.accountId,
        amountCents: row.amountCents,
        currency: row.currency,
        description: row.description,
        date: row.date,
        categoryId: row.categoryId,
        variableExpenseId: row.variableExpenseId,
        isActive: true,
        deletedAt: null,
        lastModifiedBy: userId,
      },
      create: {
        idempotencyKey: row.idempotencyKey,
        userId,
        accountId: row.accountId,
        type: 'EXPENSE',
        amountCents: row.amountCents,
        currency: row.currency,
        description: row.description,
        date: row.date,
        categoryId: row.categoryId,
        variableExpenseId: row.variableExpenseId,
        createdBy: userId,
        lastModifiedBy: userId,
      },
    });
  }

  for (const accountId of affectedAccountIds) {
    await reconcileAccountToCache(prisma, accountId, userId);
  }

  const inserted = rows.filter((row) => !existingKeys.has(row.idempotencyKey)).length;
  return { inserted, months: monthKeys.length, definitions: definitions.size };
}

// ============================================================================
// Standalone entry point
// ============================================================================

async function main(): Promise<void> {
  dotenvExpand.expand(dotenv.config({ override: true }));

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exitCode = 1;
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({
      where: { email: DEMO_EMAIL },
      select: { id: true },
    });

    if (!user) {
      console.error(`Demo user ${DEMO_EMAIL} not found. Run "npm run db:seed" first.`);
      process.exitCode = 1;
      return;
    }

    console.log('🌱 Seeding demo variable expenses...');
    const result = await seedVariableExpenses(prisma, user.id);
    console.log(
      `✅ Seeded ${result.inserted} new transactions, ${result.definitions} definitions across ${result.months} months`
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error('❌ Variable expenses seed failed:', error);
    process.exitCode = 1;
  });
}
