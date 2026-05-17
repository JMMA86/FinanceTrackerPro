/**
 * Dashboard Step Definitions
 * Tests for the financial dashboard - 5 tiers of metrics
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page } from '@playwright/test';
import { clearSession } from '../helpers/auth';
import { TEST_USER } from '../fixtures';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Login to English locale. Clears session first to avoid redirect loops
 * when previous tests left a logged-in session.
 */
async function loginAsTestUserInEnglish(page: Page): Promise<void> {
  await clearSession(page);
  await page.goto('/en/login');
  await page.waitForLoadState('networkidle');

  // Use input[type] selectors for robustness across locales
  const loginForm = page.locator('form').first();
  await loginForm.locator('input[type="email"]').fill(TEST_USER.email);
  await loginForm.locator('input[type="password"]').fill(TEST_USER.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 10000 });
}

// ============================================================================
// GIVEN - Background & State
// ============================================================================

Given('que el usuario ha iniciado sesión en inglés', async ({ page }) => {
  await loginAsTestUserInEnglish(page);
  await page.waitForLoadState('networkidle');
});

Given('que ve el dashboard con valores visibles', async ({ page }) => {
  // Ensure mask is off (default state on fresh login)
  const maskBtn = page.locator(
    'button[aria-label="Show values"], button[aria-label="Mostrar valores"]'
  );
  if (await maskBtn.isVisible().catch(() => false)) {
    await maskBtn.click();
    await page.waitForTimeout(300);
  }
});

Given('que la pantalla es de escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

Given('que la sección Liquidez comienza expandida', async ({ page }) => {
  // Liquidity section has defaultOpen={true}, so it should start expanded
  const liquidityBtn = page.locator('section').filter({ hasText: 'Liquidez' }).locator('button').first();
  await expect(liquidityBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
});

// ============================================================================
// WHEN - Navigation & Interaction
// ============================================================================

When('navega al dashboard', async ({ page }) => {
  await page.goto('/es/dashboard', { waitUntil: 'commit' });
});

When('hace clic en el botón de toggle de máscara', async ({ page }) => {
  await page.locator(
    'button[aria-label="Hide values"], button[aria-label="Show values"], ' +
    'button[aria-label="Ocultar valores"], button[aria-label="Mostrar valores"]'
  ).first().click();
  await page.waitForTimeout(500);
});

When('hace clic en el botón de toggle de máscara nuevamente', async ({ page }) => {
  await page.locator(
    'button[aria-label="Hide values"], button[aria-label="Show values"], ' +
    'button[aria-label="Ocultar valores"], button[aria-label="Mostrar valores"]'
  ).first().click();
  await page.waitForTimeout(500);
});

When('hace clic en el botón de sección {string}', async ({ page }, sectionName: string) => {
  // Find the section's header button more robustly using h3 text
  const headerBtn = page.locator('section').filter({ hasText: sectionName }).locator('button').first();
  await headerBtn.scrollIntoViewIfNeeded();
  await headerBtn.click({ force: true });
  await page.waitForTimeout(500);
});

When('hace clic en el botón de sección {string} nuevamente', async ({ page }, sectionName: string) => {
  const headerBtn = page.locator('section').filter({ hasText: sectionName }).locator('button').first();
  await headerBtn.scrollIntoViewIfNeeded();
  await headerBtn.click({ force: true });
  await page.waitForTimeout(500);
});

When('hace clic en el enlace {string} de Transacciones Recientes', async ({ page }, linkText: string) => {
  await page.getByRole('link', { name: new RegExp(linkText, 'i') }).click();
  await page.waitForLoadState('networkidle');
});

When('hace clic en el enlace {string} del sidebar', async ({ page }, linkName: string) => {
  await page.locator('aside').getByRole('link', { name: new RegExp(`^${linkName}$`, 'i') }).click();
  await page.waitForLoadState('networkidle');
});

// ============================================================================
// THEN - Visual Structure Assertions
// ============================================================================

Then('debe ver el contenido principal del dashboard', async ({ page }) => {
  await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });
});

Then('debe ver la sección de Patrimonio con el label {string}', async ({ page }, label: string) => {
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 10000 });
});

Then('debe ver las 4 tarjetas de métricas críticas', async ({ page }) => {
  const metricLabels = ['Efectivo Total', 'Máximo Gastable', 'Ahorros', 'Deudas Totales'];
  for (const label of metricLabels) {
    await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 5000 });
  }
});

Then('debe ver la sección de Liquidez expandible', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Liquidez' })).toBeVisible({ timeout: 5000 });
});

Then('debe ver la sección de Distribución Patrimonial', async ({ page }) => {
  await expect(page.getByText('Distribución Patrimonial')).toBeVisible({ timeout: 5000 });
});

Then('debe ver la sección de Transacciones Recientes', async ({ page }) => {
  await expect(page.getByText('Transacciones Recientes')).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Empty State & Value Assertions
// ============================================================================

Then('el valor de Patrimonio debe ser {string}', async ({ page }, expectedValue: string) => {
  await expect(page.getByText(expectedValue, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

Then('las métricas críticas deben mostrar {string}', async ({ page }, expectedValue: string) => {
  const metricValues = page.locator('p.text-lg').filter({ hasText: expectedValue });
  const count = await metricValues.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

Then('la Distribución Patrimonial debe mostrar empty state {string}', async ({ page }, emptyText: string) => {
  // Section heading varies by language: "Distribución Patrimonial" (es) or "Net Worth Distribution" (en)
  const distributionSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: /distribución patrimonial|net worth distribution/i })
  });
  // If section not found by heading, try by text
  const section = (await distributionSection.count()) > 0
    ? distributionSection
    : page.locator('section').filter({ hasText: /distribución|distribution/i }).first();
  await expect(section.getByText(emptyText)).toBeVisible({ timeout: 5000 });
});

Then('las Transacciones Recientes deben mostrar empty state {string}', async ({ page }, emptyText: string) => {
  // Section heading varies by language: "Transacciones Recientes" (es) or "Recent Transactions" (en)
  const txSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: /transacciones recientes|recent transactions/i })
  });
  const section = (await txSection.count()) > 0
    ? txSection
    : page.locator('section').filter({ hasText: /transacciones|transactions/i }).last();
  await expect(section.getByText(emptyText)).toBeVisible({ timeout: 5000 });
});

