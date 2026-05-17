/**
 * Auth Helper for E2E Tests
 * Provides reusable authentication functions
 */

import type { Page } from '@playwright/test';

const E2E_USER = process.env.E2E_TEST_USER ?? 'e2e@financetrackerpro.com';
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123';

/**
 * Login as the E2E test user via the login form (Desktop)
 * Uses the desktop login form (visible on screens >= 768px)
 * Clears any existing session first to ensure fresh login.
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  await clearSession(page);
  await page.waitForLoadState('networkidle');

  // The desktop login form is the first form on the page
  const loginForm = page.locator('form').first();
  await loginForm.getByPlaceholder('Ingresa tu correo').fill(E2E_USER);
  await loginForm.getByPlaceholder('Ingresa tu contraseña').fill(E2E_PASSWORD);

  // Click the submit button
  await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();

  // Wait for redirect to dashboard
  await page.waitForURL(/\/es\/dashboard/, { timeout: 10000 });
}

/**
 * Clears session by removing cookies and local storage
 * Note: page must be navigated to a valid origin before accessing localStorage
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  // Navigate to a valid page before accessing localStorage
  await page.goto('/es/login');
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => localStorage.clear());
}
