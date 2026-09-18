/**
 * End-of-period projection Step Definitions.
 *
 * Covers the "Proyección de fin de período" dashboard section: the month/year
 * cards, the INDEPENDENT and COLLAPSED-BY-DEFAULT "Estado del salario" disclosure
 * and the explainable "¿Cómo se calculó?" breakdown — including the
 * "Inversiones a valor de mercado" line (with its FX note for USD/EUR accounts),
 * the variable-expense estimate and the RECEIVABLE product rule (only FUTURE
 * collections count as income).
 *
 * Users:
 *   - DASHBOARD_TEST_USER           → seeded salary + bonus + target + loans
 *   - INVESTMENTS_TEST_USER         → salary + USD investment arranged in the e2e DB
 *   - VARIABLE_EXPENSES_TEST_USER   → salary arranged in the e2e DB
 *
 * All DB arrangement happens in the ISOLATED `?schema=e2e` database (never the
 * development one) through `../helpers/projection`.
 */

import { createBdd, DataTable } from 'playwright-bdd';
const { Given, When, Then, After } = createBdd();
import { expect, type Locator, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import {
  DASHBOARD_TEST_USER,
  INVESTMENTS_TEST_USER,
  VARIABLE_EXPENSES_TEST_USER,
} from '../fixtures';
import {
  closeProjectionDb,
  ensureForeignInvestmentAccount,
  ensureSalaryConfiguration,
  getReceivableInstallmentCounts,
} from '../helpers/projection';

// ============================================================================
// HELPERS
// ============================================================================

/** The projection section (identified by its labelled heading). */
function projectionSection(page: Page): Locator {
  return page.locator('section[aria-labelledby="projection-title"]');
}

/** One projection window card ("Este mes" / "Este año"), matched by its heading. */
function projectionCard(page: Page, title: string): Locator {
  return projectionSection(page)
    .locator('article')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
}

/** The "Estado del salario" block inside one period card. */
function salaryBlock(page: Page, cardTitle: string): Locator {
  return projectionCard(page, cardTitle).locator('section[aria-label="Estado del salario"]');
}

/** The aria-controls id of the salary disclosure button of one period card. */
async function salaryPanelId(page: Page, cardTitle: string): Promise<string> {
  const controls = await salaryBlock(page, cardTitle)
    .locator('button')
    .first()
    .getAttribute('aria-controls');
  if (!controls) throw new Error(`Salary disclosure of "${cardTitle}" has no aria-controls`);
  return controls;
}

/** The breakdown panel ("¿Cómo se calculó?") of one period card. */
function breakdownPanel(page: Page, cardTitle: string): Locator {
  // `div[id^=...]`: the group headings inside the panel share the prefix in
  // their own ids (`projection-breakdown-month-inflows-heading`).
  return projectionCard(page, cardTitle).locator('div[id^="projection-breakdown-"]');
}

/** One explainable calculation row, matched by (part of) its label. */
function breakdownRow(page: Page, cardTitle: string, label: string): Locator {
  return breakdownPanel(page, cardTitle).locator('li').filter({ hasText: label });
}

async function loginAndWaitForDashboard(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await loginAs(page, email, password);
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
}

// ============================================================================
// HOOKS
// ============================================================================

After({ tags: '@projection', name: 'Close projection DB client' }, async () => {
  await closeProjectionDb();
});

// ============================================================================
// GIVEN - Authentication (arranging the missing preconditions in the e2e DB)
// ============================================================================

Given(
  'que el usuario de inversiones con sueldo proyectable ha iniciado sesión',
  async ({ page }) => {
    await ensureSalaryConfiguration(INVESTMENTS_TEST_USER.email, {
      amountCents: 500_000_000,
      frequency: 'MONTHLY',
      payDays: [1],
    });
    await ensureForeignInvestmentAccount(INVESTMENTS_TEST_USER.email);
    await loginAndWaitForDashboard(
      page,
      INVESTMENTS_TEST_USER.email,
      INVESTMENTS_TEST_USER.password
    );
  }
);

Given(
  'que el usuario de gastos variables con sueldo proyectable ha iniciado sesión',
  async ({ page }) => {
    await ensureSalaryConfiguration(VARIABLE_EXPENSES_TEST_USER.email, {
      amountCents: 400_000_000,
      frequency: 'MONTHLY',
      payDays: [1],
    });
    await loginAndWaitForDashboard(
      page,
      VARIABLE_EXPENSES_TEST_USER.email,
      VARIABLE_EXPENSES_TEST_USER.password
    );
  }
);

// ============================================================================
// WHEN - Interaction
// ============================================================================

When('abre el detalle del salario de {string}', async ({ page }, cardTitle: string) => {
  const button = salaryBlock(page, cardTitle).locator('button').first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
});

When('abre el desglose de la proyección de {string}', async ({ page }, cardTitle: string) => {
  const card = projectionCard(page, cardTitle).first();
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: /¿Cómo se calculó\?/ }).click();
  await expect(breakdownPanel(page, cardTitle)).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Structure
// ============================================================================

Then('debe ver la sección de proyección {string}', async ({ page }, title: string) => {
  const section = projectionSection(page);
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole('heading', { name: title, exact: true })).toBeVisible({
    timeout: 10000,
  });
});

