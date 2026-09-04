/**
 * E2E Database Helper
 *
 * Provides direct database access for test setup/cleanup.
 *
 * Why this is needed: the new ACCOUNT_HAS_BALANCE integrity rule rejects
 * deleting an account whose TRUE balance is not 0. The old "que no existen
 * cuentas bancarias" step deleted leftover accounts via the UI, but a previous
 * scenario can leave an account with a non-zero balance (e.g. "Mi Cuenta
 * Corriente" created with 1.000.000), so the UI delete is now rejected and the
 * cleanup loop would hang. A DB-level soft reset is the reliable equivalent.
 *
 * The connection uses the SAME DATABASE_URL loaded from .env.e2e
 * (?schema=e2e), so it NEVER touches the development database.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set for E2E DB cleanup');
    }
    const pool = new Pool({ connectionString: url });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  }
  return prisma;
}

/**
 * Soft-deletes all transactions and bank accounts of the given user so each
 * E2E scenario starts from a clean slate. Mirrors the app's soft-delete rule
 * (isActive=false + deletedAt) — no hard deletes, no FK conflicts.
 */
export async function resetUserFinancialData(email: string): Promise<void> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return;

  await db.$transaction([
    db.transaction.updateMany({
      where: { userId: user.id },
      data: { isActive: false, deletedAt: new Date() },
    }),
    db.account.updateMany({
      where: { userId: user.id },
      data: { isActive: false, deletedAt: new Date() },
    }),
  ]);
}

/**
 * Returns a map of ACTIVE account names → balanceCents for the given user email.
 *
 * Why: transfers.feature reuses the shared transactions user
 * (transactions@e2e.financetrackerpro.com), whose account balances are mutated
 * by the earlier transactions.feature scenarios in the same run (create, edit,
 * delete, opening balance). Asserting an absolute seed balance would be fragile;
 * instead the transfer happy-path reads the CURRENT balances right before the
 * transfer and asserts the post-transfer delta on the accounts page.
 */
export async function getAccountBalancesByEmail(email: string): Promise<Record<string, number>> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return {};

  const accounts = await db.account.findMany({
    where: { userId: user.id, isActive: true },
  });
  const balances: Record<string, number> = {};
  for (const acc of accounts) balances[acc.name] = acc.balanceCents;
  return balances;
}

/**
 * Returns a map of ACTIVE parent-account names → TOTAL balanceCents (external
 * balance + the sum of its pockets) for the given user email.
 *
 * Why: the accounts page parent card renders `totalBalanceCents` (external +
 * pockets) visually. The pockets scenarios in transfers.feature must assert
 * that an internal transfer (parent ⇄ pocket or pocket ⇄ sibling pocket) does
 * NOT change that displayed total. This helper computes exactly what the card
 * shows before the transfer so the assertion can compare equality.
 */
export async function getAccountTotalBalancesByEmail(
  email: string
): Promise<Record<string, number>> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return {};

  const accounts = await db.account.findMany({
    where: { userId: user.id, isActive: true },
  });
  const balances: Record<string, number> = {};
  for (const acc of accounts) {
    if (acc.type === 'POCKET' && acc.parentAccountId) continue; // included in its parent
    const pockets = accounts.filter((p) => p.type === 'POCKET' && p.parentAccountId === acc.id);
    balances[acc.name] = pockets.reduce((sum, p) => sum + p.balanceCents, acc.balanceCents);
  }
  return balances;
}

/**
 * Creates a bank transaction DIRECTLY in the isolated e2e schema (bypasses the
 * UI/server action). Used by the accounts movements-detail scenario to seed a
 * deterministic movements dataset for the detail overlay.
 *
 * Why not the UI: seeding 12 movements through the create-transaction modal
 * would take 12 slow submits. A single Prisma insert is fast and keeps the
 * scenario self-contained on the ACCOUNTS user — it NEVER touches the shared
 * transactions user (transactions@e2e...) whose exact 20-row pagination
 * assertions depend on the untouched seed data.
 *
 * The connection uses the SAME DATABASE_URL loaded from .env.e2e
 * (?schema=e2e), so it NEVER touches the development database.
 */
export async function createTransaction(
  accountId: string,
  input: {
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER_OUT' | 'TRANSFER_IN';
    amountCents: number;
    description: string;
    date: Date;
  }
): Promise<void> {
  const db = getPrisma();
  const account = await db.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new Error(`createTransaction: account ${accountId} not found`);
  }

  await db.transaction.create({
    data: {
      idempotencyKey: randomUUID(),
      userId: account.userId,
      accountId: account.id,
      type: input.type,
      amountCents: input.amountCents,
      currency: account.currency,
      description: input.description,
      date: input.date,
      isActive: true,
      createdBy: account.userId,
      lastModifiedBy: account.userId,
    },
  });
}

/**
 * Resolves the ACTIVE account id for a given user email + exact account name.
 * Used by scenarios that create an account via the UI (unique timestamp name)
 * and then need the DB id to seed transactions directly.
 */
export async function getActiveAccountIdByEmail(email: string, name: string): Promise<string> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`getActiveAccountIdByEmail: user ${email} not found`);
  }
  const account = await db.account.findFirst({
    where: { userId: user.id, name, isActive: true },
    select: { id: true },
  });
  if (!account) {
    throw new Error(`getActiveAccountIdByEmail: active account "${name}" not found for ${email}`);
  }
  return account.id;
}
