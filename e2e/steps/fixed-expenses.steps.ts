/**
 * Fixed Expenses Step Definitions
 * Covers the /fixed-expenses module: empty state, summary cards, seeded
 * templates, create, pay, recent payments, calendar day modal and the
 * upcoming-payments horizon selector.
 *
 * Precondition templates/accounts are created by prisma/seed.e2e.ts and
 * referenced by name. Mutating scenarios create their own expenses via the UI
 * with UNIQUE timestamp names (see helpers/unique.ts) so a CI retry (which does
 * NOT reset the DB between attempts) never collides with leftover rows.
 *
 * All navigation lives in When steps — a Given only establishes state.
 * No fixed timeouts: Playwright auto-wait + auto-retry assertions.
 *
 * PRODUCTION FINDING (mirrors transactions.steps.ts): after a mutation the app
 * calls router.refresh(), but Next.js 16 intermittently serves a stale RSC
 * payload, so the DOM is not always patched. The DB mutation IS applied. The
 * `expectWithRscReloadFallback` helper retries the assertion after a full page
 * reload when the fresh state does not appear — a genuinely failed mutation
 * still fails after the reload.
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page, type Locator } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { FIXED_EXPENSES_TEST_USER, FIXED_EXPENSES_EMPTY_USER } from '../fixtures';
import { getAccountBalanceByEmail } from '../helpers/db';
import {
  storeUniqueFixedExpenseName,
  getStoredFixedExpenseName,
  setWindowValue,
  getWindowValue,
} from '../helpers/unique';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Seeded CHECKING/COP account used as the payment source. */
const FIXED_EXPENSES_ACCOUNT_NAME = 'Cuenta Corriente';

/** localStorage key for the pre-payment account balance of the fixed-expenses user. */
const FIXED_EXPENSES_BALANCE_KEY = '__e2eFixedExpensesBalance';

/** localStorage key prefix for the upcoming-payments list counts per horizon. */
const UPCOMING_COUNT_KEY_PREFIX = '__e2eUpcomingCount_';

// ============================================================================
// HELPERS
// ============================================================================

/** Gets the currently open native <dialog> (with the open attribute). */
function getOpenDialog(page: Page): Locator {
  return page.locator('dialog[open]').first();
}

/** Finds a fixed-expense card (role=article) by visible name. */
function getExpenseCard(page: Page, expenseName: string): Locator {
  return page.getByRole('article').filter({ hasText: expenseName }).first();
}

/**
 * Waits until an opened fixed-expense modal is fully mounted and its form state
 * has settled. The dialogs run reset() + a requestAnimationFrame on open, so
 * filling a field before that rAF fires would get clobbered. The backdrop
 * opacity reaches 1 only after the rAF callback sets isVisible(true) → a
 * deterministic "ready" signal.
 */
async function waitForModalSettled(page: Page) {
  await page.waitForFunction(
    () => {
      const dialog = document.querySelector('dialog[open]');
      if (!dialog) return false;
      const backdrop = dialog.children[0] as HTMLElement | undefined;
      return !!backdrop && getComputedStyle(backdrop).opacity === '1';
    },
    undefined,
    { timeout: 5000 }
  );
}

/**
 * Fills a FormattedNumericInput (money in cents). The input only updates on
 * keyDown, so we clear with Backspace and type each digit (no native fill).
 */
async function fillCentsInput(input: Locator, digits: string) {
  await input.click();
  for (let i = 0; i < 12; i++) {
    await input.press('Backspace');
  }
  for (const digit of digits) {
    await input.press(digit);
  }
}

/**
 * Asserts a post-mutation state, retrying once after a full page reload when
 * Next.js serves a stale RSC payload (see file header). Locators are re-created
 * inside the callback so they re-resolve against the reloaded DOM.
 */
