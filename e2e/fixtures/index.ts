/**
 * E2E Test Fixtures
 * Shared test data and configuration
 */

export const TEST_USER = {
  email: process.env.E2E_TEST_USER ?? 'e2e@financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'E2E Test User',
};

/** Isolated user for investments.feature — investment tests never touch other users' accounts. */
export const INVESTMENTS_TEST_USER = {
  email: process.env.E2E_INVESTMENTS_USER ?? 'investments@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Investments E2E User',
};

/** Isolated user for accounts.feature — accounts tests never touch the auth or dashboard users. */
export const ACCOUNTS_TEST_USER = {
  email: process.env.E2E_ACCOUNTS_USER ?? 'accounts@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Accounts E2E User',
};

/** Isolated user for dashboard.feature — this user never has accounts created, keeping $0 assertions stable. */
export const DASHBOARD_TEST_USER = {
  email: process.env.E2E_DASHBOARD_USER ?? 'dashboard@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Dashboard E2E User',
};

/** Isolated user for savings.feature — savings tests need pre-seeded accounts and goals. */
export const SAVINGS_TEST_USER = {
  email: process.env.E2E_SAVINGS_USER ?? 'savings@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Savings E2E User',
};

export const INVALID_CREDENTIALS = {
  email: 'nonexistent@test.com',
  password: 'WrongPass123',
};

export const NEW_USER = {
  name: 'New Test User',
  email: 'newuser@financetrackerpro.com',
  password: 'NewUserPass1',
};

export const WEAK_PASSWORD = 'abc';
export const SHORT_PASSWORD = 'Ab1';
export const NO_UPPER_PASSWORD = 'abcdefgh1';
export const NO_LOWER_PASSWORD = 'ABCDEFG1';
export const NO_NUMBER_PASSWORD = 'Abcdefgh';

export const PASSWORD_REQUIREMENTS_LABELS = {
  es: ['Al menos 8 caracteres', 'Una letra mayúscula', 'Una letra minúscula', 'Un número'],
  en: ['At least 8 characters', 'One uppercase letter', 'One lowercase letter', 'One number'],
};
