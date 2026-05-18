/**
 * Auth Helper for E2E Tests
 * Provides reusable authentication functions
 */

import type { Page } from '@playwright/test';

const E2E_USER = process.env.E2E_TEST_USER ?? 'e2e@financetrackerpro.com';
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123';

/**
 * Clears session by removing cookies and local storage.
 * Navigates to /es/login so the origin is valid for localStorage access.
 */
export async function clearSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  // Use domcontentloaded then wait for networkidle so React finishes hydrating
  // before we interact with the form. Without this, form fills happen before
  // event handlers are attached and the Server Action click is a no-op.
  await page.goto('/es/login', { waitUntil: 'domcontentloaded' });
  // Cap at 10s so a busy dev server (HMR connections, background RSC compilations)
  // never causes a 2-minute hang. Warm servers settle in <3s; 10s is more than
  // enough for React to hydrate before we interact with the form.
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => localStorage.clear());
}

/**
 * Generic login helper. Clears the current session then signs in with the
 * given credentials via the Spanish desktop login form.
 */
export async function loginAs(page: Page, email: string, password: string): Promise<void> {
  await clearSession(page);
  const loginForm = page.locator('form').first();
  await loginForm.getByPlaceholder('Ingresa tu correo').fill(email);
  await loginForm.getByPlaceholder('Ingresa tu contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();
  // 60s: covers cold JIT-compile of the login action AND slow Argon2id on a loaded machine.
  await page.waitForURL(/\/es\/dashboard/, { timeout: 60000 });
}

/**
 * Login as the primary E2E test user (used by auth.feature).
 */
export async function loginAsTestUser(page: Page): Promise<void> {
  await loginAs(page, E2E_USER, E2E_PASSWORD);
}
