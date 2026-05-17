/**
 * E2E Test Seed Script
 * Creates test data in the isolated "e2e" schema
 *
 * Run: DATABASE_URL="postgresql://postgres:admin@localhost:5432/postgres?schema=e2e" npx tsx prisma/seed.e2e.ts
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

async function main() {
  console.log('🌱 Starting E2E seed...');

  // Create test user with known credentials for E2E tests
  const testEmail = process.env.E2E_TEST_USER || 'e2e@financetrackerpro.com';
  const testPassword = process.env.E2E_TEST_PASSWORD || 'E2ePassword123';

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email: testEmail },
  });

  if (existingUser) {
    console.log(`✓ E2E test user already exists: ${testEmail}`);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await argon2.hash(testPassword, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const user = await prisma.user.create({
    data: {
      email: testEmail,
      name: 'E2E Test User',
      passwordHash,
      baseCurrency: 'COP',
      language: 'SPANISH',
      theme: 'SYSTEM',
      baseSalaryCents: 500000000,
    },
  });

  console.log(`✓ E2E test user created: ${user.email}`);
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
