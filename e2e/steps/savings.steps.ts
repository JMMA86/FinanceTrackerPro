/**
 * Savings Goals Step Definitions
 * Tests for savings goals: create, contribute, edit, delete, and summary cards.
 *
 * Precondition goals/accounts are created by prisma/seed.e2e.ts and referenced
 * by name. Mutating scenarios create their own goals via the UI with UNIQUE
 * timestamp names (see helpers/unique.ts) so a CI retry (which does NOT reset
 * the DB between attempts) never collides with leftover rows.
 *
 * All navigation lives in When steps — a Given only establishes state.
 * No waitForTimeout/sleeps: Playwright auto-wait + auto-retry assertions.
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page, type Locator } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { SAVINGS_TEST_USER, SAVINGS_EMPTY_USER } from '../fixtures';
import { getAccountBalancesByEmail, getActiveGoalCurrentAmountByEmail } from '../helpers/db';
import {
  storeUniqueGoalName,
  getStoredGoalName,
  storeUniqueEditedGoalName,
  getStoredEditedGoalName,
  setWindowValue,
  getWindowValue,
} from '../helpers/unique';

// ============================================================================
// CONSTANTS
// ============================================================================

/** localStorage key for the pre-contribution account balances of the savings user. */
const SAVINGS_ACCOUNT_BALANCES_KEY = '__e2eSavingsAccountBalances';

// ============================================================================
// HELPERS
// ============================================================================

/** Gets the currently open <dialog> (native dialog with open attribute). */
function getOpenDialog(page: Page): Locator {
  return page.locator('dialog[open]').first();
}

/** Finds a savings-goal card (role=article) by visible name. */
function getGoalCard(page: Page, goalName: string): Locator {
  return page.getByRole('article').filter({ hasText: goalName }).first();
}

/**
 * Reveals a goal card's action buttons (they use opacity-0 group-hover:opacity-100)
 * and clicks the button whose aria-label starts with the given i18n action text.
 */
