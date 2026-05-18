/**
 * E2E Test Seed Script
 * Creates test data in the isolated E2E database (financetracker-postgres-e2e)
 *
 * Run via: npm run db:seed:e2e
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';

// Load environment variables from .env.e2e
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
const envResult = dotenv.config({ path: '.env.e2e' });
if (!envResult.error) {
  dotenvExpand.expand(envResult);
}

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required. Set it or use .env.e2e file.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const sharedPassword = process.env.E2E_TEST_PASSWORD || 'E2ePassword123';

async function upsertUser(email: string, name: string): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`✓ ${name} already exists: ${email}`);
    return;
  }
  // Minimal parameters for E2E test users — security is irrelevant here and
  // production-grade settings (memoryCost: 65536) cause 30-40s login times when
  // 3 parallel workers all verify passwords simultaneously on the same machine.
  const passwordHash = await argon2.hash(sharedPassword, {
    type: argon2.argon2id,
    memoryCost: 4096,
    timeCost: 1,
    parallelism: 1,
  });
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      baseCurrency: 'COP',
      language: 'SPANISH',
      theme: 'SYSTEM',
      baseSalaryCents: 500000000,
    },
  });
  console.log(`✓ ${name} created: ${email}`);
}

async function main() {
  console.log('🌱 Starting E2E seed...');

  // Three isolated users — one per feature file — so parallel workers never share account state.
  await upsertUser(
    process.env.E2E_TEST_USER || 'e2e@financetrackerpro.com',
    'E2E Test User',          // auth.feature
  );
  await upsertUser(
    process.env.E2E_ACCOUNTS_USER || 'accounts@e2e.financetrackerpro.com',
    'Accounts E2E User',      // accounts.feature
  );
  await upsertUser(
    process.env.E2E_DASHBOARD_USER || 'dashboard@e2e.financetrackerpro.com',
    'Dashboard E2E User',     // dashboard.feature
  );

  console.log('✅ E2E seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ E2E seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
