/**
 * Vitest Database Setup
 * Isolates integration tests on a dedicated test database (financetrackerpro_test).
 *
 * - Sets PRISMA_E2E=1 so src/lib/env.ts skips loading .env (otherwise it would
 *   override DATABASE_URL back to the dev database with override:true).
 * - Points DATABASE_URL at TEST_DATABASE_URL (if set) or the dedicated
 *   postgres-test container on port 5434.
 */

import './src/lib/env';
import { beforeAll, afterAll, vi } from 'vitest';

const TEST_DB_NAME = 'financetrackerpro_test';
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL || `postgresql://postgres:admin@localhost:5434/${TEST_DB_NAME}`;

beforeAll(async () => {
  process.env.PRISMA_E2E = '1';
  process.env.DATABASE_URL = TEST_DB_URL;
});

afterAll(async () => {
  vi.clearAllMocks();
});

export { TEST_DB_NAME, TEST_DB_URL };