async function openCardAction(page: Page, goalName: string, actionPrefix: RegExp) {
  const card = getGoalCard(page, goalName);
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.hover();
  const actionBtn = card.getByRole('button', { name: actionPrefix }).first();
  await actionBtn.click();
  await waitForModalSettled(page);
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

/** Formats cents as es-CO COP, matching formatMoney() in production. */
function formatCop(cents: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Builds a regex from a money string like "$2.000,00" that also matches the
 * non-breaking space Intl.NumberFormat inserts between the currency symbol and
 * the amount ("$ 2.000,00"). Keeps Gherkin scenarios human-readable while the
 * assertion is robust to locale formatting.
 */
function moneyRegex(text: string): RegExp {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped.replace('\\$', '\\$\\s*'));
}

/**
 * Waits until an opened savings modal is fully mounted and its form state has
 * settled. The modals run reset() + a requestAnimationFrame on open (target
 * amount, contribution amount, etc. are rAF-driven state), so filling a field
 * before that rAF fires would get clobbered. The backdrop opacity reaches 1 only
 * after the rAF callback sets isVisible(true) → a deterministic "ready" signal.
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

// ============================================================================
// GIVEN - Authentication & State
// ============================================================================

Given('que el usuario de ahorros ha iniciado sesión', async ({ page }) => {
  await loginAs(page, SAVINGS_TEST_USER.email, SAVINGS_TEST_USER.password);
});

Given('que el usuario sin metas de ahorro ha iniciado sesión', async ({ page }) => {
  await loginAs(page, SAVINGS_EMPTY_USER.email, SAVINGS_EMPTY_USER.password);
});

Given('guarda los saldos actuales de las cuentas del usuario de ahorros', async ({ page }) => {
  const balances = await getAccountBalancesByEmail(SAVINGS_TEST_USER.email);
  await setWindowValue(page, SAVINGS_ACCOUNT_BALANCES_KEY, JSON.stringify(balances));
});

// ============================================================================
// WHEN - Navigation
// ============================================================================

When('navega a la página de ahorros', async ({ page }) => {
  await page.goto('/es/savings', { waitUntil: 'domcontentloaded' });
});

When('navega a la página de ahorros en inglés', async ({ page }) => {
  await page.goto('/en/savings', { waitUntil: 'domcontentloaded' });
});

// ============================================================================
// WHEN - Create Modal
// ============================================================================

When('abre el modal de creación de meta', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva Meta', exact: true }).click();
  await waitForModalSettled(page);
});

When('ingresa un nombre único de meta con prefijo {string}', async ({ page }, prefix: string) => {
  const name = await storeUniqueGoalName(page, prefix);
  await getOpenDialog(page).locator('#savings-name').fill(name);
});

When('selecciona el tipo de meta {string}', async ({ page }, typeName: string) => {
  const dialog = getOpenDialog(page);
  await dialog.locator('select#savings-type').selectOption({ label: typeName });
});

When('ingresa {string} en el monto objetivo', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#savings-target'), amount);
});

When('ingresa {string} en la contribución mensual', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#savings-monthly'), amount);
});

When('envía el formulario de creación de meta', async ({ page }) => {
  // Success path: onClose() closes the dialog and router.refresh() renders the
  // new card. Validation path: the dialog stays open with role="alert". The
  // corresponding Then step auto-waits for whichever outcome the scenario needs.
  await getOpenDialog(page).getByRole('button', { name: 'Crear Meta', exact: true }).click();
});

// ============================================================================
// WHEN - Contribute Modal
// ============================================================================

When('abre el modal de contribución para la meta {string}', async ({ page }, goalName: string) => {
  await openCardAction(page, goalName, /contribuir/i);
});

When('abre el modal de contribución para la meta con el nombre único', async ({ page }) => {
  await openCardAction(page, await getStoredGoalName(page), /contribuir/i);
});

When('ingresa {string} en el monto de contribución', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#contribute-amount'), amount);
});

When('selecciona la cuenta de origen para contribución', async ({ page }) => {
  const select = getOpenDialog(page).locator('#contribute-account');
  await expect(select).toBeEnabled({ timeout: 10000 });
  // The accounts load asynchronously after the modal mounts (dynamic import).
  const option = select.locator('option').filter({ hasText: 'Cuenta Corriente' }).first();
  await expect(option).toHaveCount(1, { timeout: 10000 });
  const value = await option.getAttribute('value');
  await select.selectOption(value ?? '');
});

When('confirma la contribución', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await dialog.getByRole('button', { name: /confirmar contribución/i }).click();
});

// ============================================================================
// WHEN - Edit Modal
// ============================================================================

When('abre el modal de edición para la meta {string}', async ({ page }, goalName: string) => {
  await openCardAction(page, goalName, /actualizar meta/i);
});

When('abre el modal de edición para la meta con el nombre único', async ({ page }) => {
  await openCardAction(page, await getStoredGoalName(page), /actualizar meta/i);
});

When(
  'cambia el nombre a un nombre único de meta con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniqueEditedGoalName(page, prefix);
    await getOpenDialog(page).locator('#edit-savings-name').fill(name);
  }
);

When('cambia el monto objetivo a {string}', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#edit-savings-target'), amount);
});

When('cambia el estado a {string}', async ({ page }, statusName: string) => {
  const dialog = getOpenDialog(page);
  await dialog.locator('select#edit-savings-status').selectOption({ label: statusName });
});

When('guarda los cambios de la meta', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
});

// ============================================================================
// WHEN - Delete Modal
// ============================================================================

When('abre el modal de eliminación para la meta {string}', async ({ page }, goalName: string) => {
  await openCardAction(page, goalName, /eliminar meta/i);
});

When('abre el modal de eliminación para la meta con el nombre único', async ({ page }) => {
  await openCardAction(page, await getStoredGoalName(page), /eliminar meta/i);
});

When('confirma la eliminación', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await dialog.getByRole('button', { name: 'Eliminar', exact: true }).last().click();
});

When('presiona Escape', async ({ page }) => {
  await page.keyboard.press('Escape');
});

// ============================================================================
// THEN - Summary Cards & Max Spendable
// ============================================================================

Then('debe ver la tarjeta {string}', async ({ page }, cardName: string) => {
  await expect(page.getByText(cardName, { exact: false }).first()).toBeVisible({ timeout: 10000 });
});

Then('debe ver la tarjeta {string} con desglose', async ({ page }, cardName: string) => {
  await expect(page.getByText(cardName, { exact: false }).first()).toBeVisible({ timeout: 10000 });
});

Then('debe ver la sección {string} en el desglose', async ({ page }, sectionName: string) => {
  await expect(page.getByText(sectionName, { exact: false }).first()).toBeVisible({
    timeout: 10000,
  });
});

Then('debe ver el mensaje de sobregiro {string}', async ({ page }, warningText: string) => {
  await expect(page.getByRole('alert').filter({ hasText: warningText }).first()).toBeVisible({
    timeout: 10000,
  });
});

// ============================================================================
// THEN - Goal card state
// ============================================================================

Then('la tarjeta {string} debe ser visible', async ({ page }, goalName: string) => {
  await expect(getGoalCard(page, goalName)).toBeVisible({ timeout: 10000 });
});

Then(
  'la tarjeta {string} debe mostrar insignia {string}',
  async ({ page }, goalName: string, badgeText: string) => {
    const card = getGoalCard(page, goalName);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText(badgeText, { exact: false }).first()).toBeVisible({
      timeout: 10000,
    });
    // Native <progress> exposes the "progressbar" role implicitly (no role
    // attribute in the DOM); the fill is exposed via the `value` attribute
    // (aria-valuenow is computed by the browser, not set as an attribute).
    await expect(card.getByRole('progressbar').first()).toHaveAttribute('value', '100');
  }
);

Then(
  'la tarjeta {string} debe mostrar progreso {string}',
  async ({ page }, goalName: string, progressText: string) => {
    const card = getGoalCard(page, goalName);
    await expect(card.getByText(progressText, { exact: false }).first()).toBeVisible({
      timeout: 10000,
    });
  }
);

Then('la tarjeta de meta con el nombre único debe ser visible', async ({ page }) => {
  const name = await getStoredGoalName(page);
  await expect(getGoalCard(page, name)).toBeVisible({ timeout: 15000 });
});

Then(
  'la tarjeta de meta con el nombre único debe mostrar el monto objetivo {string}',
  async ({ page }, targetText: string) => {
    const name = await getStoredGoalName(page);
    await expect(getGoalCard(page, name)).toContainText(moneyRegex(targetText), {
      timeout: 10000,
    });
  }
);

Then('la tarjeta de meta con el nombre editado debe ser visible', async ({ page }) => {
  const name = await getStoredEditedGoalName(page);
  await expect(getGoalCard(page, name)).toBeVisible({ timeout: 15000 });
});

Then(
  'la tarjeta de meta con el nombre editado debe mostrar el monto objetivo {string}',
  async ({ page }, targetText: string) => {
    const name = await getStoredEditedGoalName(page);
    await expect(getGoalCard(page, name)).toContainText(moneyRegex(targetText), {
      timeout: 10000,
    });
  }
);

Then('la tarjeta de meta con el nombre único debe desaparecer', async ({ page }) => {
  const name = await getStoredGoalName(page);
  await expect(getGoalCard(page, name)).toHaveCount(0, { timeout: 15000 });
});

// ============================================================================
// THEN - Contribution outcome
// ============================================================================

Then('debe ver el modal de contribución', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('h2')).toContainText('Contribuir');
});

Then('el modal de contribución debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 15000 });
});

Then('el botón de confirmar contribución debe estar deshabilitado', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('button', { name: /confirmar contribución/i })).toBeDisabled();
});

Then(
  'debe ver el error {string} en el modal de contribución',
  async ({ page }, message: string) => {
    const dialog = getOpenDialog(page);
    await expect(dialog.getByRole('alert').filter({ hasText: message }).first()).toBeVisible({
      timeout: 15000,
    });
  }
);

Then(
  'la tarjeta {string} debe reflejar el ahorro actual en la base de datos',
  async ({ page }, goalName: string) => {
    // Read the source-of-truth cached amount AFTER the contribution so the
    // assertion is correct even if a previous attempt already contributed.
    const currentCents = await getActiveGoalCurrentAmountByEmail(SAVINGS_TEST_USER.email, goalName);
    await expect(getGoalCard(page, goalName)).toContainText(formatCop(currentCents), {
      timeout: 15000,
    });
  }
);

Then(
  'la tarjeta {string} debe mostrar contribución reciente {string}',
  async ({ page }, goalName: string, contributionText: string) => {
    const card = getGoalCard(page, goalName);
    await expect(card.getByText(moneyRegex(contributionText)).first()).toBeVisible({
      timeout: 10000,
    });
  }
);

Then(
  'la cuenta {string} debe mostrar el saldo reducido en {int} por la contribución',
  async ({ page }, accountName: string, amountCents: number) => {
    const raw = await getWindowValue(page, SAVINGS_ACCOUNT_BALANCES_KEY);
    if (!raw) throw new Error('No pre-contribution account balances stored on the page');
    const balances = JSON.parse(raw) as Record<string, number>;
    const before = balances[accountName];
    if (before === undefined) {
      throw new Error(`No pre-contribution balance stored for account "${accountName}"`);
    }
    const expected = before - amountCents;
    const expectedNumber = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(expected / 100);
    const card = page.getByRole('button', { name: accountName, exact: true });
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText(expectedNumber, { timeout: 10000 });
  }
);

// ============================================================================
// THEN - Completed goal / blocked contribute
// ============================================================================

Then(
  'el botón de contribuir de la meta {string} debe estar deshabilitado',
  async ({ page }, goalName: string) => {
    const card = getGoalCard(page, goalName);
    await expect(card).toBeVisible({ timeout: 10000 });
    await card.hover();
    await expect(card.getByRole('button', { name: /contribuir/i }).first()).toBeDisabled();
  }
);

// ============================================================================
// THEN - Create Modal state
// ============================================================================

Then('el campo nombre de la meta debe estar marcado como inválido', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.locator('#savings-name')).toHaveAttribute('aria-invalid', 'true');
});

Then('el modal de creación de meta debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// THEN - Edit Modal state
// ============================================================================

Then('debe ver el error {string} en el modal de edición', async ({ page }, message: string) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('alert').filter({ hasText: message }).first()).toBeVisible({
    timeout: 15000,
  });
});

Then('el modal de edición de meta debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 15000 });
});

// ============================================================================
// THEN - Delete Modal state
// ============================================================================

Then('debe ver el modal de confirmación de eliminación', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('h2')).toHaveText('Eliminar Meta');
});

Then('debe ver el warning de contribuciones en el modal de eliminación', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(
    dialog
      .getByRole('alert')
      .filter({ hasText: 'No se puede eliminar una meta con contribuciones.' })
  ).toBeVisible({ timeout: 5000 });
});

Then('el botón de confirmar eliminación debe estar deshabilitado', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('button', { name: 'Eliminar', exact: true }).last()).toBeDisabled();
});

Then('el modal de eliminación debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// THEN - i18n (English)
// ============================================================================

Then('debe ver el botón {string} en la página de ahorros', async ({ page }, buttonName: string) => {
  await expect(page.getByRole('button', { name: buttonName, exact: true })).toBeVisible({
    timeout: 10000,
  });
});