async function expectWithRscReloadFallback(
  page: Page,
  assertion: () => Promise<void>
): Promise<void> {
  try {
    await assertion();
  } catch (error) {
    console.log(
      '[fixed-expenses-refresh] stale RSC data — forcing full reload:',
      error instanceof Error ? error.message.split('\n')[0] : error
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await assertion();
  }
}

/**
 * Pays the first unpaid payment of a card through the card's "Pagar ahora"
 * button. The source account is auto-selected by the modal (first account in the
 * payment currency), so the prefilled form can be confirmed directly.
 */
async function payExpenseCard(page: Page, expenseName: string): Promise<void> {
  const card = getExpenseCard(page, expenseName);
  await expect(card).toBeVisible({ timeout: 15000 });
  await card
    .getByRole('button', { name: /^Pagar/ })
    .first()
    .click();
  await waitForModalSettled(page);

  const dialog = getOpenDialog(page);
  const confirm = dialog.getByRole('button', { name: /Confirmar Pago/i });
  await expect(confirm).toBeEnabled({ timeout: 15000 });
  await confirm.click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 15000 });
}

// ============================================================================
// GIVEN - Authentication & State
// ============================================================================

Given('que el usuario de gastos fijos ha iniciado sesión', async ({ page }) => {
  await loginAs(page, FIXED_EXPENSES_TEST_USER.email, FIXED_EXPENSES_TEST_USER.password);
});

Given('que el usuario sin gastos fijos ha iniciado sesión', async ({ page }) => {
  await loginAs(page, FIXED_EXPENSES_EMPTY_USER.email, FIXED_EXPENSES_EMPTY_USER.password);
});

Given('guarda el saldo actual de la cuenta de gastos fijos', async ({ page }) => {
  const balance = await getAccountBalanceByEmail(
    FIXED_EXPENSES_TEST_USER.email,
    FIXED_EXPENSES_ACCOUNT_NAME
  );
  await setWindowValue(page, FIXED_EXPENSES_BALANCE_KEY, String(balance));
});

// ============================================================================
// WHEN - Navigation & Views
// ============================================================================

When('navega a la página de gastos fijos', async ({ page }) => {
  await page.goto('/es/fixed-expenses', { waitUntil: 'domcontentloaded' });
});

When('navega a la página de gastos fijos en inglés', async ({ page }) => {
  await page.goto('/en/fixed-expenses', { waitUntil: 'domcontentloaded' });
});

When('cambia a la vista de calendario', async ({ page }) => {
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
});

When('hace clic en el primer día del calendario con pagos', async ({ page }) => {
  const dayButton = page.locator('button[aria-label^="Ver pagos del día"]').first();
  await expect(dayButton).toBeVisible({ timeout: 10000 });
  await dayButton.click();
});

// ============================================================================
// WHEN - Horizon selector
// ============================================================================

When('selecciona el horizonte de próximos pagos {string}', async ({ page }, rangeLabel: string) => {
  const button = page
    .getByRole('group', { name: 'Rango de próximos pagos' })
    .getByRole('button', { name: rangeLabel, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
});

When('guarda la cantidad de próximos pagos como {string}', async ({ page }, key: string) => {
  const count = await page.locator('aside[aria-label="Próximos pagos"] li').count();
  await setWindowValue(page, `${UPCOMING_COUNT_KEY_PREFIX}${key}`, String(count));
});

// ============================================================================
// WHEN - Create Modal
// ============================================================================

When('abre el modal de creación de gasto fijo', async ({ page }) => {
  // Two buttons share this name on the empty state (toolbar + CTA); the toolbar
  // button is first in DOM order and works on both pages.
  await page.getByRole('button', { name: 'Nuevo Gasto Fijo', exact: true }).first().click();
  await waitForModalSettled(page);
});

When(
  'ingresa un nombre único de gasto fijo con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniqueFixedExpenseName(page, prefix);
    await getOpenDialog(page).locator('#fixed-expense-name').fill(name);
  }
);

When('ingresa {string} en el monto del gasto fijo', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#fixed-expense-amount'), amount);
});

