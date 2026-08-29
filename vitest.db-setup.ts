/**
 * Vitest Database Setup
 * Isolates integration tests on a dedicated test database (financetrackerpro_test).
 *
 * - Sets PRISMA_E2E=1 (top-level, BEFORE test files are imported) so src/lib/env.ts
 *   skips loading .env. Without this, env.ts runs with override:true as soon as any
 *   action imports @/lib/db and stomps DATABASE_URL back to the DEV database.
 * - Points DATABASE_URL at TEST_DATABASE_URL (if set) or the dedicated
 *   postgres-test container on port 5434. Must be top-level: modules imported by
 *   test files (actions → @/lib/db) create the Prisma client at import time.
 */

import './src/lib/env';
import { afterAll, vi } from 'vitest';

const TEST_DB_NAME = 'financetrackerpro_test';
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || `postgresql://postgres:admin@localhost:5434/${TEST_DB_NAME}`;

process.env.PRISMA_E2E = '1';
process.env.DATABASE_URL = TEST_DB_URL;

afterAll(async () => {
  vi.clearAllMocks();
});

export { TEST_DB_NAME, TEST_DB_URL };
