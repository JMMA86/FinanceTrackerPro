/**
 * Credit Cards Step Definitions
 *
 * E2E tests for the credit-cards module that lives inside the Accounts page
 * (CreditCardsSection) plus the transactions-page integration (card consumption,
 * "Pagar Tarjeta" button, pay-card modal) and the transfer restriction.
 *
 * Data isolation: every consumption/payment/delete scenario creates its own
 * card through the UI with a unique timestamp name (e2e/helpers/unique.ts), so
 * the seeded cards ("Visa E2E", "Mastercard E2E") stay deterministic for the
 * whole run — the seed assertions always see debt/available = seed values.
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page, type Locator } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { CREDIT_CARDS_TEST_USER } from '../fixtures';
import { selectAccount } from '../helpers/select';
import {
  storeUniqueCardName,
  getStoredCardName,
  storeUniqueEditedCardName,
  getStoredEditedCardName,
} from '../helpers/unique';

// ============================================================================
// CONSTANTS
// ============================================================================

/** localStorage key where the unique transaction description is stored by
 *  `ingresa una descripción única` (transactions.steps.ts). Reused here so the
 *  credit-card consume scenarios can locate their EXPENSE row. */
const TX_DESC_KEY = '__e2eUniqueTxDescription';

// ============================================================================
// HELPERS
// ============================================================================

/** The create-card modal dialog (accessible name from aria-labelledby → h2 "Nueva Tarjeta"). */
function getCreateCardDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Nueva Tarjeta' });
}

/** The edit-card modal dialog (h2 "Editar"). */
function getEditCardDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Editar' });
}

/** The delete-card confirmation dialog (h2 "Eliminar Tarjeta"). */
function getDeleteCardDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Eliminar Tarjeta' });
}

/** The pay-card modal dialog (h2 "Pagar Tarjeta" + the selected card name). */
function getPayCardDialog(page: Page) {
  return page.getByRole('dialog', { name: /Pagar Tarjeta/ });
}

/** The create-transaction modal dialog (reused from transactions.steps.ts pattern). */
function getTxDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Crear transacción' });
}

/** Fills a FormattedNumericInput (keyDown-driven: clear with Backspace + type digits). */
async function fillNumericInput(page: Page, locator: Locator, amountStr: string) {
  await locator.click();
  for (let i = 0; i < 12; i++) {
    await locator.press('Backspace');
  }
  for (const digit of amountStr) {
    await locator.press(digit);
  }
  await page.waitForTimeout(200);
}

/** Reads the unique transaction description stored by `ingresa una descripción única`. */
async function getStoredTxDescription(page: Page): Promise<string> {
  const description = await page.evaluate((key) => {
    return window.localStorage.getItem(key) ?? undefined;
  }, TX_DESC_KEY);
  if (!description) throw new Error('No unique transaction description stored on the page');
  return description;
}

/**
 * Extracts the DEUDA and Disponible numbers from a card's inner text.
 * Card layout: "DEUDA $ 1.500,00 ... Disponible: $ 8.500,00".
 */
function parseCardDebtAndAvailable(cardText: string): { debt: string; available: string } {
  const debtMatch = cardText.match(/DEUDA\s*\$?\s*([\d.,]+)/);
  const availMatch = cardText.match(/Disponible:\s*\$?\s*([\d.,]+)/);
  if (!debtMatch?.[1] || !availMatch?.[1]) {
    throw new Error(`Could not parse DEUDA/Disponible from card text: "${cardText}"`);
  }
  return { debt: debtMatch[1], available: availMatch[1] };
}

/** Asserts a card (by its button aria-label) shows the given DEUDA and Disponible numbers. */
async function expectCardDebtAndAvailable(
  page: Page,
  cardName: string,
  debt: string,
  available: string
) {
  const card = page.getByRole('button', { name: cardName, exact: true });
  await expect(card).toBeVisible({ timeout: 10000 });
  const text = ((await card.innerText()) ?? '').replace(/\n+/g, ' ');
  const parsed = parseCardDebtAndAvailable(text);
  expect(parsed.debt).toBe(debt);
  expect(parsed.available).toBe(available);
}

// ============================================================================
// GIVEN - State
// ============================================================================

Given('que el usuario de tarjetas ha iniciado sesión', async ({ page }) => {
  await loginAs(page, CREDIT_CARDS_TEST_USER.email, CREDIT_CARDS_TEST_USER.password);
});

