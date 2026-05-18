/**
 * Route and Server Action warmup — runs once before the full E2E suite.
 *
 * Next.js dev server JIT-compiles pages AND Server Actions on their first call.
 * With 3 parallel workers all hitting cold bundles simultaneously, compilation
 * takes 60-90s per bundle and overloads the server.
 *
 * This warmup test pre-compiles the key page routes AND Server Actions serially
 * so the main tests start on a fully warm server.
 */
import { test } from '@playwright/test';

const E2E_USER = process.env.E2E_TEST_USER ?? 'e2e@financetrackerpro.com';
const E2E_PASS = process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123';

test('warm up Next.js dev server routes and Server Actions', async ({ page }) => {
  // 1. Warm up the login page route
  await page.goto('/es/login', { waitUntil: 'networkidle', timeout: 120_000 });

  // 2. Warm up the login Server Action by submitting the form
  //    This triggers compilation of the auth action bundle.
  const form = page.locator('form').first();
  await form.getByPlaceholder('Ingresa tu correo').fill(E2E_USER);
  await form.getByPlaceholder('Ingresa tu contraseña').fill(E2E_PASS);
  await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();
  // Wait for dashboard redirect (confirms action compiled + executed)
  await page.waitForURL(/\/es\/dashboard/, { timeout: 120_000 });

  // 3. Warm up the accounts and dashboard pages while logged in
  await page.goto('/es/accounts', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
  await page.goto('/es/dashboard', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});

  // 4. Warm up the English login page (used by i18n tests)
  await page.context().clearCookies();
  await page.goto('/en/login', { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {});
});
