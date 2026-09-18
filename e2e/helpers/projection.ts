/**
 * Projection E2E helpers.
 *
 * The end-of-period projection only renders its month/year cards when the user
 * has an ACTIVE salary configuration, and it only explains some components when
 * the underlying data exists:
 *   - `INVESTMENT_VALUE`   needs an INVESTMENT account with value;
 *   - `VARIABLE_ESTIMATE`  needs monitored variable-expense definitions.
 *
 * Two isolated seeded users already own that data (the investments user and the
 * variable-expenses user), but neither of them has a salary configuration, so
 * these helpers ARRANGE the missing precondition directly in the isolated
 * `?schema=e2e` database (NEVER the development database):
 *
 *   - `ensureSalaryConfiguration`     → idempotent upsert of a salary config;
 *   - `ensureForeignInvestmentAccount`→ USD investment account + a ledger-backed
 *     TRANSFER_IN that also stores an explicit "COP per USD" rate, so the
 *     projection's FX fallback resolves deterministically (no dependency on the
 *     live exchange-rate API).
 *
 * The dashboard user is NOT touched here: its salary/bonus/target are seeded by
 * `prisma/seed.e2e.ts`.
 *
 * `getReceivableInstallmentCounts` is the ORACLE for the product rule "RECEIVABLE
 * collections count only when FUTURE": it returns how many installments the
 * projection window should include (`dueDate >= today && dueDate <= end of year`)
 * next to the total pending count, so a spec can prove that overdue collections
 * are excluded.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { endOfYear, startOfDay } from 'date-fns';
import type { SalaryFrequency } from '@prisma/client';

let projectionDb: PrismaClient | null = null;

function getProjectionDb(): PrismaClient {
  if (!projectionDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set; cannot arrange projection E2E data');
    }
    const pool = new Pool({ connectionString: url });
    // disposeExternalPool:true makes `$disconnect()` close the pool, so the
    // teardown hook in `projection.steps.ts` leaves no open handles behind.
    projectionDb = new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }
  return projectionDb;
}

/** Closes the dedicated client (called from the feature's After hook). */
export async function closeProjectionDb(): Promise<void> {
  const db = projectionDb;
  if (!db) return;
  projectionDb = null;
  await db.$disconnect();
}

async function requireUserId(email: string): Promise<string> {
  const user = await getProjectionDb().user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`E2E user not found in the e2e database: ${email}`);
  return user.id;
}

export interface SalaryArrangement {
  amountCents: number;
  frequency: SalaryFrequency;
  payDays: number[];
}

/**
 * Idempotent salary configuration for a seeded user (keyed by the 1:1 `userId`),
 * so a Playwright retry (which reuses the database) never drifts.
 */
export async function ensureSalaryConfiguration(
  email: string,
  arrangement: SalaryArrangement
): Promise<void> {
  const db = getProjectionDb();
  const userId = await requireUserId(email);
  const data = {
    amountCents: BigInt(arrangement.amountCents),
    currency: 'COP' as const,
    frequency: arrangement.frequency,
    payDays: arrangement.payDays,
    isActive: true,
    deletedAt: null,
    lastModifiedBy: userId,
  };

  await db.salaryConfiguration.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data, createdBy: userId },
  });
}

/** Account name of the USD investment account arranged for the projection specs. */
export const FOREIGN_INVESTMENT_ACCOUNT_NAME = 'Inversión Proyección E2E';

/** Explicit "COP per 1 USD" rate stored on the ledger transfer (plausible band). */
export const STORED_COP_PER_USD = 4000;

/** Ledger amount of the arranged USD investment account, in USD cents. */
const FOREIGN_INVESTMENT_AMOUNT_CENTS = 1_000_000;

/**
 * Arranges an INVESTMENT account in USD whose ledger holds a single TRANSFER_IN.
 *
 * The transfer carries `exchangeRate = STORED_COP_PER_USD`, which the projection
 * service reads as the STORED fallback rate (`loadStoredCopPerForeign`), so the
 * "Inversiones a valor de mercado" line always resolves to COP — even offline.
 * Idempotent: both rows are keyed by deterministic idempotency keys.
 */
export async function ensureForeignInvestmentAccount(email: string): Promise<void> {
  const db = getProjectionDb();
  const userId = await requireUserId(email);

  const account = await db.account.upsert({
    where: { idempotencyKey: `e2e-projection-usd-account-${email}` },
    update: {
      isActive: true,
      deletedAt: null,
      balanceCents: BigInt(FOREIGN_INVESTMENT_AMOUNT_CENTS),
      lastModifiedBy: userId,
    },
    create: {
      idempotencyKey: `e2e-projection-usd-account-${email}`,
      userId,
      name: FOREIGN_INVESTMENT_ACCOUNT_NAME,
      type: 'INVESTMENT',
      currency: 'USD',
      balanceCents: BigInt(FOREIGN_INVESTMENT_AMOUNT_CENTS),
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });

  await db.transaction.upsert({
    where: { idempotencyKey: `e2e-projection-usd-transfer-${email}` },
    update: {
      isActive: true,
      deletedAt: null,
      amountCents: BigInt(FOREIGN_INVESTMENT_AMOUNT_CENTS),
      exchangeRate: STORED_COP_PER_USD,
      lastModifiedBy: userId,
    },
    create: {
      idempotencyKey: `e2e-projection-usd-transfer-${email}`,
      userId,
      accountId: account.id,
      type: 'TRANSFER_IN',
      description: 'Depósito inicial inversión USD (proyección E2E)',
      amountCents: BigInt(FOREIGN_INVESTMENT_AMOUNT_CENTS),
      currency: 'USD',
      originalAmountCents: BigInt(FOREIGN_INVESTMENT_AMOUNT_CENTS * STORED_COP_PER_USD),
      originalCurrency: 'COP',
      exchangeRate: STORED_COP_PER_USD,
      date: new Date(),
      createdBy: userId,
      lastModifiedBy: userId,
    },
  });
}

export interface ReceivableInstallmentCounts {
  /** Installments the projection window must include (future, up to Dec 31). */
  futureInWindow: number;
  /** Every non-settled installment, including the overdue ones. */
  totalPending: number;
}

/**
 * Counts the RECEIVABLE installments of a user, mirroring the projection
 * service window (`dueDate >= startOfDay(now)` and `dueDate <= endOfYear(now)`,
 * status PENDING/PARTIAL/OVERDUE, ACTIVE loan).
 */
export async function getReceivableInstallmentCounts(
  email: string,
  now: Date = new Date()
): Promise<ReceivableInstallmentCounts> {
  const db = getProjectionDb();
  const rows = await db.loanInstallment.findMany({
    where: {
      loan: { user: { email }, isActive: true, status: 'ACTIVE', direction: 'RECEIVABLE' },
      isActive: true,
      status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    },
    select: { dueDate: true },
  });

  const from = startOfDay(now).getTime();
  const to = endOfYear(now).getTime();
  const futureInWindow = rows.filter(
    (row) => row.dueDate.getTime() >= from && row.dueDate.getTime() <= to
  ).length;

  return { futureInWindow, totalPending: rows.length };
}
