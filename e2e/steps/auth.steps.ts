/**
 * Auth Step Definitions
 * Step definitions for login and registration flows
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect } from '@playwright/test';
import { loginAsTestUser, clearSession } from '../helpers/auth';
import { TEST_USER } from '../fixtures';

// Unique email for registration tests (timestamp-based to avoid collisions)
function uniqueEmail(): string {
  return `e2e-${Date.now()}@financetrackerpro.com`;
}

// ============================================================================
// GIVEN - Background & State
// ============================================================================

Given('que el usuario navega a la página de login en español', async ({ page }) => {
  // clearSession already navigates to /es/login and waits for networkidle (full hydration).
  // A second goto would re-trigger hydration with only domcontentloaded, causing React to reset
  // controlled input values before steps can interact with the form.
  await clearSession(page);
});

Given('navega a la página de login en español', async ({ page }) => {
  await clearSession(page);
});

Given('que el usuario no ha iniciado sesión', async ({ page }) => {
  await clearSession(page);
});

Given('que el usuario ha iniciado sesión', async ({ page }) => {
  await loginAsTestUser(page);
});

Given('que la pantalla es móvil {int}x{int}', async ({ page }, width: number, height: number) => {
  await page.setViewportSize({ width, height });
});

Given('que existe un usuario con email {string}', async ({ page }, _email: string) => {
  // The E2E test user is seeded in the database before tests run
  // This step is informational - no action needed
  // The user "e2e@financetrackerpro.com" already exists from seed
  await clearSession(page);
});

// ============================================================================
// WHEN - Login Actions
// ============================================================================

When('ingresa credenciales válidas en el formulario de login desktop', async ({ page }) => {
  // Ensure React has hydrated before filling. If the prior navigation step's networkidle
  // cap fired too early on a busy server, clicking would trigger the native form submit
  // instead of React's onSubmit, which posts to the Server Action URL and loses the
  // redirect= query param on the response (resulting in /es/login? with a bare ?).
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  const loginForm = page.locator('form').first();
  const emailInput = loginForm.locator('input[type="email"]');
  const passwordInput = loginForm.locator('input[type="password"]');
  await emailInput.fill(TEST_USER.email);
  await passwordInput.fill(TEST_USER.password);
  await loginForm.locator('button[type="submit"]').click();
});

When('ingresa el email {string} en el login desktop', async ({ page }, email: string) => {
  const loginForm = page.locator('form').first();
  await loginForm.getByPlaceholder('Ingresa tu correo').fill(email);
});

When('ingresa la contraseña {string} en el login desktop', async ({ page }, password: string) => {
  const loginForm = page.locator('form').first();
  await loginForm.getByPlaceholder('Ingresa tu contraseña').fill(password);
});

When('hace clic en {string}', async ({ page }, buttonName: string) => {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
});

When('hace clic en {string} sin llenar campos', async ({ page }, buttonName: string) => {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
});

When('navega directamente a {string}', async ({ page }, path: string) => {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
});

When('navega a {string}', async ({ page }, path: string) => {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
});

When('hace clic en {string} en el sidebar', async ({ page }, buttonName: string) => {
  await page.getByRole('button', { name: buttonName, exact: true }).click();
});

// ============================================================================
// WHEN - Register Actions (Desktop)
// ============================================================================

When('cambia a modo registro en desktop', async ({ page }) => {
  // The sliding panel button (z-20) switches between login and register modes
  // In login mode, it says "Registrarse" to switch to register
  await page.locator('.z-20 button').click();
  // Wait for slide animation to complete
  await page.waitForTimeout(1000);
});

When('ingresa {string} en el campo nombre del registro desktop', async ({ page }, name: string) => {
  await page.locator('#name-desktop').fill(name);
});

When('ingresa un email único en el registro desktop', async ({ page }) => {
  // Store the email for later use in login
  const email = uniqueEmail();
  await page.locator('#email-desktop').fill(email);
  // Store in page context for later use
  await page.evaluate((e) => { (window as Window & typeof globalThis & { __e2eRegisterEmail?: string }).__e2eRegisterEmail = e; }, email);
});

When('ingresa {string} en el email del registro desktop', async ({ page }, email: string) => {
  await page.locator('#email-desktop').fill(email);
});

When('ingresa {string} en el campo contraseña del registro desktop', async ({ page }, password: string) => {
  await page.locator('#password-desktop').fill(password);
});

When('hace clic en {string} en el registro desktop', async ({ page }, _buttonName: string) => {
  const registerForm = page.locator('form').filter({ has: page.locator('#password-desktop') });
  await registerForm.locator('button[type="submit"]').click();
});

When('intenta enviar el formulario de registro vacío', async ({ page }) => {
  const registerForm = page.locator('form').filter({ has: page.locator('#password-desktop') });
  await expect(registerForm.locator('button[type="submit"]')).toBeDisabled();
});

When('escribe caracteres en el campo contraseña del registro desktop', async ({ page }) => {
  // Type a character to show the password requirements checklist
  await page.locator('#password-desktop').fill('a');
});

// ============================================================================
// WHEN - Language Actions
// ============================================================================

When('cambia el idioma a {string} en el selector de idioma', async ({ page }, language: string) => {
  // Click the language selector toggle button
  await page.locator('.relative .bg-slate-700').first().click();
  
  // Click the language option in the dropdown
  await page.locator('.absolute.right-0 button').filter({ hasText: language }).click();
  // networkidle ensures the new locale page is fully hydrated before we check text content.
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
});

// ============================================================================
// WHEN - Mobile Actions
// ============================================================================

When('hace clic en {string} en el toggle mobile', async ({ page }, _linkText: string) => {
  // Mobile toggle link is at the bottom of the mobile form
  await page.locator('.md\\:hidden button').last().click();
});

// ============================================================================
// THEN - Common Assertions
// ============================================================================

Then('debe ser redirigido al dashboard', async ({ page }) => {
  // 40s: first call to the login Server Action may need JIT-compile time.
  await expect(page).toHaveURL(/\/es\/dashboard/, { timeout: 40000 });
});

Then('debe ser redirigido a la página de login', async ({ page }) => {
  await expect(page).toHaveURL(/\/es\/login/, { timeout: 30000 });
});

Then('debe ser redirigido a {string}', async ({ page }, path: string) => {
  await expect(page).toHaveURL(new RegExp(path.replace(/\//g, '\\/')), { timeout: 40000 });
});

Then('debe ver un mensaje de error de login', async ({ page }) => {
  // Login error: div with bg-red-900/20 class (no role="alert")
  await expect(page.locator('.bg-red-900\\/20')).toBeVisible({ timeout: 10000 });
});

Then('debe ver un mensaje de error en el registro', async ({ page }) => {
  // Register error: div with role="alert" and id="error-desktop"
  // 40s: first call to the register action needs JIT-compile time under parallel server load.
  await expect(page.locator('#error-desktop')).toBeVisible({ timeout: 40000 });
});

Then('la validación HTML5 debe impedir el envío del formulario de login', async ({ page }) => {
  // Check that we're still on the login page (form wasn't submitted)
  await expect(page).toHaveURL(/\/es\/login/);
  // HTML5 validation prevents submission when required fields are empty
  // No network request should have been made
});

Then('la validación HTML5 debe impedir el envío del formulario de registro desktop', async ({ page }) => {
  // Check that we're still on the login page
  await expect(page).toHaveURL(/\/es\/login/);
  // The register form should still be in register mode
  // And no success/error message appeared
});

// ============================================================================
// THEN - Register Assertions
// ============================================================================

Then('debe ver un mensaje de éxito de registro en el formulario de login', async ({ page }) => {
  // After successful registration, the mode switches to login
  // and a success message is shown in a div with bg-green-900/20
  // 40s: the register Server Action needs to JIT-compile on its first call.
  await expect(page.locator('.bg-green-900\\/20')).toBeVisible({ timeout: 40000 });
});

Then('el botón de registro debe estar deshabilitado', async ({ page }) => {
  // The register submit button is the last button[type="submit"]
  await expect(page.locator('button[type="submit"]').last()).toBeDisabled();
});

Then('el botón de registro debe estar habilitado', async ({ page }) => {
  await expect(page.locator('button[type="submit"]').last()).toBeEnabled();
});

Then('los {int} requisitos de contraseña deben mostrarse sin cumplir', async ({ page }, count: number) => {
  // Password requirements checklist is visible when password is not empty
  // The checklist appears in desktop register form when password has value
  const desktopRegisterForm = page.locator('form').filter({ has: page.locator('#password-desktop') });
  const checklistContainer = desktopRegisterForm.locator('.rounded-lg.border');
  await expect(checklistContainer).toBeVisible();
  
  // Count the requirement items (there should be 4)
  const items = checklistContainer.locator('li');
  await expect(items).toHaveCount(count);
});

Then('los {int} requisitos de contraseña deben estar cumplidos', async ({ page }, count: number) => {
  // All password requirements should be satisfied
  const desktopRegisterForm = page.locator('form').filter({ has: page.locator('#password-desktop') });
  const checklistContainer = desktopRegisterForm.locator('.rounded-lg.border');
  await expect(checklistContainer).toBeVisible();
  
  // Count green items (text-green-400 font-medium for satisfied requirements)
  const greenItems = checklistContainer.locator('li span.text-green-400');
  await expect(greenItems).toHaveCount(count);
});

// ============================================================================
// THEN - Language Assertions
// ============================================================================

Then('los textos del login deben estar en inglés', async ({ page }) => {
  // Check key English text using unique selectors
  await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  await expect(page.getByText('Email Address').first()).toBeVisible();
  await expect(page.getByText('Password').first()).toBeVisible();
});

Then('la URL debe contener {string}', async ({ page }, urlPart: string) => {
  await expect(page).toHaveURL(new RegExp(urlPart));
});

Then('debe ser redirigido al dashboard con idioma inglés', async ({ page }) => {
  await expect(page).toHaveURL(/\/en\/dashboard/, { timeout: 40000 });
});

// ============================================================================
// THEN - Mobile Assertions
// ============================================================================

Then('debe ver el formulario de login mobile', async ({ page }) => {
  // Mobile login form: the mobile container (.md:hidden) should be visible
  const mobileForm = page.locator('.md\\:hidden form');
  await expect(mobileForm).toBeVisible();
  
  // Should show login title - use heading role for unique match
  await expect(page.getByRole('heading', { name: 'Inicia Sesión' })).toBeVisible();
});

Then('debe ver el formulario de registro mobile', async ({ page }) => {
  // Mobile register form should show register fields
  // Use the mobile heading (it's inside .md:hidden with opacity-100)
  await expect(page.getByRole('heading', { name: 'Crear Cuenta' })).toBeVisible();
  
  // Name field should be visible (it's animated in for register mode)
  const nameInput = page.locator('.md\\:hidden input[type="text"]');
  await expect(nameInput).toBeVisible();
});
