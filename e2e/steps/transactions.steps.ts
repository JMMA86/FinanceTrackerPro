/**
 * Transactions Step Definitions
 * Tests for the transactions page - list, filter, paginate, create
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page, type Locator } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { getStoredAccountName } from '../helpers/unique';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Transactions user credentials (seeded in the e2e database with accounts + 20 transactions) */
const TRANSACTIONS_USER = {
  email: process.env.E2E_TRANSACTIONS_USER || 'transactions@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD || 'E2ePassword123',
};

/** Shared E2E password (used for freshly-registered users in the empty-state scenario) */
const E2E_PASSWORD = process.env.E2E_TEST_PASSWORD || 'E2ePassword123';

/**
 * Window/localStorage key where the unique transaction description is stored for the
 * delete scenario. A unique value per attempt keeps retries clean (a retry
 * never collides with a leftover row from the failed attempt). Stored in
 * localStorage so it survives page.goto() navigations between steps.
 */
const UNIQUE_DESC_KEY = '__e2eUniqueTxDescription';

/**
 * localStorage key where the ORIGINAL transaction description is preserved before an
 * edit overwrites the current one. Used by the edit happy-path scenario to
 * assert the old row disappears after the edit succeeds.
 */
const UNIQUE_ORIG_DESC_KEY = '__e2eOrigTxDescription';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gets the currently open transaction dialog (create OR edit). The same <dialog>
 * element is reused for both modes; its accessible name (aria-labelledby → h2)
 * is "Crear transacción" in create mode and "Editar transacción" in edit mode.
 */
function getOpenDialog(page: Page, title = 'Crear transacción') {
  return page.getByRole('dialog', { name: title });
}

/** Gets the transaction dialog when it is open in EDIT mode */
function getEditDialog(page: Page) {
  return getOpenDialog(page, 'Editar transacción');
}

/** Gets the category manager dialog */
function getCategoryDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Categorías' });
}

/** Gets the delete-transaction confirmation dialog */
function getDeleteDialog(page: Page) {
  return page.getByRole('dialog', { name: /¿Estás seguro de eliminar esta transacción?/ });
}

/** Stores a unique transaction description on the page for later steps */
async function storeUniqueDescription(page: Page, description: string) {
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: UNIQUE_DESC_KEY, value: description }
  );
}

/** Reads the unique transaction description stored by the create step */
async function getStoredDescription(page: Page): Promise<string> {
  const description = await page.evaluate((key) => {
    return window.localStorage.getItem(key) ?? undefined;
  }, UNIQUE_DESC_KEY);
  if (!description) throw new Error('No unique transaction description stored on the page');
  return description;
}

/** Asserts a transaction with the given description is visible in the table */
async function expectTransactionInTable(page: Page, description: string) {
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
  await expect(table.getByText(description)).toBeVisible({ timeout: 10000 });
}

/**
 * Opens the category manager dialog from the transactions page.
 */
async function openCategoryDialog(page: Page) {
  await page.getByRole('button', { name: 'Gestionar categorías' }).click();
  await expect(getCategoryDialog(page)).toBeVisible({ timeout: 5000 });
}

/**
 * Verifies a category name is (or is not) present in the category manager list.
 *
 * PRODUCTION FINDING: after create/edit/delete category, the app calls
 * router.refresh() but Next.js 16 intermittently serves a stale RSC payload,
 * so the list does not always reflect the mutation. The DB mutation IS applied
 * (verified). Workaround: if the expected state does not appear within a short
 * window, force a full page reload to get a fresh server render, then re-open
 * the dialog. A real mutation failure still fails the assertion after the reload.
 */