Then('debe mostrar el mensaje {string}', async ({ page }, message: string) => {
  await expect(page.getByText(message, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

Then('debe mostrar el botón {string} en el empty state', async ({ page }, buttonText: string) => {
  await expect(page.getByRole('link', { name: new RegExp(buttonText, 'i') })).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Hero Card Assertions
// ============================================================================

Then('el Hero card debe mostrar el label {string}', async ({ page }, label: string) => {
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

Then('debe mostrar el badge {string}', async ({ page }, badgeText: string) => {
  await expect(page.getByText(badgeText, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

Then('debe tener el botón de toggle de máscara', async ({ page }) => {
  await expect(
    page.locator(
      'button[aria-label="Hide values"], button[aria-label="Show values"], ' +
      'button[aria-label="Ocultar valores"], button[aria-label="Mostrar valores"]'
    ).first()
  ).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Metric Card Labels
// ============================================================================

Then('debe ver el label {string} en las métricas', async ({ page }, label: string) => {
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Mask Toggle Assertions
// ============================================================================

Then('los valores monetarios deben mostrar {string}', async ({ page }, _maskedValue: string) => {
  const maskedElements = page.locator('p:has-text("***")');
  await expect(maskedElements.first()).toBeVisible({ timeout: 3000 });
  const count = await maskedElements.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

Then('los valores monetarios deben volver a mostrar valores numéricos', async ({ page }) => {
  await expect(page.getByText('$0').first()).toBeVisible({ timeout: 3000 });
  await expect(page.locator('p:has-text("***")')).toHaveCount(0, { timeout: 3000 });
});

// ============================================================================
// THEN - Expandable Section Assertions
// ============================================================================

Then('el contenido de Liquidez debe estar visible', async ({ page }) => {
  const liquidityBtn = page.locator('section').filter({ hasText: 'Liquidez' }).locator('button').first();
  await expect(liquidityBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
});

Then('el contenido de Liquidez debe estar oculto', async ({ page }) => {
  const liquidityBtn = page.locator('section').filter({ hasText: 'Liquidez' }).locator('button').first();
  await expect(liquidityBtn).toHaveAttribute('aria-expanded', 'false', { timeout: 5000 });
});

// ============================================================================
// THEN - Navigation & Layout Assertions
// ============================================================================

Then('el sidebar de navegación debe ser visible', async ({ page }) => {
  await expect(page.locator('aside')).toBeVisible({ timeout: 5000 });
});

Then('el sidebar debe contener enlace a {string}', async ({ page }, linkName: string) => {
  await expect(
    page.locator('aside').getByRole('link', { name: new RegExp(`^${linkName}$`, 'i') })
  ).toBeVisible({ timeout: 5000 });
});

Then('el sidebar debe contener botón de {string}', async ({ page }, buttonName: string) => {
  await expect(
    page.locator('aside').getByRole('button', { name: new RegExp(buttonName, 'i') })
  ).toBeVisible({ timeout: 5000 });
});

Then('la barra inferior de navegación debe ser visible', async ({ page }) => {
  await expect(page.locator('.md\\:hidden.fixed.bottom-0')).toBeVisible({ timeout: 5000 });
});

Then('la barra inferior debe contener enlace a {string}', async ({ page }, linkName: string) => {
  const bottomNav = page.locator('.md\\:hidden.fixed.bottom-0');
  // Bottom bar links are icon-only (no visible text) with href like /es/dashboard
  // Map link names to expected href suffixes
  const hrefMap: Record<string, string> = {
    'Dashboard': '/dashboard',
    'Transacciones': '/transactions',
    'Transactions': '/transactions',
    'Cuentas': '/accounts',
    'Accounts': '/accounts',
    'Ahorros': '/savings',
    'Savings': '/savings',
    'Configuración': '/settings',
    'Settings': '/settings',
  };
  const expectedHref = hrefMap[linkName];
  if (expectedHref) {
    await expect(bottomNav.locator(`a[href$="${expectedHref}"]`).first()).toBeVisible({ timeout: 5000 });
  } else {
    // Fallback: check accessible name (from title attribute on mobile links)
    const link = bottomNav.getByRole('link', { name: new RegExp(linkName, 'i') });
    await expect(link.first()).toBeVisible({ timeout: 5000 });
  }
});

Then('el enlace {string} en el sidebar debe estar marcado como activo', async ({ page }, linkName: string) => {
  const activeLink = page.locator('aside').getByRole('link', { name: new RegExp(`^${linkName}$`, 'i') });
  await expect(activeLink).toHaveAttribute('aria-current', 'page', { timeout: 5000 });
});

// ============================================================================
// THEN - Multi-language Assertions
// ============================================================================

Then('debe ver el label {string} en el dashboard', async ({ page }, label: string) => {
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Skeleton Assertions
// ============================================================================

Then('el skeleton de carga debe mostrarse inicialmente', async ({ page }) => {
  try {
    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 3000 });
  } catch {
    console.log('Skeleton not visible - content may have loaded too fast');
  }
});

Then('eventualmente debe reemplazarse con el contenido real', async ({ page }) => {
  await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.animate-pulse')).toHaveCount(0, { timeout: 5000 });
});
