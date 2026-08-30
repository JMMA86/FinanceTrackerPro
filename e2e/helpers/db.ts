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