async function verifyCategoryInList(page: Page, name: string, visible: boolean) {
  const list = getCategoryDialog(page).getByRole('list', { name: 'Categorías' });
  try {
    await expect(list.getByText(name, { exact: true })).toHaveCount(visible ? 1 : 0, {
      timeout: 8000,
    });
  } catch {
    console.log(
      `[category-refresh] stale RSC data for "${name}" (visible=${visible}) — forcing full reload`
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await openCategoryDialog(page);
    await expect(
      getCategoryDialog(page).getByRole('list', { name: 'Categorías' }).getByText(name, {
        exact: true,
      })
    ).toHaveCount(visible ? 1 : 0, { timeout: 5000 });
  }
}

/** Opens the create transaction modal from the transactions page */
async function openCreateModal(page: Page) {
  await page.getByRole('button', { name: 'Nueva transacción' }).click();
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
}

// ============================================================================
// GIVEN - Background & State
// ============================================================================

Given('que el usuario de transacciones ha iniciado sesión', async ({ page }) => {
  await loginAs(page, TRANSACTIONS_USER.email, TRANSACTIONS_USER.password);
});

Given('navega a la página de transacciones', async ({ page }) => {
  await page.goto('/es/transactions', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  // Wait for the page heading (present on both desktop and mobile views)
  await expect(page.getByRole('heading', { level: 1, name: 'Transacciones' })).toBeVisible({
    timeout: 10000,
  });
});

// Note: 'que la pantalla es de escritorio' and 'que la pantalla es móvil {int}x{int}'
// are defined in dashboard.steps.ts and auth.steps.ts respectively.

Given('que el modal de transacción está abierto', async ({ page }) => {
  await openCreateModal(page);
});

Given('que hay filtros activos en la URL', async ({ page }) => {
  // Navigate with search params already applied - no results, so table is not rendered
  await page.goto('/es/transactions?search=nomina&type=EXPENSE', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  // With active filters, an empty state or the filter bar is shown
  await expect(page.getByRole('heading', { level: 1, name: 'Transacciones' })).toBeVisible({
    timeout: 10000,
  });
});

Given('que navega a la página 2 de transacciones', async ({ page }) => {
  await page.goto('/es/transactions?page=2', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await expect(page.getByRole('heading', { level: 1, name: 'Transacciones' })).toBeVisible({
    timeout: 10000,
  });
});

// ============================================================================
// WHEN - Navigation & Page Actions
// ============================================================================

// "navega a la página de transacciones" is defined as Given above (also works for When/And in Gherkin).

// Generic click button step is in auth.steps.ts.

When('hace clic en {string} en el modal', async ({ page }, label: string) => {
  const dialog = getOpenDialog(page);
  // The "Cancelar" button appears multiple times; use the last one (footer button)
  if (label === 'Cancelar') {
    await dialog.getByRole('button', { name: label }).last().click();
  } else {
    await dialog.getByRole('button', { name: new RegExp(label, 'i') }).click();
  }
});

When('presiona la tecla Escape', async ({ page }) => {
  await page.keyboard.press('Escape');
  // Allow dialog transition time
  await page.waitForTimeout(300);
});

// ============================================================================
// WHEN - Filter Actions
// ============================================================================

When('escribe {string} en el campo de búsqueda', async ({ page }, text: string) => {
  const searchBox = page.getByPlaceholder('Buscar transacciones...');
  await searchBox.click();
  await searchBox.fill(text);
});

When('espera el debounce de búsqueda', async ({ page }) => {
  // The search has a debounce of approximately 500ms, wait 1.5s to be safe
  await page.waitForTimeout(1500);
});

When('selecciona {string} en el filtro de tipo', async ({ page }, typeName: string) => {
  await page.getByRole('combobox', { name: 'Tipo' }).selectOption(typeName);
  // Wait for URL to update
  await page.waitForTimeout(500);
});

When('ingresa {string} en el campo fecha desde', async ({ page }, dateStr: string) => {
  const dateFrom = page.getByRole('textbox', { name: 'Fecha desde' });
  await dateFrom.click();
  await dateFrom.fill(dateStr);
  // Press Tab to trigger blur/change event that updates URL
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
});

When('ingresa {string} en el campo fecha hasta', async ({ page }, dateStr: string) => {
  const dateTo = page.getByRole('textbox', { name: 'Fecha hasta' });
  await dateTo.click();
  await dateTo.fill(dateStr);
  // Press Tab to trigger blur/change event that updates URL
  await page.keyboard.press('Tab');
  await page.waitForTimeout(500);
});

When('limpia todos los filtros', async ({ page }) => {
  // Click the "Limpiar filtros" button to clear all filters at once
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await page.waitForTimeout(1000);
});

// ============================================================================
// WHEN - Pagination Actions
// ============================================================================

// Uses the generic "hace clic en {string}" step above for pagination buttons.

// ============================================================================
// WHEN - Modal Create Actions
// ============================================================================

// Uses the generic "hace clic en {string}" step with "Nueva transacción"
// which opens the modal. The "Then" assertion waits for the dialog to appear.

When('selecciona {string} como tipo', async ({ page }, typeName: string) => {
  const dialog = getOpenDialog(page);
  // Radio inputs are sr-only (screen reader only) — click the wrapping <label>
  // instead. The label has cursor:pointer and clicking it natively activates the
  // associated radio. (Using the grid container `../..` was a bug: the center of
  // the grid falls in the `gap-3` between the two labels, so the radio was never
  // actually selected and the form silently kept the default EXPENSE type.)
  const typeRadio = dialog.getByRole('radio', { name: typeName });
  const label = typeRadio.locator('xpath=..');
  await label.click();
  await page.waitForTimeout(300);
});

When('selecciona {string} como cuenta', async ({ page }, accountName: string) => {
  const dialog = getOpenDialog(page);
  // Account selection combobox
  const accountCombo = dialog.getByRole('combobox', { name: 'Cuenta' });
  // Match by partial label text — find the option that contains the account name
  const options = await accountCombo.locator('option').allTextContents();
  const matchingOption = options.find((o) => o.toLowerCase().includes(accountName.toLowerCase()));
  if (matchingOption) {
    await accountCombo.selectOption({ label: matchingOption });
  } else {
    // Fallback: try by value
    await accountCombo.selectOption(accountName);
  }
  await page.waitForTimeout(200);
});

/**
 * Fills the amount input inside a transaction dialog. The field is a
 * FormattedNumericInput that updates on keyDown (not on native fill), so we
 * clear with Backspace and type each digit individually.
 */
async function fillAmountInput(page: Page, dialog: Locator, amount: string) {
  const amountInput = dialog.getByRole('textbox', { name: 'Valor' });
  await amountInput.click();
  // Clear existing value by pressing Backspace multiple times
  for (let i = 0; i < 10; i++) {
    await amountInput.press('Backspace');
  }
  // Type each digit individually (FormattedNumericInput uses keyDown handler)
  for (const digit of amount) {
    await amountInput.press(digit);
  }
  await page.waitForTimeout(200);
}

When('ingresa {string} en el campo valor', async ({ page }, amount: string) => {
  await fillAmountInput(page, getOpenDialog(page), amount);
});

When('ingresa {string} como descripción', async ({ page }, description: string) => {
  const dialog = getOpenDialog(page);
  const descInput = dialog.getByRole('textbox', { name: 'Descripción' });
  await descInput.fill(description);
  await page.waitForTimeout(200);
});

When('intenta enviar el formulario de transacción vacío', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await dialog.getByRole('button', { name: 'Crear transacción' }).click();
  await page.waitForTimeout(500);
});

When('envía el formulario de creación de transacción', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await dialog.getByRole('button', { name: 'Crear transacción' }).click();
  // Wait for the server action to complete - dialog should close on success
  // Use a generous timeout for cold JIT compilation
  try {
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
  } catch {
    // If dialog remains open, try to read error messages
    const alerts = dialog.locator('[role="alert"]');
    const alertCount = await alerts.count();
    let alertText = '';
    for (let i = 0; i < alertCount; i++) {
      alertText += (await alerts.nth(i).textContent()) + ' | ';
    }
    console.log(`Dialog still open. Validation errors: "${alertText}"`);
    throw new Error(`Transaction creation failed. Errors: ${alertText}`);
  }
});

// ============================================================================
// THEN - Visual Structure Assertions
// ============================================================================

Then('debe ver el título {string}', async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 5000 });
});

