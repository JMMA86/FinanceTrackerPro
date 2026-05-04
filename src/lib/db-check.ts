/**
 * Database Connection Validation Script
 * Run: tsx src/lib/db-check.ts
 */

import { prisma } from '@/lib/db';
import { log } from '@/lib/logger';

try {
  log.info('Checking database connection...');

  // Test query: count users
  const userCount = await prisma.user.count();
  log.info({ userCount }, 'Database connection successful');

  // Test query: count accounts
  const accountCount = await prisma.account.count();
  log.info({ accountCount }, 'Account count retrieved');

  // Test query: count transactions
  const transactionCount = await prisma.transaction.count();
  log.info({ transactionCount }, 'Transaction count retrieved');

  log.info('Database validation complete ✓');
} catch (error) {
  log.error(
    { error: error instanceof Error ? error.message : error },
    'Database connection failed'
  );
  process.exit(1);
} finally {
  await prisma.$disconnect();
}

