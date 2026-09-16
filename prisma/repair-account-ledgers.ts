/**
 * Repair Account Ledgers
 *
 * Rule 13: transactions are the source of truth and `Account.balanceCents` is a
 * cache. Legacy/seeded accounts can have a cache that is NOT backed by ledger
 * transactions (missing opening balance), which makes money operations fail with
 * INSUFFICIENT_FUNDS even though the UI shows a positive balance.
 *
 * This standalone script (no `server-only`) reconciles EVERY active account of
 * the database pointed to by DATABASE_URL:
 *   1. ledger = sum of its active transactions (exact Decimal arithmetic),
 *   2. diff = cache - ledger,
 *   3. if diff !== 0, upsert a deterministic opening transaction
 *      (`repair-opening-balance-<accountId>`, INCOME when diff > 0 else EXPENSE,
 *      openingBalance: true, 'Saldo inicial', dated 2025-01-01),
 *   4. leave any previous repair transaction in place when diff === 0.
 *
 * Idempotent and safe to re-run: after the opening row exists, cache and ledger
 * move together, so subsequent runs are no-ops.
 *
 * Run: npm run db:repair-ledgers   (or: npx tsx prisma/repair-account-ledgers.ts)
 */

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
dotenvExpand.expand(dotenv.config({ override: true }));

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Decimal } from 'decimal.js';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const OPENING_BALANCE_DATE = new Date('2025-01-01');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  const accounts = await prisma.account.findMany({
    where: { isActive: true },
    select: { id: true, name: true, balanceCents: true, currency: true, userId: true },
    orderBy: [{ name: 'asc' }],
  });

  console.log(`🔧 Repairing ledgers for ${accounts.length} active account(s)...`);

  let repaired = 0;
  let healthy = 0;

  for (const account of accounts) {
    const transactions = await prisma.transaction.findMany({
      where: { accountId: account.id, isActive: true },
      select: { amountCents: true },
    });

    let ledger = new Decimal(0);
    for (const transaction of transactions) {
      ledger = ledger.plus(transaction.amountCents.toString());
    }

    const cache = new Decimal(account.balanceCents.toString());
    const diff = cache.minus(ledger);

    if (diff.isZero()) {
      healthy++;
      console.log(
        `  ✓ ${account.name}: ledger=${ledger.toString()} cache=${cache.toString()} diff=0 (no-op)`
      );
      continue;
    }

    const diffNumber = diff.toNumber();
    const type = diffNumber > 0 ? 'INCOME' : 'EXPENSE';
    const idempotencyKey = `repair-opening-balance-${account.id}`;

    await prisma.transaction.upsert({
      where: { idempotencyKey },
      update: {
        type,
        amountCents: BigInt(diffNumber),
        currency: account.currency,
        description: 'Saldo inicial',
        openingBalance: true,
        isActive: true,
        lastModifiedBy: account.userId,
      },
      create: {
        idempotencyKey,
        userId: account.userId,
        accountId: account.id,
        type,
        amountCents: BigInt(diffNumber),
        currency: account.currency,
        description: 'Saldo inicial',
        date: OPENING_BALANCE_DATE,
        openingBalance: true,
        createdBy: account.userId,
        lastModifiedBy: account.userId,
      },
    });

    await prisma.account.update({
      where: { id: account.id },
      data: { balanceCents: cache.toNumber(), lastReconciled: new Date() },
    });

    repaired++;
    console.log(
      `  ➕ ${account.name}: ledger=${ledger.toString()} cache=${cache.toString()} diff=${diff.toString()} → opening ${type}`
    );
  }

  console.log(`✅ Done. repaired=${repaired}, healthy=${healthy}, total=${accounts.length}`);
}

main()
  .catch((error) => {
    console.error('❌ Ledger repair failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
