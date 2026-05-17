/**
 * E2E Test Fixtures
 * Shared test data and configuration
 */

export const TEST_USER = {
  email: process.env.E2E_TEST_USER ?? 'e2e@financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'E2E Test User',
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
  es: [
    'Al menos 8 caracteres',
    'Una letra mayúscula',
    'Una letra minúscula',
    'Un número',
  ],
  en: [
    'At least 8 characters',
    'One uppercase letter',
    'One lowercase letter',
    'One number',
  ],
};