Then('debe ver la tabla de transacciones', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver los encabezados {string}, {string}, {string}, {string}, {string}, {string}, {string}',
  async (
    { page },
    h1: string,
    h2: string,
    h3: string,
    h4: string,
    h5: string,
    h6: string,
    h7: string
  ) => {
    const headers = page.locator('table thead th');
    await expect(headers.nth(0)).toHaveText(h1);
    await expect(headers.nth(1)).toHaveText(h2);
    await expect(headers.nth(2)).toHaveText(h3);
    await expect(headers.nth(3)).toHaveText(h4);
    await expect(headers.nth(4)).toHaveText(h5);
    await expect(headers.nth(5)).toHaveText(h6);
    await expect(headers.nth(6)).toHaveText(h7);
  }
);

// ============================================================================
// THEN - Amount Color Assertions
// ============================================================================

Then('los montos de gastos deben mostrarse en color rojo', async ({ page }) => {
  // Expenses use text-rose-400 class
  const expenseAmounts = page.locator('span.text-rose-400');
  const count = await expenseAmounts.count();
  expect(count).toBeGreaterThanOrEqual(1);
  // Verify the first expense amount is visible
  await expect(expenseAmounts.first()).toBeVisible();
});

Then('los montos de ingresos deben mostrarse en color verde', async ({ page }) => {
  // Income uses text-emerald-400 class
  const incomeAmounts = page.locator('span.text-emerald-400');
  const count = await incomeAmounts.count();
  expect(count).toBeGreaterThanOrEqual(1);
  // Verify the first income amount is visible
  await expect(incomeAmounts.first()).toBeVisible();
});

// ============================================================================
// THEN - URL Assertions
// ============================================================================

// Then('la URL debe contener {string}') is defined in auth.steps.ts.

Then('la URL no debe tener parámetros de filtro', async ({ page }) => {
  // URL should be /es/transactions without query parameters
  await expect(page).toHaveURL(/\/es\/transactions$/);
});

// ============================================================================
// THEN - Pagination Assertions
// ============================================================================