// ============================================================================
// WHEN - Navigation
// ============================================================================

When('navega a la página de tarjetas antigua', async ({ page }) => {
  await page.goto('/es/credit-cards', { waitUntil: 'domcontentloaded' });
});

// ============================================================================
// WHEN - Create card modal
// ============================================================================

When('abre el modal de nueva tarjeta', async ({ page }) => {
  await page
    .getByRole('button', { name: /Nueva Tarjeta/i })
    .first()
    .click();
  await expect(getCreateCardDialog(page)).toBeVisible({ timeout: 5000 });
});

When(
  'ingresa un nombre único de tarjeta con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniqueCardName(page, prefix);
    await getCreateCardDialog(page).locator('#cc-name').fill(name);
  }
);

When('ingresa {string} en el campo límite de crédito', async ({ page }, limit: string) => {
  await fillNumericInput(page, getCreateCardDialog(page).locator('#cc-limit'), limit);
});

When('ingresa {string} en el campo día de corte', async ({ page }, day: string) => {
  await getCreateCardDialog(page).locator('#cc-cutoff').fill(day);
});

When('ingresa {string} en el campo día de pago', async ({ page }, day: string) => {
  await getCreateCardDialog(page).locator('#cc-due').fill(day);
});

When('selecciona la red {string}', async ({ page }, network: string) => {
  // Network picker buttons carry aria-pressed; label text = Visa/Mastercard/Amex/Ninguna.
  const dialog = getCreateCardDialog(page);
  await dialog
    .locator('button[aria-pressed]')
    .filter({ hasText: new RegExp(network, 'i') })
    .first()
    .click();
});

When('envía el formulario de creación de tarjeta', async ({ page }) => {
  const dialog = getCreateCardDialog(page);
  await dialog.getByRole('button', { name: 'Crear Tarjeta', exact: true }).click();
  // Dialog closes on success (closeModal). 60s covers cold JIT of the server action.
  try {
    await expect(dialog).not.toBeVisible({ timeout: 60000 });
  } catch {
    const alerts = dialog.locator('[role="alert"]');
    const alertCount = await alerts.count();
    let alertText = '';
    for (let i = 0; i < alertCount; i++) {
      alertText += (await alerts.nth(i).textContent()) + ' | ';
    }
    console.log(`Create card dialog still open. Alerts: "${alertText}"`);
    throw new Error(`Credit card creation failed. Alerts: ${alertText}`);
  }
});

// ============================================================================
// WHEN - Transactions page integration
// ============================================================================

When('abre el modal de nueva transacción', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva transacción', exact: true }).click();
  await expect(getTxDialog(page)).toBeVisible({ timeout: 5000 });
});

When('selecciona la tarjeta recién creada como cuenta', async ({ page }) => {
  const cardName = await getStoredCardName(page);
  // The create-transaction AccountSelect groups cards under "Tarjetas de Crédito"
  // (only for EXPENSE). The option's accessible name starts with the card name.
  await selectAccount(page, 'Cuenta', cardName);
});

When(
  'intenta ingresar {string} en el campo valor de la tarjeta',
  async ({ page }, amount: string) => {
    const dialog = getTxDialog(page);
    await fillNumericInput(page, dialog.getByRole('textbox', { name: 'Valor' }), amount);
  }
);

