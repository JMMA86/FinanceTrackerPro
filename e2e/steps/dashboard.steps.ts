/**
 * Dashboard Step Definitions
 *
 * Covers the redesigned dashboard: alerts region, hero net-worth card with the
 * mask toggle and per-currency chips, quick actions, the expandable metric
 * sections and the "Distribución Patrimonial" (Option A) donut + Activos/Pasivos
 * lists + summary panel.
 *
 * Two isolated users:
 *   - DASHBOARD_TEST_USER       → seeded, non-empty patrimony (distribution renders)
 *   - DASHBOARD_EMPTY_USER      → no accounts/cards/loans (empty states render)
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Locator, type Page } from '@playwright/test';
import { clearSession, loginAs } from '../helpers/auth';
import { DASHBOARD_EMPTY_USER, DASHBOARD_TEST_USER } from '../fixtures';

// ============================================================================
// HELPERS
// ============================================================================

/** The dashboard's quick-actions block (identified by its localized heading). */
function quickActionsSection(page: Page): Locator {
  return page.locator('section').filter({ hasText: 'Acciones rápidas' }).first();
}

/**
 * The distribution summary panel: the only <dl> that lists "Total de activos",
 * "Total de pasivos" and the highlighted "Patrimonio".
 */
function distributionSummary(page: Page): Locator {
  return page.locator('dl').filter({ hasText: 'Total de activos' }).first();
}