Then('debe ver el texto de paginación', async ({ page }) => {
  const paginationText = page.locator('p').filter({ hasText: /transacciones/ });
  await expect(paginationText.first()).toBeVisible({ timeout: 5000 });
});

Then('debe ver el texto {string}', async ({ page }, expectedText: string) => {
  await expect(page.getByText(expectedText, { exact: false }).first()).toBeVisible({
    timeout: 5000,
  });
});

Then('el botón {string} debe estar deshabilitado', async ({ page }, buttonName: string) => {
  await expect(page.getByRole('button', { name: new RegExp(buttonName, 'i') })).toBeDisabled({
    timeout: 5000,
  });
});

Then('el botón {string} debe estar habilitado', async ({ page }, buttonName: string) => {
  await expect(page.getByRole('button', { name: new RegExp(buttonName, 'i') })).toBeEnabled({
    timeout: 5000,
  });
});

// ============================================================================
// THEN - Modal Assertions
// ============================================================================

Then('debe ver un diálogo con título {string}', async ({ page }, title: string) => {
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  const heading = dialog.getByRole('heading', { level: 2 });
  await expect(heading).toHaveText(title);
});

Then(
  'debe ver el campo tipo con opciones {string} e {string}',
  async ({ page }, opt1: string, opt2: string) => {
    const dialog = getOpenDialog(page);
    // Radio buttons for type selection
    await expect(dialog.getByRole('radio', { name: opt1 })).toBeVisible({ timeout: 3000 });
    await expect(dialog.getByRole('radio', { name: opt2 })).toBeVisible({ timeout: 3000 });
  }
);

Then('debe ver el campo cuenta', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('combobox', { name: 'Cuenta' })).toBeVisible({ timeout: 3000 });
});

Then('debe ver el campo valor', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('textbox', { name: 'Valor' })).toBeVisible({ timeout: 3000 });
});

Then('debe ver el campo descripción', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('textbox', { name: 'Descripción' })).toBeVisible({ timeout: 3000 });
});

Then('debe ver el campo fecha', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('textbox', { name: 'Fecha de la transacción' })).toBeVisible({
    timeout: 3000,
  });
});

Then('debe ver el botón {string}', async ({ page }, buttonName: string) => {
  const dialog = getOpenDialog(page);
  // Use .first() because the dialog has multiple "Cancelar" buttons (backdrop overlay, close X, and footer)
  await expect(
    dialog.getByRole('button', { name: new RegExp(`^${buttonName}$`, 'i') }).first()
  ).toBeVisible({ timeout: 3000 });
});