When('cierra el modal de transacción con Cancelar', async ({ page }) => {
  const dialog = getTxDialog(page);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

// ============================================================================
// WHEN - Account select groups (INCOME hides credit cards)
// ============================================================================

When('abre el selector de cuenta', async ({ page }) => {
  const combo = page.getByRole('combobox', { name: 'Cuenta' });
  await combo.click();
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// WHEN - Card detail
// ============================================================================

When('abre el detalle de la tarjeta recién creada', async ({ page }) => {
  const cardName = await getStoredCardName(page);
  const card = page.getByRole('button', { name: cardName, exact: true });
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.click();
  // The detail overlay expands with a 300ms clip-path animation + content fade.
  await page.waitForTimeout(1200);
});

When('hace clic en "Pagar" en el detalle de la tarjeta', async ({ page }) => {
  await page.getByRole('button', { name: 'Pagar', exact: true }).click();
  await page.waitForTimeout(800);
});

When('hace clic en "Editar" en el detalle de la tarjeta', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
  await page.waitForTimeout(600);
});

When('hace clic en eliminar en el detalle de la tarjeta', async ({ page }) => {
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await page.waitForTimeout(600);
});

When('cierra el detalle de la tarjeta', async ({ page }) => {
  // Back button in the detail top bar (detail.back = "Tarjetas").
  await page.getByRole('button', { name: 'Tarjetas', exact: true }).click();
  // Detail shrink animation (240ms) + router.refresh() on close.
  await page.waitForTimeout(1800);
});

// ============================================================================
// WHEN - Pay card modal
// ============================================================================

When('selecciona la tarjeta recién creada en el modal de pago', async ({ page }) => {
  const cardName = await getStoredCardName(page);
  const dialog = getPayCardDialog(page);
  const select = dialog.locator('#pay-card');
  if ((await select.count()) > 0) {
    // The card selector is only rendered when more than one payable card exists
    // (e.g. the seeded Visa E2E + the scenario-created card).
    const option = select
      .locator('option')
      .filter({ hasText: new RegExp('^' + cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })
      .first();
    // <option> elements are never "visible" in the DOM — assert presence by count.
    await expect(option).toHaveCount(1, { timeout: 5000 });
    await select.selectOption({ value: (await option.getAttribute('value')) ?? '' });
    await page.waitForTimeout(300);
  }
  // The header shows the selected card name; the debt info reflects it.
  await expect(dialog).toContainText(cardName, { timeout: 5000 });
});

When('selecciona {string} como cuenta de origen', async ({ page }, accountName: string) => {
  // PayCreditCardModal source AccountSelect (label "Cuenta de origen"), split
  // into Cuentas/Bolsillos groups.
  await selectAccount(page, 'Cuenta de origen', accountName);
});

When('ingresa {string} en el campo monto a pagar', async ({ page }, amount: string) => {
  const dialog = getPayCardDialog(page);
  await fillNumericInput(page, dialog.getByRole('textbox', { name: /Monto a pagar/i }), amount);
});

When('confirma el pago de la tarjeta', async ({ page }) => {
  const dialog = getPayCardDialog(page);
  await dialog.getByRole('button', { name: 'Confirmar Pago', exact: true }).click();
  // On success onClose() + router.refresh() — the dialog animates out (~240ms).
  await expect(dialog).not.toBeVisible({ timeout: 15000 });
});

// ============================================================================
// WHEN - Delete card modal
// ============================================================================

When('confirma la eliminación de la tarjeta', async ({ page }) => {
  const dialog = getDeleteCardDialog(page);
  await dialog.locator('button').filter({ hasText: 'Eliminar' }).last().click();
  // On success the modal waits 1s, closes, dispatches finance:credit-card-deleted
  // (detail closes + card deletion animation) and router.refresh() re-renders.
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 15000 });
});

When('confirma la eliminación de la tarjeta esperando rechazo', async ({ page }) => {
  const dialog = getDeleteCardDialog(page);
  const deleteBtn = dialog.locator('button').filter({ hasText: 'Eliminar' }).last();
  await deleteBtn.click();
  // CARD_HAS_BALANCE keeps the dialog OPEN and renders the error inline; wait for
  // the server to respond (button re-enables after the rejected action).
  await expect(deleteBtn).toBeEnabled({ timeout: 15000 });
  await page.waitForTimeout(300);
});

When('cierra el modal de confirmación de tarjeta', async ({ page }) => {
  const dialog = getDeleteCardDialog(page);
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).last().click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

// ============================================================================
// WHEN - Edit card modal
// ============================================================================

When(
  'cambia el nombre de la tarjeta a un nombre único con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniqueEditedCardName(page, prefix);
    await getEditCardDialog(page).locator('#edit-cc-name').fill(name);
  }
);

When(
  'ingresa {string} en el campo límite de crédito del modal de edición',
  async ({ page }, limit: string) => {
    await fillNumericInput(page, getEditCardDialog(page).locator('#edit-cc-limit'), limit);
  }
);

When(
  'ingresa {string} en el campo día de corte del modal de edición',
  async ({ page }, day: string) => {
    await getEditCardDialog(page).locator('#edit-cc-cutoff').fill(day);
  }
);

When(
  'ingresa {string} en el campo día de pago del modal de edición',
  async ({ page }, day: string) => {
    await getEditCardDialog(page).locator('#edit-cc-due').fill(day);
  }
);

When('guarda los cambios de la tarjeta', async ({ page }) => {
  const dialog = getEditCardDialog(page);
  await dialog.getByRole('button', { name: 'Guardar Cambios', exact: true }).click();
  // Edit modal closes on success (60s covers cold JIT of updateCreditCard).
  try {
    await expect(dialog).not.toBeVisible({ timeout: 60000 });
  } catch {
    const alerts = dialog.locator('[role="alert"]');
    const alertCount = await alerts.count();
    let alertText = '';
    for (let i = 0; i < alertCount; i++) {
      alertText += (await alerts.nth(i).textContent()) + ' | ';
    }
    console.log(`Edit card dialog still open. Alerts: "${alertText}"`);
    throw new Error(`Credit card update failed. Alerts: ${alertText}`);
  }
});

// ============================================================================
// THEN - Visual / content
// ============================================================================

Then('debe ver la sección {string}', async ({ page }, sectionTitle: string) => {
  await expect(
    page.getByRole('heading', { level: 2, name: sectionTitle, exact: false })
  ).toBeVisible({ timeout: 5000 });
});

Then(
  'la tarjeta {string} debe mostrar deuda {string} y disponible {string}',
  async ({ page }, name: string, debt: string, available: string) => {
    await expectCardDebtAndAvailable(page, name, debt, available);
  }
);

Then(
  'la tarjeta recién creada debe mostrar deuda {string} y disponible {string}',
  async ({ page }, debt: string, available: string) => {
    const name = await getStoredCardName(page);
    await expectCardDebtAndAvailable(page, name, debt, available);
  }
);

Then('la tarjeta recién creada no debe registrar consumos', async ({ page }) => {
  const name = await getStoredCardName(page);
  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const card = page.getByRole('button', { name, exact: true });
  await expect(card).toBeVisible({ timeout: 10000 });
  const text = ((await card.innerText()) ?? '').replace(/\n+/g, ' ');
  const parsed = parseCardDebtAndAvailable(text);
  expect(parsed.debt).toBe('0,00');
});

// ============================================================================
// THEN - Create card
// ============================================================================

Then('la tarjeta debe crearse exitosamente', async ({ page }) => {
  // Success closes the dialog (CreateCreditCardModal.onSubmit → closeModal).
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// THEN - Consumption
// ============================================================================

Then('la transacción creada debe aparecer en la tabla como gasto negativo', async ({ page }) => {
  const description = await getStoredTxDescription(page);
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
  const row = table
    .getByRole('row')
    .filter({ hasText: description })
    .filter({ hasText: 'Gasto' })
    .first();
  await expect(row).toBeVisible({ timeout: 10000 });
  // EXPENSE on a card renders a debit: rose-400 amount prefixed with "-". The
  // type badge also uses text-rose-400 but has no digits — filter to the amount.
  const amount = row.locator('span.text-rose-400').filter({ hasText: /[0-9]/ }).first();
  await expect(amount).toBeVisible({ timeout: 5000 });
  await expect(amount).toHaveText(/-/);
});

Then(
  'el detalle de tarjeta debe mostrar la deuda actual {string}',
  async ({ page }, debt: string) => {
    await expect(page.getByText('DEUDA ACTUAL').first()).toBeVisible({ timeout: 5000 });
    const body = await page.evaluate(() => document.body.innerText);
    const m = body.match(/DEUDA ACTUAL\s+\$?\s*([\d.,]+)/);
    expect(m?.[1]).toBe(debt);
  }
);

// ============================================================================
// THEN - Credit-limit guard
// ============================================================================

Then(
  'el campo valor no debe aceptar el monto que excede el crédito disponible',
  async ({ page }) => {
    const dialog = getTxDialog(page);
    const amountInput = dialog.getByRole('textbox', { name: 'Valor' });
    const display = await amountInput.inputValue();
    // es-CO display "600,00" → 60000 cents. The client guard (maxValue = available
    // credit) blocks the digit that would take the value above the limit, so the
    // field can never hold the full attempted amount (600000 → "6.000,00").
    const cents = Math.round(parseFloat(display.replace(/\./g, '').replace(',', '.')) * 100);
    expect(cents).toBeGreaterThan(0);
    expect(cents).toBeLessThan(600000);
  }
);

// ============================================================================
// THEN - Account select groups
// ============================================================================

Then('el selector de cuenta no debe mostrar el grupo {string}', async ({ page }, group: string) => {
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible({ timeout: 5000 });
  await expect(listbox.getByText(group, { exact: true })).toHaveCount(0);
});

Then('el selector de cuenta debe mostrar el grupo {string}', async ({ page }, group: string) => {
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible({ timeout: 5000 });
  await expect(listbox.getByText(group, { exact: true })).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Pay card
// ============================================================================

Then('el modal de pagar tarjeta debe estar visible', async ({ page }) => {
  await expect(getPayCardDialog(page)).toBeVisible({ timeout: 5000 });
});

Then('el modal de pagar tarjeta debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

Then('no debe abrirse el modal de pagar tarjeta', async ({ page }) => {
  // All cards without debt → the "Pagar Tarjeta" button only shows a toast and
  // never mounts the pay-card modal.
  await expect(page.getByRole('dialog', { name: /Pagar Tarjeta/ })).toHaveCount(0, {
    timeout: 3000,
  });
});

Then('debe ver la notificación {string}', async ({ page }, message: string) => {
  // ToastViewport renders notifications in a role="status" aria-live="polite"
  // region (auto-dismisses after ~5s — assert quickly).
  const statusRegion = page.locator('[role="status"][aria-live="polite"]');
  await expect(statusRegion.getByText(message)).toBeVisible({ timeout: 4000 });
});

Then('debe ver la fila de pago de tarjeta con monto positivo', async ({ page }) => {
  const cardName = await getStoredCardName(page);
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
  const row = table
    .getByRole('row')
    .filter({ hasText: cardName })
    .filter({ hasText: 'Pago de tarjeta' })
    .first();
  await expect(row).toBeVisible({ timeout: 10000 });
  // CREDIT_PAYMENT renders a credit: emerald-400 amount prefixed with "+".
  const amount = row.locator('span.text-emerald-400').first();
  await expect(amount).toBeVisible({ timeout: 5000 });
  await expect(amount).toHaveText(/\+/);
});

// ============================================================================
// THEN - Edit card
// ============================================================================

Then('debe ver el modal de edición de tarjeta', async ({ page }) => {
  await expect(getEditCardDialog(page)).toBeVisible({ timeout: 5000 });
});

Then('el modal de edición de tarjeta debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

Then('el grid debe mostrar la tarjeta editada con el nuevo nombre', async ({ page }) => {
  const name = await getStoredEditedCardName(page);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 10000 });
});

Then('la tarjeta editada debe mostrar disponible {string}', async ({ page }, available: string) => {
  const name = await getStoredEditedCardName(page);
  const card = page.getByRole('button', { name, exact: true });
  await expect(card).toBeVisible({ timeout: 5000 });
  const text = ((await card.innerText()) ?? '').replace(/\n+/g, ' ');
  const parsed = parseCardDebtAndAvailable(text);
  expect(parsed.available).toBe(available);
});

// ============================================================================
// THEN - Delete card
// ============================================================================

Then('debe ver el modal de confirmación de tarjeta {string}', async ({ page }, title: string) => {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('h2')).toHaveText(title);
});

Then(
  'debe ver el error {string} dentro del modal de confirmación de tarjeta',
  async ({ page }, message: string) => {
    const dialog = getDeleteCardDialog(page);
    await expect(dialog.getByRole('alert').filter({ hasText: message })).toBeVisible({
      timeout: 5000,
    });
  }
);

Then('la tarjeta recién creada debe seguir en el grid', async ({ page }) => {
  const name = await getStoredCardName(page);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 10000 });
});

Then('la tarjeta recién creada no debe estar en el grid', async ({ page }) => {
  const name = await getStoredCardName(page);
  // The card disappears after the deletion animation + router.refresh().
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0, {
    timeout: 15000,
  });
});

// ============================================================================
// THEN - Transfers (cards are NOT transfer sources/destinations)
// ============================================================================

Then(
  'las opciones del campo origen no deben incluir {string}',
  async ({ page }, accountName: string) => {
    const dialog = page.getByRole('dialog', { name: 'Transferir entre cuentas' });
    const combo = dialog.getByRole('combobox', { name: /cuenta origen/i });
    await combo.click();
    const listbox = dialog.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 5000 });
    const options = await listbox.getByRole('option').allTextContents();
    expect(options.some((o) => o.toLowerCase().includes(accountName.toLowerCase()))).toBeFalsy();
    // Close the dropdown by clicking OUTSIDE it but INSIDE the dialog (the modal
    // header title). Pressing Escape would also close the native <dialog>.
    await dialog.getByRole('heading', { name: 'Transferir entre cuentas' }).click();
    await expect(listbox).not.toBeVisible({ timeout: 5000 });
  }
);