When('selecciona una fecha de fin anterior a la fecha de inicio', async ({ page }) => {
  const dialog = getOpenDialog(page);
  const startValue = await dialog.locator('#fixed-expense-start').inputValue();
  const [year, month, day] = startValue.split('-').map(Number);
  const previousDay = new Date(year, month - 1, day - 1);
  const endValue = [
    previousDay.getFullYear(),
    String(previousDay.getMonth() + 1).padStart(2, '0'),
    String(previousDay.getDate()).padStart(2, '0'),
  ].join('-');
  await dialog.locator('#fixed-expense-end').fill(endValue);
});

When('envía el formulario de creación de gasto fijo', async ({ page }) => {
  // Success path: onClose() closes the dialog and router.refresh() re-renders.
  // Validation path: the dialog stays open with role="alert".
  await getOpenDialog(page).locator('button[type="submit"]').click();
});

// ============================================================================
// WHEN - Pay
// ============================================================================

When('paga el gasto fijo {string} con la cuenta por defecto', async ({ page }, expenseName) => {
  await payExpenseCard(page, expenseName);
});

When('paga la tarjeta de gasto fijo con el nombre único', async ({ page }) => {
  const name = await getStoredFixedExpenseName(page);
  await payExpenseCard(page, name);
});

// ============================================================================
// THEN - Summary & Cards
// ============================================================================

Then('debe ver las tarjetas de resumen de gastos fijos', async ({ page }) => {
  const summary = page.getByRole('region', { name: 'Resumen' });
  await expect(summary).toBeVisible({ timeout: 10000 });
  await expect(summary.getByText('Comprometido del Mes', { exact: true })).toBeVisible();
  await expect(summary.getByText('Pagado este Mes', { exact: true })).toBeVisible();
  await expect(summary.getByText('Pendiente', { exact: true }).first()).toBeVisible();
  await expect(summary.getByText('Vencido', { exact: true }).first()).toBeVisible();
});

Then('debe ver la tarjeta de gasto fijo {string}', async ({ page }, expenseName: string) => {
  await expectWithRscReloadFallback(page, async () => {
    await expect(getExpenseCard(page, expenseName)).toBeVisible({ timeout: 8000 });
  });
});

Then(
  'debe ver la tarjeta de gasto fijo {string} con estado {string}',
  async ({ page }, expenseName: string, status: string) => {
    await expectWithRscReloadFallback(page, async () => {
      const card = getExpenseCard(page, expenseName);
      await expect(card).toBeVisible({ timeout: 8000 });
      // The header badge is the first "Pagado"/"Vencido"/"Pendiente" match in DOM
      // order (the compact payment history renders after it).
      await expect(card.getByText(status, { exact: true }).first()).toBeVisible({ timeout: 8000 });
    });
  }
);

Then('la tarjeta de gasto fijo con el nombre único debe ser visible', async ({ page }) => {
  const name = await getStoredFixedExpenseName(page);
  await expectWithRscReloadFallback(page, async () => {
    await expect(getExpenseCard(page, name)).toBeVisible({ timeout: 8000 });
  });
});

Then(
  'la tarjeta de gasto fijo con el nombre único debe mostrar el próximo pago',
  async ({ page }) => {
    const name = await getStoredFixedExpenseName(page);
    await expectWithRscReloadFallback(page, async () => {
      const card = getExpenseCard(page, name);
      await expect(card).toBeVisible({ timeout: 8000 });
      await expect(card.getByText('Próximo pago', { exact: false }).first()).toBeVisible({
        timeout: 8000,
      });
    });
  }
);

Then(
  'la tarjeta de gasto fijo con el nombre único no debe mostrar {string}',
  async ({ page }, text: string) => {
    const name = await getStoredFixedExpenseName(page);
    const card = getExpenseCard(page, name);
    await expect(card).toBeVisible({ timeout: 8000 });
    await expect(card.getByText(text, { exact: true })).toHaveCount(0, { timeout: 5000 });
  }
);