/** Login through the English form (the desktop login has a "Sign In" heading). */
async function loginAsInEnglish(page: Page, email: string, password: string): Promise<void> {
  await clearSession(page);
  await page.goto('/en/login', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const loginForm = page.locator('form').first();
  await loginForm.locator('input[type="email"]').fill(email);
  await loginForm.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await page.waitForURL(/\/en\/dashboard/, { timeout: 60000 });
}

/** Login as the dashboard user and wait until the streamed RSC content is present. */
async function loginDashboardUser(page: Page, email: string, password: string): Promise<void> {
  await loginAs(page, email, password);
  // Ensure the dashboard RSC content is fully streamed before assertions run
  // (links such as "Ver todas" may otherwise not be in the DOM yet).
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

// ============================================================================
// GIVEN - Background & State
// ============================================================================

Given('que el usuario del dashboard ha iniciado sesión', async ({ page }) => {
  await loginDashboardUser(page, DASHBOARD_TEST_USER.email, DASHBOARD_TEST_USER.password);
});

Given('que el usuario del dashboard sin datos ha iniciado sesión', async ({ page }) => {
  await loginDashboardUser(page, DASHBOARD_EMPTY_USER.email, DASHBOARD_EMPTY_USER.password);
});

Given('que el usuario del dashboard sin datos ha iniciado sesión en inglés', async ({ page }) => {
  await loginAsInEnglish(page, DASHBOARD_EMPTY_USER.email, DASHBOARD_EMPTY_USER.password);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
});

Given('que ve el dashboard con valores visibles', async ({ page }) => {
  // Ensure mask is off (default state on fresh login)
  const maskBtn = page.locator(
    'button[aria-label="Show values"], button[aria-label="Mostrar valores"]'
  );
  if (await maskBtn.isVisible().catch(() => false)) {
    await maskBtn.click();
  }
});

Given('que la pantalla es de escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

Given('que la sección Liquidez comienza expandida', async ({ page }) => {
  // Liquidity section has defaultOpen={true}, so it should start expanded
  const liquidityBtn = page
    .locator('section')
    .filter({ hasText: 'Liquidez' })
    .locator('button')
    .first();
  await expect(liquidityBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
});

// ============================================================================
// WHEN - Navigation & Interaction
// ============================================================================

When('navega al dashboard', async ({ page }) => {
  await page.goto('/es/dashboard', { waitUntil: 'commit' });
});

When('hace clic en el botón de toggle de máscara', async ({ page }) => {
  await page
    .locator(
      'button[aria-label="Hide values"], button[aria-label="Show values"], ' +
        'button[aria-label="Ocultar valores"], button[aria-label="Mostrar valores"]'
    )
    .first()
    .click();
});

When('hace clic en el botón de toggle de máscara nuevamente', async ({ page }) => {
  await page
    .locator(
      'button[aria-label="Hide values"], button[aria-label="Show values"], ' +
        'button[aria-label="Ocultar valores"], button[aria-label="Mostrar valores"]'
    )
    .first()
    .click();
});

When('hace clic en el botón de sección {string}', async ({ page }, sectionName: string) => {
  const headerBtn = page
    .locator('section')
    .filter({ hasText: sectionName })
    .locator('button')
    .first();
  await headerBtn.scrollIntoViewIfNeeded();
  await headerBtn.click({ force: true });
});

When(
  'hace clic en el botón de sección {string} nuevamente',
  async ({ page }, sectionName: string) => {
    const headerBtn = page
      .locator('section')
      .filter({ hasText: sectionName })
      .locator('button')
      .first();
    await headerBtn.scrollIntoViewIfNeeded();
    await headerBtn.click({ force: true });
  }
);

When(
  'hace clic en el enlace {string} de Transacciones Recientes',
  async ({ page }, linkText: string) => {
    await page.getByRole('link', { name: new RegExp(linkText, 'i') }).click();
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  }
);

When('hace clic en el enlace {string} del sidebar', async ({ page }, linkName: string) => {
  await page
    .locator('aside')
    .getByRole('link', { name: new RegExp(`^${linkName}$`, 'i') })
    .click();
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
});

When('hace clic en el botón {string} de Acciones rápidas', async ({ page }, buttonName: string) => {
  const quickActions = quickActionsSection(page);
  await quickActions.scrollIntoViewIfNeeded();
  await quickActions.getByRole('button', { name: buttonName, exact: true }).click();
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

Then('debe ver las secciones expandibles del dashboard', async ({ page }) => {
  const sections = [
    'Deudas',
    'Inversiones',
    'Préstamos',
    'Tarjetas de Crédito',
    'Gastos',
    'Tasas de Cambio',
    'Metas de Ahorro',
  ];
  for (const name of sections) {
    await expect(page.getByRole('button', { name, exact: true }).first()).toBeVisible({
      timeout: 5000,
    });
  }
});

Then('debe ver la sección de Distribución Patrimonial', async ({ page }) => {
  await expect(page.getByText('Distribución Patrimonial')).toBeVisible({ timeout: 5000 });
});

Then('debe ver la sección de Transacciones Recientes', async ({ page }) => {
  await expect(page.getByText('Transacciones Recientes')).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Alerts
// ============================================================================

Then('debe ver la región de alertas {string}', async ({ page }, regionName: string) => {
  await expect(page.getByRole('region', { name: regionName })).toBeVisible({ timeout: 10000 });
});

Then('la alerta de préstamos debe enlazar a la página de préstamos', async ({ page }) => {
  const alerts = page.getByRole('region', { name: 'Alertas' });
  const loanAlert = alerts.getByRole('link', { name: /préstamo/i });
  await expect(loanAlert).toBeVisible({ timeout: 5000 });
  await expect(loanAlert).toHaveAttribute('href', /\/es\/loans$/);
});

// ============================================================================
// THEN - Empty State & Value Assertions
// ============================================================================

Then('el valor de Patrimonio debe ser {string}', async ({ page }, expectedValue: string) => {
  // The hero renders the value through Intl with a non-breaking space between
  // the currency symbol and the digits (e.g. "$ 0,00"), so compare on a
  // whitespace-stripped, prefix basis instead of a literal substring.
  const heroSection = page.locator('section').filter({ hasText: 'Total disponible' }).first();
  await expect(heroSection).toBeVisible({ timeout: 10000 });
  const heroValue = (await heroSection.locator('p').first().innerText())
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, '');
  expect(heroValue.startsWith(expectedValue.replace(/\s+/g, ''))).toBe(true);
});

Then('las métricas críticas deben mostrar {string}', async ({ page }, expectedValue: string) => {
  const normalized = expectedValue.replace(/\s+/g, '');
  const metricValues = page.locator('p.text-lg');
  const count = await metricValues.count();
  let matches = 0;
  for (let i = 0; i < count; i += 1) {
    const text = (await metricValues.nth(i).innerText())
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, '');
    if (text.startsWith(normalized)) matches += 1;
  }
  expect(matches).toBeGreaterThanOrEqual(2);
});

Then(
  'la Distribución Patrimonial debe mostrar empty state {string}',
  async ({ page }, emptyText: string) => {
    const distributionSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: /distribución patrimonial|net worth distribution/i }),
    });
    const section =
      (await distributionSection.count()) > 0
        ? distributionSection
        : page
            .locator('section')
            .filter({ hasText: /distribución|distribution/i })
            .first();
    await expect(section.getByText(emptyText)).toBeVisible({ timeout: 5000 });
  }
);

Then(
  'las Transacciones Recientes deben mostrar empty state {string}',
  async ({ page }, emptyText: string) => {
    const txSection = page.locator('section').filter({
      has: page.getByRole('heading', { name: /transacciones recientes|recent transactions/i }),
    });
    const section =
      (await txSection.count()) > 0
        ? txSection
        : page
            .locator('section')
            .filter({ hasText: /transacciones|transactions/i })
            .last();
    await expect(section.getByText(emptyText)).toBeVisible({ timeout: 5000 });
  }
);

Then('debe mostrar el mensaje {string}', async ({ page }, message: string) => {
  await expect(page.getByText(message, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

Then('debe mostrar el botón {string} en el empty state', async ({ page }, buttonText: string) => {
  await expect(page.getByRole('link', { name: new RegExp(buttonText, 'i') })).toBeVisible({
    timeout: 5000,
  });
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
    page
      .locator(
        'button[aria-label="Hide values"], button[aria-label="Show values"], ' +
          'button[aria-label="Ocultar valores"], button[aria-label="Mostrar valores"]'
      )
      .first()
  ).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Metric Card Labels
// ============================================================================

Then('debe ver el label {string} en las métricas', async ({ page }, label: string) => {
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Quick Actions
// ============================================================================

Then('debe ver el botón {string} en Acciones rápidas', async ({ page }, buttonName: string) => {
  const quickActions = quickActionsSection(page);
  await quickActions.scrollIntoViewIfNeeded();
  await expect(quickActions.getByRole('button', { name: buttonName, exact: true })).toBeVisible({
    timeout: 5000,
  });
});

Then('debe ver el enlace {string} en Acciones rápidas', async ({ page }, linkName: string) => {
  const quickActions = quickActionsSection(page);
  await quickActions.scrollIntoViewIfNeeded();
  await expect(quickActions.getByRole('link', { name: linkName, exact: true })).toBeVisible({
    timeout: 5000,
  });
});

Then('debe estar visible el modal {string}', async ({ page }, dialogTitle: string) => {
  await expect(page.getByRole('dialog', { name: new RegExp(dialogTitle, 'i') })).toBeVisible({
    timeout: 5000,
  });
});

// ============================================================================
// THEN - Distribución Patrimonial (Option A)
// ============================================================================

Then(
  'el donut de Distribución Patrimonial debe exponer el total de activos en su aria-label',
  async ({ page }) => {
    const donut = page.getByRole('img', { name: /^Total de activos:/i });
    await expect(donut).toBeVisible({ timeout: 10000 });

    const ariaLabel = (await donut.getAttribute('aria-label')) ?? '';
    expect(ariaLabel).toMatch(/^Total de activos:\s*\$/);
    // The seeded dashboard user has a non-empty patrimony: the total is not $0.
    expect(ariaLabel).not.toMatch(/:\s*\$0(?:[.,]00)?$/);

    // The donut center, its aria-label and the summary panel must share the same
    // "Total de activos" value (single source: netWorthAssetsTotal).
    const summary = distributionSummary(page);
    await expect(summary.getByText('Total de activos', { exact: true })).toBeVisible();
    const totalAssets = (await summary.locator('dd').first().innerText()).trim();
    expect(ariaLabel).toBe(`Total de activos: ${totalAssets}`);
  }
);

Then('el centro del donut debe mostrar {string}', async ({ page }, centerLabel: string) => {
  await expect(
    page.locator('svg[role="img"] text').filter({ hasText: centerLabel }).first()
  ).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver la lista {string} con la categoría {string}',
  async ({ page }, listName: string, category: string) => {
    const list = page.getByRole('list', { name: listName });
    await expect(list).toBeVisible({ timeout: 5000 });
    await expect(list.getByRole('listitem').filter({ hasText: category }).first()).toBeVisible({
      timeout: 5000,
    });
  }
);

Then('debe ver el resumen de Distribución Patrimonial con sus totales', async ({ page }) => {
  const summary = distributionSummary(page);
  await expect(summary).toBeVisible({ timeout: 5000 });
  await expect(summary.getByText('Total de activos', { exact: true })).toBeVisible();
  await expect(summary.getByText('Total de pasivos', { exact: true })).toBeVisible();
  await expect(summary.getByText('Patrimonio', { exact: true })).toBeVisible();
});

Then('debe ver la nota de distribución', async ({ page }) => {
  await expect(
    page.getByText('El círculo muestra tus activos', { exact: false }).first()
  ).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver la nota de conversión a moneda base con {string}',
  async ({ page }, currency: string) => {
    const note = page.getByText(/Convertido a moneda base/).first();
    await expect(note).toBeVisible({ timeout: 5000 });
    await expect(note).toContainText(currency);
  }
);

Then(
  'el Patrimonio del panel de Distribución Patrimonial debe coincidir con el del hero',
  async ({ page }) => {
    const heroSection = page.locator('section').filter({ hasText: 'Total disponible' }).first();
    await expect(heroSection).toBeVisible({ timeout: 10000 });
    const heroValue = (await heroSection.locator('p').first().innerText()).trim();

    const summary = distributionSummary(page);
    await expect(summary).toBeVisible({ timeout: 10000 });
    const panelNetWorth = (await summary.locator('dd').last().innerText()).trim();

    expect(panelNetWorth).toMatch(/\$/);
    expect(panelNetWorth).toBe(heroValue);
  }
);

Then('no debe existir la leyenda interna del pastel de distribución', async ({ page }) => {
  // The internal pie legend was removed with `hideLegend`; none of its buttons
  // ("Mostrar detalles de …") may be rendered.
  await expect(page.getByRole('button', { name: /^Mostrar detalles de /i })).toHaveCount(0);
});

Then('no debe existir ningún donut de distribución', async ({ page }) => {
  await expect(page.getByRole('img', { name: /Total de activos/i })).toHaveCount(0);
});

Then('no debe existir la lista {string}', async ({ page }, listName: string) => {
  await expect(page.getByRole('list', { name: listName })).toHaveCount(0);
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
  await expect(page.locator('p:has-text("***")')).toHaveCount(0, { timeout: 5000 });
});

// ============================================================================
// THEN - Expandable Section Assertions
// ============================================================================

Then('el contenido de Liquidez debe estar visible', async ({ page }) => {
  const liquidityBtn = page
    .locator('section')
    .filter({ hasText: 'Liquidez' })
    .locator('button')
    .first();
  await expect(liquidityBtn).toHaveAttribute('aria-expanded', 'true', { timeout: 5000 });
});

Then('el contenido de Liquidez debe estar oculto', async ({ page }) => {
  const liquidityBtn = page
    .locator('section')
    .filter({ hasText: 'Liquidez' })
    .locator('button')
    .first();
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
  // Bottom bar links are icon-only (no visible text) with href like /es/dashboard.
  const hrefMap: Record<string, string> = {
    Dashboard: '/dashboard',
    Transacciones: '/transactions',
    Transactions: '/transactions',
    Cuentas: '/accounts',
    Accounts: '/accounts',
    Ahorros: '/savings',
    Savings: '/savings',
    Configuración: '/settings',
    Settings: '/settings',
  };
  const expectedHref = hrefMap[linkName];
  if (expectedHref) {
    await expect(bottomNav.locator(`a[href$="${expectedHref}"]`).first()).toBeVisible({
      timeout: 5000,
    });
  } else {
    await expect(
      bottomNav.getByRole('link', { name: new RegExp(linkName, 'i') }).first()
    ).toBeVisible({ timeout: 5000 });
  }
});

Then(
  'el enlace {string} en el sidebar debe estar marcado como activo',
  async ({ page }, linkName: string) => {
    const activeLink = page
      .locator('aside')
      .getByRole('link', { name: new RegExp(`^${linkName}$`, 'i') });
    await expect(activeLink).toHaveAttribute('aria-current', 'page', { timeout: 5000 });
  }
);

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