Then(
  'la proyección debe mostrar las tarjetas {string} y {string}',
  async ({ page }, firstTitle: string, secondTitle: string) => {
    await expect(projectionCard(page, firstTitle).first()).toBeVisible({ timeout: 10000 });
    await expect(projectionCard(page, secondTitle).first()).toBeVisible({ timeout: 10000 });
  }
);

Then(
  'cada tarjeta de proyección debe mostrar su cierre proyectado y su disponible restante',
  async ({ page }) => {
    for (const cardTitle of ['Este mes', 'Este año']) {
      const card = projectionCard(page, cardTitle).first();
      await expect(card.getByText('Cierre proyectado', { exact: true })).toBeVisible({
        timeout: 5000,
      });
      await expect(card.getByText('Disponible restante', { exact: true })).toBeVisible({
        timeout: 5000,
      });
      // The projected closing balance renders a real currency amount.
      await expect(card.locator('dd').first()).toContainText('$');
    }
  }
);

// ============================================================================
// THEN - Salary status disclosure
// ============================================================================

Then(
  'el bloque {string} de {string} debe estar cerrado',
  async ({ page }, blockTitle: string, cardTitle: string) => {
    const block = salaryBlock(page, cardTitle);
    await expect(block).toBeVisible({ timeout: 5000 });
    await expect(block).toHaveAttribute('aria-label', blockTitle);
    await expect(block.locator('button').first()).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(`#${await salaryPanelId(page, cardTitle)}`)).toBeHidden();
  }
);

Then(
  'el bloque {string} de {string} debe estar abierto',
  async ({ page }, blockTitle: string, cardTitle: string) => {
    const block = salaryBlock(page, cardTitle);
    await expect(block).toHaveAttribute('aria-label', blockTitle);
    await expect(block.locator('button').first()).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#${await salaryPanelId(page, cardTitle)}`)).toBeVisible();
  }
);

Then(
  'el detalle del salario de {string} debe mostrar {string} y {string}',
  async ({ page }, cardTitle: string, firstLabel: string, secondLabel: string) => {
    const panel = page.locator(`#${await salaryPanelId(page, cardTitle)}`);
    await expect(panel.getByText(firstLabel, { exact: true })).toBeVisible({ timeout: 5000 });
    await expect(panel.getByText(secondLabel, { exact: true })).toBeVisible({ timeout: 5000 });
  }
);

// ============================================================================
// THEN - Breakdown
// ============================================================================

Then(
  'el desglose de {string} debe incluir las líneas:',
  async ({ page }, cardTitle: string, dataTable: DataTable) => {
    for (const label of dataTable.raw().flat()) {
      await expect(breakdownRow(page, cardTitle, label).first()).toBeVisible({ timeout: 5000 });
    }
  }
);

Then(
  'el desglose de {string} debe incluir el capital y el interés de préstamos por cobrar',
  async ({ page }, cardTitle: string) => {
    await expect(
      breakdownRow(page, cardTitle, 'Capital de préstamos por cobrar').first()
    ).toBeVisible({ timeout: 5000 });
    await expect(
      breakdownRow(page, cardTitle, 'Interés de préstamos por cobrar').first()
    ).toBeVisible({ timeout: 5000 });
  }
);

/**
 * Product rule: RECEIVABLE collections count as income ONLY when they are
 * FUTURE. The expected count is computed from the e2e database with the exact
 * projection window (`dueDate >= today`, `dueDate <= end of year`), and the spec
 * first proves that the user DOES own overdue installments — so counting them
 * (the bug) would make this assertion fail.
 */
Then(
  'el desglose de {string} debe contar solo los cobros futuros del préstamo por cobrar',
  async ({ page }, cardTitle: string) => {
    const counts = await getReceivableInstallmentCounts(DASHBOARD_TEST_USER.email);
    expect(counts.totalPending).toBeGreaterThan(counts.futureInWindow);

    const row = breakdownRow(page, cardTitle, 'Capital de préstamos por cobrar').first();
    await expect(row).toBeVisible({ timeout: 5000 });

    const text = await row.innerText();
    const match = /(\d+)\s+cuota/.exec(text);
    expect(match, `Expected a "N cuota(s)" count label in: ${text}`).not.toBeNull();
    expect(Number(match?.[1])).toBe(counts.futureInWindow);
  }
);

Then(
  'el desglose de {string} debe incluir las inversiones a valor de mercado con su tasa aplicada',
  async ({ page }, cardTitle: string) => {
    const row = breakdownRow(page, cardTitle, 'Inversiones a valor de mercado').first();
    await expect(row).toBeVisible({ timeout: 5000 });

    // Rule 9 (FX traceability): a foreign-currency investment line shows the
    // ORIGINAL amount plus the applied rate.
    const text = await row.innerText();
    expect(text).toContain('Original:');
    expect(text).toContain('Tasa aplicada:');
  }
);

Then(
  'el desglose de {string} debe incluir la estimación de gastos variables',
  async ({ page }, cardTitle: string) => {
    await expect(
      breakdownRow(page, cardTitle, 'Estimación de gastos variables').first()
    ).toBeVisible({ timeout: 5000 });
  }
);