Then(
  'la tarjeta de gasto fijo con el nombre único debe mostrar exactamente 1 pago reciente',
  async ({ page }) => {
    const name = await getStoredFixedExpenseName(page);
    await expectWithRscReloadFallback(page, async () => {
      const card = getExpenseCard(page, name);
      await expect(card.getByText('Pagos recientes', { exact: true })).toBeVisible({
        timeout: 8000,
      });
      // The compact payment history is the only <ul> inside the card.
      await expect(card.getByRole('listitem')).toHaveCount(1, { timeout: 8000 });
    });
  }
);

Then('el pago reciente debe corresponder a la fecha de hoy', async ({ page }) => {
  const name = await getStoredFixedExpenseName(page);
  const card = getExpenseCard(page, name);
  const row = card.getByRole('listitem').first();
  await expect(row).toBeVisible({ timeout: 8000 });
  const text = (await row.textContent()) ?? '';
  const currentYear = new Date().getFullYear();
  expect(text).toContain(String(currentYear));
  // Never a future-year due date (e.g. 2027) in a settled payment row.
  expect(text).not.toContain(String(currentYear + 1));
});

// ============================================================================
// THEN - Payment balance
// ============================================================================

Then(
  'el saldo de la cuenta de gastos fijos debe haberse reducido en {int}',
  async ({ page }, amountCents: number) => {
    const raw = await getWindowValue(page, FIXED_EXPENSES_BALANCE_KEY);
    if (!raw) throw new Error('No pre-payment account balance stored on the page');
    const before = Number(raw);
    await expect
      .poll(
        () => getAccountBalanceByEmail(FIXED_EXPENSES_TEST_USER.email, FIXED_EXPENSES_ACCOUNT_NAME),
        { timeout: 15000 }
      )
      .toBe(before - amountCents);
  }
);

// ============================================================================
// THEN - Calendar day modal
// ============================================================================

Then('debe ver el modal del día con los pagos programados', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.getByText('Pagos del día', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('listitem').first()).toBeVisible();
});

// ============================================================================
// THEN - Horizon comparison
// ============================================================================

Then(
  'la cantidad de próximos pagos de {string} debe ser mayor que la de {string}',
  async ({ page }, greaterKey: string, lesserKey: string) => {
    const greaterRaw = await getWindowValue(page, `${UPCOMING_COUNT_KEY_PREFIX}${greaterKey}`);
    const lesserRaw = await getWindowValue(page, `${UPCOMING_COUNT_KEY_PREFIX}${lesserKey}`);
    if (greaterRaw === undefined || lesserRaw === undefined) {
      throw new Error('Upcoming payments counts were not stored for comparison');
    }
    expect(Number(greaterRaw)).toBeGreaterThan(Number(lesserRaw));
  }
);

// ============================================================================
// THEN - Validation modal state
// ============================================================================

Then('el campo nombre del gasto fijo debe estar marcado como inválido', async ({ page }) => {
  await expect(getOpenDialog(page).locator('#fixed-expense-name')).toHaveAttribute(
    'aria-invalid',
    'true'
  );
});

Then('el campo fecha de fin debe estar marcado como inválido', async ({ page }) => {
  await expect(getOpenDialog(page).locator('#fixed-expense-end')).toHaveAttribute(
    'aria-invalid',
    'true'
  );
});

Then('el modal de creación de gasto fijo debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// THEN - i18n (English)
// ============================================================================

Then(
  'debe ver el botón {string} en la página de gastos fijos',
  async ({ page }, buttonName: string) => {
    await expect(page.getByRole('button', { name: buttonName, exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
  }
);

Then('debe ver las tarjetas de resumen en inglés', async ({ page }) => {
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toBeVisible({ timeout: 10000 });
  await expect(summary.getByText('Committed This Month', { exact: true })).toBeVisible();
  await expect(summary.getByText('Paid This Month', { exact: true })).toBeVisible();
  await expect(summary.getByText('Pending', { exact: true }).first()).toBeVisible();
  await expect(summary.getByText('Overdue', { exact: true }).first()).toBeVisible();
});