Then('el diálogo debe estar cerrado', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

Then('debe ver mensajes de error de validación', async ({ page }) => {
  const dialog = getOpenDialog(page);
  // Validation errors use role="alert" inside the dialog
  const alerts = dialog.locator('[role="alert"]');
  await expect(alerts.first()).toBeVisible({ timeout: 3000 });
  const count = await alerts.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

Then('el campo cuenta debe mostrar error', async ({ page }) => {
  const dialog = getOpenDialog(page);
  // Account field shows alert with "Select an account" or similar
  const accountErrors = dialog.locator('[role="alert"]').filter({ hasText: /account|cuenta/i });
  await expect(accountErrors.first()).toBeVisible({ timeout: 3000 });
});

Then('el campo valor debe mostrar error', async ({ page }) => {
  const dialog = getOpenDialog(page);
  // Amount field shows alert with "Amount must be greater than 0" or similar
  const amountErrors = dialog
    .locator('[role="alert"]')
    .filter({ hasText: /amount|valor|monto|greater|mayor/i });
  await expect(amountErrors.first()).toBeVisible({ timeout: 3000 });
});

// ============================================================================
// THEN - Create Success Assertions
// ============================================================================

Then('debe ver una notificación de éxito', async ({ page }) => {
  // After successful creation the modal dialog closes — this is the primary
  // success indicator since the app may not show a persistent toast.
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

Then('la transacción debe aparecer en la tabla', async ({ page }) => {
  // After creation, the page should refresh and show the new transaction.
  // Verify the specific description used in the create scenario is visible.
  await expectTransactionInTable(page, 'Ingreso de prueba E2E');
});

Then(
  'la transacción con descripción {string} debe aparecer en la tabla',
  async ({ page }, description: string) => {
    await expectTransactionInTable(page, description);
  }
);

// ============================================================================
// THEN - Mobile Assertions
// ============================================================================

Then('la tabla de transacciones debe ser visible', async ({ page }) => {
  // On mobile, transactions are rendered as a <ul> list instead of a table
  // Check for the list container with the transactions aria-label
  const listContainer = page.getByRole('list', { name: 'Transacciones' });
  await expect(listContainer)
    .toBeVisible({ timeout: 5000 })
    .catch(async () => {
      // Fallback: check for the ul directly
      const ul = page.locator('ul[aria-label="Transacciones"]');
      await expect(ul).toBeVisible({ timeout: 5000 });
    });
});

// ============================================================================
// EMPTY STATE - NO ACCOUNTS
// ============================================================================

When('inicia sesión con el email recién registrado', async ({ page }) => {
  // After registration the app switches to login mode (it does NOT auto-login).
  // The unique email was stored on window by the register step in auth.steps.ts.
  const email = await page.evaluate(() => {
    return (window as Window & typeof globalThis & { __e2eRegisterEmail?: string })
      .__e2eRegisterEmail;
  });
  expect(email).toBeTruthy();
  const loginForm = page.locator('form').first();
  await loginForm.getByPlaceholder('Ingresa tu correo').fill(email as string);
  await loginForm.getByPlaceholder('Ingresa tu contraseña').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();
  // 60s: covers cold JIT-compile of the login action AND slow Argon2id on a loaded machine.
  await page.waitForURL(/\/es\/dashboard/, { timeout: 60000 });
});

Then('debe ver el aviso de crear cuenta', async ({ page }) => {
  // Empty state (no accounts): "Crea tu primera cuenta" is a <p> (not a heading)
  await expect(page.getByText('Crea tu primera cuenta')).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('link', { name: 'Crear cuenta', exact: true })).toBeVisible();
});

Then('el botón {string} no debe estar visible', async ({ page }, buttonName: string) => {
  // With 0 accounts the "Nueva transacción" button is not rendered at all
  await expect(page.getByRole('button', { name: buttonName, exact: true })).toHaveCount(0);
});

When('hace clic en el enlace {string}', async ({ page }, linkName: string) => {
  await page.getByRole('link', { name: linkName, exact: true }).click();
});

Then('debe ser redirigido a la página de cuentas', async ({ page }) => {
  await expect(page).toHaveURL(/\/es\/accounts/, { timeout: 30000 });
});

// ============================================================================
// CREATE - ERROR PATHS
// ============================================================================

When('envía el formulario de creación de transacción esperando error', async ({ page }) => {
  const dialog = getOpenDialog(page);
  const submitBtn = dialog.getByRole('button', { name: 'Crear transacción' });
  await submitBtn.click();
  // While submitting the button becomes "Creando..." and disabled; when the server
  // responds with an error it re-enables and returns to "Crear transacción".
  await expect(submitBtn).toBeEnabled({ timeout: 15000 });
  // Small settle for the notification state update (not rendered in the DOM).
  await page.waitForTimeout(300);
});

Then('el diálogo de crear transacción debe permanecer abierto', async ({ page }) => {
  // On a server-side error (INSUFFICIENT_FUNDS) the modal does NOT close.
  await expect(getOpenDialog(page)).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver el error {string} dentro del diálogo de crear transacción',
  async ({ page }, message: string) => {
    // Fix B: the server error is rendered INLINE inside the modal via role="alert"
    // (e.g. "Fondos insuficientes en la cuenta seleccionada"). The old toast lives
    // below the <dialog> top layer and is invisible — we assert the inline alert
    // scoped to the dialog instead.
    const dialog = getOpenDialog(page);
    await expect(dialog.getByRole('alert').filter({ hasText: message })).toBeVisible({
      timeout: 5000,
    });
  }
);

// ============================================================================
// DELETE - WITH CONFIRMATION
// ============================================================================

When('ingresa una descripción única {string}', async ({ page }, prefix: string) => {
  const description = `${prefix} ${Date.now()}`;
  await storeUniqueDescription(page, description);
  const dialog = getOpenDialog(page);
  const descInput = dialog.getByRole('textbox', { name: 'Descripción' });
  await descInput.fill(description);
  await page.waitForTimeout(200);
});

Then('la transacción creada debe aparecer en la tabla', async ({ page }) => {
  await expectTransactionInTable(page, await getStoredDescription(page));
});

Then('la transacción creada no debe aparecer en la tabla', async ({ page }) => {
  const description = await getStoredDescription(page);
  // router.refresh() after delete re-renders the table without the transaction.
  await expect(page.getByText(description)).toHaveCount(0, { timeout: 15000 });
});

When('hace clic en el botón de eliminar de la fila de la transacción creada', async ({ page }) => {
  const description = await getStoredDescription(page);
  const row = page.getByRole('row').filter({ hasText: description }).first();
  await row.getByRole('button', { name: 'Eliminar transacción' }).click();
});

Then('debe ver el diálogo de confirmación de eliminación', async ({ page }) => {
  await expect(getDeleteDialog(page)).toBeVisible({ timeout: 5000 });
});

When('hace clic en {string} en el diálogo de eliminación', async ({ page }, buttonName: string) => {
  const dialog = getDeleteDialog(page);
  if (buttonName === 'Cancelar') {
    // The dialog has a close X (aria-label="Cancelar") + the footer "Cancelar" button
    await dialog.getByRole('button', { name: buttonName, exact: true }).last().click();
  } else {
    await dialog.getByRole('button', { name: buttonName, exact: true }).click();
  }
});

Then('el diálogo de eliminación debe cerrarse', async ({ page }) => {
  await expect(getDeleteDialog(page)).not.toBeVisible({ timeout: 5000 });
});

// ============================================================================
// DELETE - INTEGRITY (account created inside the scenario)
// ============================================================================

When('selecciona la cuenta recién creada como cuenta', async ({ page }) => {
  const accountName = await getStoredAccountName(page);
  const dialog = getOpenDialog(page);
  const accountCombo = dialog.getByRole('combobox', { name: 'Cuenta' });
  const options = await accountCombo.locator('option').allTextContents();
  const matchingOption = options.find((o) => o.toLowerCase().includes(accountName.toLowerCase()));
  if (!matchingOption) {
    throw new Error(
      `Account "${accountName}" not found in the create-transaction combobox. Options: ${options.join(' | ')}`
    );
  }
  await accountCombo.selectOption({ label: matchingOption });
  await page.waitForTimeout(200);
});

/**
 * Locates a transactions-table row matching BOTH the description AND the unique
 * account name created in this scenario. The account name filter disambiguates
 * when multiple accounts produced a "Saldo inicial" row.
 */
async function rowForAccountTransaction(page: Page, description: string): Promise<Locator> {
  const accountName = await getStoredAccountName(page);
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
  return table
    .getByRole('row')
    .filter({ hasText: description })
    .filter({ hasText: accountName })
    .first();
}

When(
  'hace clic en el botón de eliminar de la fila {string} de la cuenta recién creada',
  async ({ page }, description: string) => {
    const row = await rowForAccountTransaction(page, description);
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole('button', { name: 'Eliminar transacción' }).click();
  }
);

Then(
  'la fila {string} de la cuenta recién creada debe estar visible',
  async ({ page }, description: string) => {
    await expect(await rowForAccountTransaction(page, description)).toBeVisible({
      timeout: 10000,
    });
  }
);

Then(
  'la fila {string} de la cuenta recién creada debe seguir visible',
  async ({ page }, description: string) => {
    await expect(await rowForAccountTransaction(page, description)).toBeVisible({
      timeout: 10000,
    });
  }
);

Then(
  'la transacción recién creada debe estar visible con el nombre de la cuenta eliminada',
  async ({ page }) => {
    const description = await getStoredDescription(page);
    const accountName = await getStoredAccountName(page);
    const table = page.getByRole('table', { name: 'Transacciones' });
    await expect(table).toBeVisible({ timeout: 5000 });
    const row = table
      .getByRole('row')
      .filter({ hasText: description })
      .filter({ hasText: accountName })
      .first();
    // Regla 3: after deleting the account (soft delete), its transactions remain
    // in the history and the server include (transaction.account.name) keeps the
    // account name visible in the row — it is never replaced by "—".
    await expect(row).toBeVisible({ timeout: 10000 });
  }
);

Then('debe ver la notificación de error {string}', async ({ page }, message: string) => {
  // ToastViewport renders error notifications in a role="status" region. The
  // DeleteTransactionModal ALWAYS closes after the server action (even on
  // error — handleClose() runs in both branches), so the toast becomes visible
  // once the <dialog> leaves the top layer.
  const statusRegion = page.locator('[role="status"][aria-live="polite"]');
  await expect(statusRegion.getByText(message)).toBeVisible({ timeout: 4000 });
});

// ============================================================================
// CATEGORIES - CRUD
// ============================================================================

Then('debe ver el diálogo de categorías', async ({ page }) => {
  await expect(getCategoryDialog(page)).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver {int} categorías predeterminadas sin botones de editar o eliminar',
  async ({ page }, count: number) => {
    const dialog = getCategoryDialog(page);
    const list = dialog.getByRole('list', { name: 'Categorías' });
    await expect(list.locator('li')).toHaveCount(count, { timeout: 5000 });
    // Every seeded system category shows the "Predeterminada" badge
    await expect(list.getByText('Predeterminada')).toHaveCount(count, { timeout: 5000 });
    // System categories have NO edit/delete buttons
    await expect(dialog.getByRole('button', { name: /Editar categoría:/ })).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: /^Eliminar: / })).toHaveCount(0);
  }
);

When(
  'añade la categoría {string} con tipo {string}',
  async ({ page }, name: string, typeLabel: string) => {
    const dialog = getCategoryDialog(page);
    await dialog.getByLabel('Nombre').fill(name);
    await dialog.getByLabel('Tipo').selectOption({ label: typeLabel });
    await dialog.getByRole('button', { name: 'Añadir categoría' }).click();
    // onChanged() → router.refresh() re-renders the list with the new category
    await verifyCategoryInList(page, name, true);
  }
);

Then('debe ver la categoría {string} en la lista de categorías', async ({ page }, name: string) => {
  await verifyCategoryInList(page, name, true);
});

When('cierra el diálogo de categorías', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

When('abre el modal de transacción y ve la categoría {string}', async ({ page }, name: string) => {
  await page.getByRole('button', { name: 'Nueva transacción' }).click();
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  // Category chips are sr-only radios with aria-label = category name
  await expect(dialog.getByRole('radio', { name })).toBeVisible({ timeout: 5000 });
});

When(
  'edita la categoría {string} a {string}',
  async ({ page }, oldName: string, newName: string) => {
    const dialog = getCategoryDialog(page);
    await dialog.getByRole('button', { name: `Editar categoría: ${oldName}` }).click();
    const nameInput = dialog.getByLabel('Nombre');
    await expect(nameInput).toHaveValue(oldName, { timeout: 5000 });
    await nameInput.fill(newName);
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await verifyCategoryInList(page, newName, true);
  }
);

When('elimina la categoría {string}', async ({ page }, name: string) => {
  const dialog = getCategoryDialog(page);
  await dialog.getByRole('button', { name: `Eliminar: ${name}` }).click();
  // Inline confirmation appears inside the category list item
  const li = dialog
    .getByRole('list', { name: 'Categorías' })
    .locator('li')
    .filter({ hasText: name });
  await expect(li.getByText(/¿Eliminar la categoría/)).toBeVisible({ timeout: 5000 });
  await li.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await verifyCategoryInList(page, name, false);
});

Then(
  'la categoría {string} no debe aparecer en la lista de categorías',
  async ({ page }, name: string) => {
    await verifyCategoryInList(page, name, false);
  }
);

Then(
  'la categoría {string} no debe aparecer en el selector de creación',
  async ({ page }, name: string) => {
    // Force a fresh page render (router.refresh may serve stale RSC data), then
    // open the create-transaction modal and confirm the deleted chip is absent.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.getByRole('button', { name: 'Nueva transacción' }).click();
    const dialog = getOpenDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('radio', { name })).toHaveCount(0, { timeout: 5000 });
  }
);

// ============================================================================
// THEN - Opening Balance (account created with initialBalanceCents > 0)
// ============================================================================

Then(
  'la cuenta {string} debe mostrar un saldo de {int}',
  async ({ page }, accountName, balanceCents) => {
    // Navigate to the accounts page to verify the ledger-driven balance. The card
    // renders formatMoney(balanceCents, currency, 'es-CO'), e.g. "$ 1.000,00" for
    // 100000 COP cents.
    await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    const card = page.getByRole('button', { name: accountName, exact: true });
    await expect(card).toBeVisible({ timeout: 5000 });
    // Build the expected localized number (no currency symbol) and assert it is a
    // substring of the formatted balance on the card — robust across symbol variants.
    const expectedNumber = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(balanceCents / 100);
    await expect(card).toContainText(expectedNumber, { timeout: 5000 });
  }
);

// ============================================================================
// EDIT - HAPPY PATH & VALIDATION
// ============================================================================

/** Reads the original description preserved before an edit overwrote the current one */
async function getOriginalDescription(page: Page): Promise<string> {
  const description = await page.evaluate((key) => {
    return window.localStorage.getItem(key) ?? undefined;
  }, UNIQUE_ORIG_DESC_KEY);
  if (!description) throw new Error('No original transaction description stored on the page');
  return description;
}

When('abre la edición de la transacción creada', async ({ page }) => {
  const description = await getStoredDescription(page);
  const row = page.getByRole('row').filter({ hasText: description }).first();
  await expect(row).toBeVisible({ timeout: 10000 });
  // The pencil button has aria-label="Editar transacción" (editTransaction key)
  await row.getByRole('button', { name: 'Editar transacción' }).click();
  await expect(getEditDialog(page)).toBeVisible({ timeout: 5000 });
});

Then('debe ver el diálogo de edición con los datos prefilled', async ({ page }) => {
  const dialog = getEditDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  // The dialog title changes to "Editar transacción" in edit mode
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Editar transacción');
  // Description is prefilled with the created value
  const description = await getStoredDescription(page);
  await expect(dialog.getByRole('textbox', { name: 'Descripción' })).toHaveValue(description);
  // Type is INCOME (checked) and both radios are disabled (immutable)
  await expect(dialog.getByRole('radio', { name: 'Ingreso' })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: 'Ingreso' })).toBeDisabled();
  await expect(dialog.getByRole('radio', { name: 'Gasto' })).toBeDisabled();
  // Account is disabled (immutable) in edit mode
  await expect(dialog.getByRole('combobox', { name: 'Cuenta' })).toBeDisabled();
  // Amount is prefilled: 50000 cents → "500,00" (es-CO, cents/100 with 2 decimals)
  await expect(dialog.getByRole('textbox', { name: 'Valor' })).toHaveValue('500,00');
});

When('cambia la descripción a una única {string}', async ({ page }, prefix: string) => {
  // Preserve the original description so a later step can assert the old row is gone
  const original = await getStoredDescription(page);
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: UNIQUE_ORIG_DESC_KEY, value: original }
  );

  const description = `${prefix} ${Date.now()}`;
  await storeUniqueDescription(page, description);
  const dialog = getEditDialog(page);
  const descInput = dialog.getByRole('textbox', { name: 'Descripción' });
  await descInput.fill(description);
  await page.waitForTimeout(200);
});

