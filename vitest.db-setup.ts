/**
 * Vitest Database Setup
 * Uses TEST_DATABASE_URL for isolated test environment
 */

import 'dotenv/config';
import { beforeAll, afterAll, vi } from 'vitest';

const TEST_DB_NAME = 'financetrackerpro_test';
const TEST_DB_URL = process.env.DATABASE_URL || `postgresql://test:test@localhost:5432/${TEST_DB_NAME}`;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
});

afterAll(async () => {
  vi.clearAllMocks();
});

export { TEST_DB_NAME, TEST_DB_URL };