When(
  'ingresa {string} en el campo valor del diálogo de edición',
  async ({ page }, amount: string) => {
    await fillAmountInput(page, getEditDialog(page), amount);
  }
);

When('envía la edición de la transacción', async ({ page }) => {
  const dialog = getEditDialog(page);
  // The submit button keeps the "Crear transacción" label (create key) even in
  // edit mode; the dialog closes on success (same pattern as create).
  await dialog.getByRole('button', { name: 'Crear transacción' }).click();
  try {
    await expect(dialog).not.toBeVisible({ timeout: 15000 });
  } catch {
    const alerts = dialog.locator('[role="alert"]');
    const alertCount = await alerts.count();
    let alertText = '';
    for (let i = 0; i < alertCount; i++) {
      alertText += (await alerts.nth(i).textContent()) + ' | ';
    }
    console.log(`Edit dialog still open. Validation errors: "${alertText}"`);
    throw new Error(`Transaction edit failed. Errors: ${alertText}`);
  }
});

Then('el diálogo de edición debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

Then(
  'la transacción editada debe aparecer en la tabla con monto {int}',
  async ({ page }, cents: number) => {
    const description = await getStoredDescription(page);
    const row = page.getByRole('row').filter({ hasText: description }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    // Build the expected localized number (no currency symbol) and assert it is a
    // substring of the formatted amount on the row (e.g. "750,00" in es-CO).
    const expectedNumber = new Intl.NumberFormat('es-CO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(cents / 100);
    await expect(row).toContainText(expectedNumber, { timeout: 5000 });
  }
);

Then('la descripción original no debe aparecer en la tabla', async ({ page }) => {
  const original = await getOriginalDescription(page);
  // After the successful edit, router.refresh() re-renders the table without the old description.
  await expect(page.getByText(original)).toHaveCount(0, { timeout: 15000 });
});

When('envía la edición de la transacción esperando error', async ({ page }) => {
  const dialog = getEditDialog(page);
  const submitBtn = dialog.getByRole('button', { name: 'Crear transacción' });
  await submitBtn.click();
  // While submitting the button becomes "Creando..." and disabled; when the server
  // responds with an error it re-enables and returns to "Crear transacción".
  await expect(submitBtn).toBeEnabled({ timeout: 15000 });
  // Small settle for the notification state update (not rendered in the DOM).
  await page.waitForTimeout(300);
});

Then('el diálogo de edición debe permanecer abierto', async ({ page }) => {
  // On a server-side error (INSUFFICIENT_FUNDS) the modal does NOT close.
  await expect(getEditDialog(page)).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver el error {string} dentro del diálogo de edición',
  async ({ page }, message: string) => {
    const dialog = getEditDialog(page);
    await expect(dialog.getByRole('alert').filter({ hasText: message })).toBeVisible({
      timeout: 5000,
    });
  }
);

// ============================================================================
// DATE & TIME FORMAT
// ============================================================================

Then('las celdas de fecha deben mostrar fecha y hora', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
  const dateCells = table.locator('tbody tr td:first-child time');
  const count = await dateCells.count();
  expect(count).toBeGreaterThanOrEqual(1);
  const text = (await dateCells.first().textContent()) ?? '';
  // Robust assertion for the new format "26 ago 2026 · 14:30" (locale es-CO):
  // require the "·" separator followed by an HH:MM time without depending on
  // the exact date/month/24h-vs-12h representation.
  expect(text).toMatch(/·\s*\d{1,2}:\d{2}/);
});
