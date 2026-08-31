/**
 * Accounts Step Definitions
 * Tests for the bank accounts page - create, view, edit, delete
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { ACCOUNTS_TEST_USER } from '../fixtures';
import { resetUserFinancialData } from '../helpers/db';
import {
  storeUniqueAccountName,
  getStoredAccountName,
  storeUniquePocketName,
  getStoredPocketName,
  storeUniqueEditedAccountName,
  getStoredEditedAccountName,
} from '../helpers/unique';

// ============================================================================
// HELPERS
// ============================================================================

/** Creates an account via the UI modal interaction */
async function createTestAccount(page: Page, name: string = 'Mi Cuenta Corriente') {
  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  await page
    .getByRole('button', { name: /nueva cuenta/i })
    .first()
    .click();

  const dialog = page.locator('dialog[open]').first();
  await dialog.waitFor({ state: 'visible', timeout: 5000 });

  await dialog.locator('#acc-name').fill(name);
  await dialog.locator('select#acc-type').selectOption('CHECKING');

  // Click submit via Playwright
  await dialog.getByRole('button', { name: /crear cuenta/i }).click();
  // Wait for dialog to close (success) or error to appear
  await expect(page.locator('dialog[open]'))
    .toHaveCount(0, { timeout: 10000 })
    .catch(async () => {
      // If dialog didn't close, wait a bit more for slow server response
      await page.waitForTimeout(2000);
    });
}

/** Open the create account modal from the accounts page */
async function openCreateModal(page: Page) {
  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

  // Click "Nueva Cuenta" (first one = header button)
  await page
    .getByRole('button', { name: /nueva cuenta/i })
    .first()
    .click();

  // Wait for dialog to be open
  await expect(page.locator('dialog[open]').first()).toBeVisible({ timeout: 5000 });
}

/** Gets the currently open dialog */
function getOpenDialog(page: Page) {
  return page.locator('dialog[open]').first();
}

// ============================================================================
// GIVEN - Background & State
// ============================================================================

Given('que el usuario de cuentas ha iniciado sesión', async ({ page }) => {
  await loginAs(page, ACCOUNTS_TEST_USER.email, ACCOUNTS_TEST_USER.password);
});

Given('que no existen cuentas bancarias', async ({ page }) => {
  // The ACCOUNT_HAS_BALANCE integrity rule rejects deleting an account whose
  // true balance is not 0, so the old UI-loop cleanup hangs on any leftover
  // account (e.g. "Mi Cuenta Corriente" with 1.000.000 created by a previous
  // scenario). Reset the accounts user's data directly in the isolated e2e
  // schema — a DB-level soft delete equivalent of the UI cleanup.
  await resetUserFinancialData(ACCOUNTS_TEST_USER.email);

  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
  // Wait for streaming/hydration to finish so account cards are stable before we interact.
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  // After networkidle the RSC payload has been received but React may still be swapping the
  // Suspense skeleton (animate-pulse) for the real cards. Wait for the skeleton to detach first,
  // then let the 300ms CSS card-entry transition finish before we interact.
  await page
    .locator('.animate-pulse')
    .first()
    .waitFor({ state: 'detached', timeout: 8000 })
    .catch(() => {});
  await page.waitForTimeout(350);

  // The grid must be empty after the DB reset.
  await expect(page.locator('[data-account-id]')).toHaveCount(0, { timeout: 5000 });
});

Given('que el modal de creación está abierto', async ({ page }) => {
  await openCreateModal(page);
});

Given('que existe una cuenta bancaria', async ({ page }) => {
  // Create a test account first
  await createTestAccount(page, 'Cuenta de Prueba E2E');
  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });

  // Verify the account card exists
  await expect(page.locator('[data-account-id]').first()).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// WHEN - Navigation
// ============================================================================

When('navega a la página de cuentas', async ({ page }) => {
  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
});

// ============================================================================
// WHEN - Create Account Modal Interactions
// ============================================================================

When('abre el modal de nueva cuenta', async ({ page }) => {
  await openCreateModal(page);
});

When('intenta enviar el formulario vacío', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await dialog.getByRole('button', { name: /crear cuenta/i }).click();
});

When('selecciona el tipo {string}', async ({ page }, typeName: string) => {
  const dialog = getOpenDialog(page);
  const typeSelect = dialog.locator('select#acc-type');

  // Map displayed type names to option values
  const typeMap: Record<string, string> = {
    'Cuenta de Ahorros': 'SAVINGS',
    'Cuenta Corriente': 'CHECKING',
    Efectivo: 'CASH',
  };

  const optionValue = typeMap[typeName] ?? typeName;
  await typeSelect.selectOption(optionValue);
});

When('ingresa {string} en el campo nombre', async ({ page }, name: string) => {
  const dialog = getOpenDialog(page);
  await dialog.locator('#acc-name').fill(name);
});

When('ingresa {string} en el campo de saldo inicial', async ({ page }, amount: string) => {
  const dialog = getOpenDialog(page);
  const balanceInput = dialog.locator('#acc-balance');
  await balanceInput.click();
  // Clear existing value by pressing Backspace multiple times
  for (let i = 0; i < 10; i++) {
    await balanceInput.press('Backspace');
  }
  // Type each digit (FormattedNumericInput uses keyDown handler)
  for (const digit of amount) {
    await balanceInput.press(digit);
  }
});

When('cierra el modal con Cancelar', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await dialog.getByRole('button', { name: /cancelar/i }).click();
});

When('presiona Escape en el modal', async ({ page }) => {
  await page.keyboard.press('Escape');
});

When('envía el formulario de creación', async ({ page }) => {
  getOpenDialog(page);

  // Use form.requestSubmit() to properly trigger React's onSubmit handler
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) return;
    const form = dialog.querySelector('form');
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) {
      form.requestSubmit(submitBtn);
    }
  });
  // 60s: covers cold JIT-compile of the createBankAccount action on first call.
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 60000 });
});

// ============================================================================
// WHEN - Detail Panel & Delete
// ============================================================================

When('hace clic en la primera tarjeta de cuenta', async ({ page }) => {
  const card = page.locator('[data-account-id] button').first();
  await card.click();
});

When('abre el panel de detalle de la cuenta', async ({ page }) => {
  const card = page.locator('[data-account-id] button').first();
  await card.click();
});

When('hace clic en eliminar en el panel de detalle', async ({ page }) => {
  // The delete button in the AccountFullDetail panel has aria-label="Eliminar"
  const deleteBtn = page.getByRole('button', { name: /^eliminar$/i }).first();
  await deleteBtn.click();
});

When('confirma la eliminación de la cuenta', async ({ page }) => {
  const dialog = getOpenDialog(page);
  // The delete button in DeleteConfirmModal contains text "Eliminar" with Trash2 icon
  // Use filter to find the destructive button (not Cancel)
  await dialog.locator('button').filter({ hasText: 'Eliminar' }).last().click();
  // Wait for dialog to close and page to update
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// WHEN/THEN - Delete integrity (ACCOUNT_HAS_BALANCE rejection path)
// ============================================================================

When('ingresa un nombre único de cuenta con prefijo {string}', async ({ page }, prefix: string) => {
  const dialog = getOpenDialog(page);
  const name = await storeUniqueAccountName(page, prefix);
  await dialog.locator('#acc-name').fill(name);
});

When('confirma la eliminación de la cuenta esperando rechazo', async ({ page }) => {
  const dialog = getOpenDialog(page);
  const deleteBtn = dialog.locator('button').filter({ hasText: 'Eliminar' }).last();
  await deleteBtn.click();
  // Fix UX: DeleteConfirmModal now closes the <dialog> on BOTH success and
  // rejection (closeModal() runs in the error branch too), so the error toast
  // becomes visible once the dialog leaves the top layer. Waiting for the
  // dialog to close is the reliable signal that the server rejected the
  // operation (ACCOUNT_HAS_BALANCE).
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 15000 });
});

Then('el modal de confirmación de eliminación debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

Then('debe ver la notificación de éxito {string}', async ({ page }, message: string) => {
  // ToastViewport renders notifications in a role="status" aria-live="polite"
  // region. DeleteConfirmModal adds the success toast BEFORE closing the dialog,
  // so by the time we assert, the dialog is gone and the toast is visible.
  const statusRegion = page.locator('[role="status"][aria-live="polite"]');
  await expect(statusRegion.getByText(message)).toBeVisible({ timeout: 4000 });
});

Then('la cuenta con el nombre único debe seguir en el grid', async ({ page }) => {
  const name = await getStoredAccountName(page);
  // AccountCard button has aria-label={account.name}
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 5000 });
});

When('abre el panel de detalle de la cuenta con el nombre único', async ({ page }) => {
  const name = await getStoredAccountName(page);
  const card = page.getByRole('button', { name, exact: true });
  await expect(card).toBeVisible({ timeout: 5000 });
  await card.click();
});

Then('la cuenta con el nombre único no debe estar en el grid', async ({ page }) => {
  const name = await getStoredAccountName(page);
  // After a successful delete the card disappears while the remaining accounts
  // stay in the grid (unlike "la cuenta debe ser eliminada del grid", this does
  // not require the whole grid to be empty).
  await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0, {
    timeout: 10000,
  });
});

// ============================================================================
// THEN - Visual Structure
// ============================================================================

Then('debe ver el título de sección {string}', async ({ page }, sectionTitle: string) => {
  await expect(page.getByText(sectionTitle, { exact: false }).first()).toBeVisible({
    timeout: 5000,
  });
});

Then('debe ver el botón {string} en el encabezado', async ({ page }, buttonName: string) => {
  const headerSection = page.locator('section').first();
  const button = headerSection.getByRole('button', { name: new RegExp(buttonName, 'i') }).first();
  await expect(button).toBeVisible({ timeout: 5000 });
});

Then('debe ver el mensaje de empty state {string}', async ({ page }, emptyText: string) => {
  await expect(page.getByText(emptyText, { exact: false }).first()).toBeVisible({ timeout: 5000 });
});

Then('debe ver el botón {string} en el empty state', async ({ page }, buttonName: string) => {
  await expect(page.getByRole('button', { name: new RegExp(buttonName, 'i') }).last()).toBeVisible({
    timeout: 5000,
  });
});

Then('debe ver el mensaje descriptivo en el empty state', async ({ page }) => {
  await expect(
    page.getByText('Agrega tus cuentas corrientes, ahorros, efectivo y bolsillos.').first()
  ).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver la sección {string} con label {string}',
  async ({ page }, sectionTitle: string, label: string) => {
    const section = page.locator('section').filter({ hasText: sectionTitle });
    await expect(section.first()).toBeVisible({ timeout: 5000 });
    await expect(section.locator(`text=${label}`).first()).toBeVisible({ timeout: 5000 });
  }
);

Then('la nueva cuenta debe aparecer en el grid', async ({ page }) => {
  // After successful creation, the page refreshes and shows the account card.
  // 30s: first creation in the suite pays the worker/compile cold start on CI.
  await expect(page.locator('[data-account-id]').first()).toBeVisible({ timeout: 30000 });
});

// ============================================================================
// THEN - Modal Assertions
// ============================================================================

Then('debe ver el modal de creación con título {string}', async ({ page }, title: string) => {
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('h2')).toHaveText(title);
});

Then('debe ver el campo {string} en el modal', async ({ page }, fieldName: string) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByText(fieldName, { exact: false }).first()).toBeVisible({
    timeout: 5000,
  });
});

Then('debe ver el botón {string} en el modal', async ({ page }, buttonName: string) => {
  const dialog = getOpenDialog(page);
  await expect(
    dialog.getByRole('button', { name: new RegExp(`^${buttonName}$`, 'i') })
  ).toBeVisible({ timeout: 5000 });
});

Then('debe ver errores de validación en el modal', async ({ page }) => {
  const dialog = getOpenDialog(page);
  const errors = dialog.locator('[role="alert"]');
  await expect(errors.first()).toBeVisible({ timeout: 3000 });
  const errorCount = await errors.count();
  expect(errorCount).toBeGreaterThanOrEqual(1);
});

Then('el campo nombre debe estar marcado como inválido', async ({ page }) => {
  const dialog = getOpenDialog(page);
  const nameInput = dialog.locator('#acc-name');
  await expect(nameInput).toHaveAttribute('aria-invalid', 'true');
});

Then('debe ver el campo de tasa de interés visible', async ({ page }) => {
  const dialog = getOpenDialog(page);
  const rateField = dialog.locator('#acc-rate');
  await expect(rateField).toBeVisible({ timeout: 3000 });
});

Then('el campo de tasa de interés debe estar oculto', async ({ page }) => {
  const dialog = getOpenDialog(page);
  const rateField = dialog.locator('#acc-rate');
  await expect(rateField).toHaveCount(0, { timeout: 3000 });
});

Then('el modal debe estar cerrado', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 3000 });
});

Then('la cuenta debe crearse exitosamente', async ({ page }) => {
  // Wait for the dialog to close (success closes the modal)
  // If dialog doesn't close, capture the error notification for debugging
  try {
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
  } catch {
    // Read any alert/notification to understand the error
    const alerts = page.locator('[role="alert"]');
    const alertCount = await alerts.count();
    let alertText = '';
    for (let i = 0; i < alertCount; i++) {
      alertText += (await alerts.nth(i).textContent()) + ' | ';
    }
    console.log(`Dialog still open. Alert/notification text: "${alertText}"`);

    // Check for toast notifications
    const toastText = await page.evaluate(() => {
      const toasts = document.querySelectorAll(
        '[role="status"], [aria-live="polite"], [class*="toast"], [class*="notification"]'
      );
      return Array.from(toasts)
        .map((t) => t.textContent)
        .join(' | ');
    });
    console.log(`Toast/notification elements: "${toastText}"`);

    // Re-throw the error
    throw new Error(`Account creation failed. Alerts: "${alertText}". Toasts: "${toastText}"`);
  }
  await page.waitForTimeout(1000);
});

// ============================================================================
// THEN - Detail Panel & Delete
// ============================================================================

Then('debe ver el panel de detalle con la información de la cuenta', async ({ page }) => {
  await expect(page.getByText('Saldo actual').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Cuenta desde').first()).toBeVisible({ timeout: 3000 });
  // Detail panel has Tasa EA and Interés anual info
  await expect(page.getByText('Tasa EA').first()).toBeVisible({ timeout: 3000 });
});

Then('debe ver el modal de confirmación {string}', async ({ page }, title: string) => {
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('h2')).toHaveText(title);
});

Then('la cuenta debe ser eliminada del grid', async ({ page }) => {
  // Wait for page refresh (router.refresh() after deletion)
  // The account card should be gone
  await expect(page.locator('[data-account-id]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// THEN - Mobile
// ============================================================================

Then('la página de cuentas debe mostrarse correctamente en mobile', async ({ page }) => {
  await expect(page.getByRole('main')).toBeVisible({ timeout: 5000 });
  // The bottom nav bar should be visible on mobile
  const bottomNav = page.locator('.md\\:hidden.fixed.bottom-0');
  await expect(bottomNav).toBeVisible({ timeout: 3000 });
  // Account sections should still be visible
  await expect(page.getByText('Cuentas de Banco').first()).toBeVisible({ timeout: 5000 });
});

// ============================================================================
// THEN - Skeleton/Loading
// ============================================================================

Then('el skeleton de carga puede mostrarse inicialmente', async ({ page }) => {
  try {
    await expect(page.locator('.animate-pulse').first()).toBeVisible({ timeout: 2000 });
  } catch {
    console.log('Skeleton not visible - content may have loaded too fast');
  }
});

Then('eventualmente el contenido de cuentas debe cargarse', async ({ page }) => {
  await expect(page.getByRole('main')).toBeVisible({ timeout: 10000 });
});

// ============================================================================
// EDITAR CUENTA - EDIT MODAL
// ============================================================================

/** Types a percentage value (e.g. "8.5") into a FormattedNumericInput rate field (hundredths). */
async function fillRateInput(
  page: Page,
  dialogLocator: ReturnType<typeof getOpenDialog>,
  selector: string,
  rate: string
) {
  const rateInput = dialogLocator.locator(selector);
  await rateInput.click();
  // Clear existing value by pressing Backspace multiple times
  for (let i = 0; i < 10; i++) {
    await rateInput.press('Backspace');
  }
  // Rate is stored in hundredths: "8.5" → 850 → type "850"
  const hundredths = Math.round(parseFloat(rate) * 100).toString();
  for (const digit of hundredths) {
    await rateInput.press(digit);
  }
}

When('hace clic en "Editar" en el panel de detalle', async ({ page }) => {
  // The edit button in the AccountFullDetail top bar has aria-label="Editar"
  await page.getByRole('button', { name: 'Editar', exact: true }).click();
});

Then('debe ver el modal de edición con el campo {string}', async ({ page }, fieldName: string) => {
  const dialog = page.getByRole('dialog', { name: 'Editar' });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.getByText(fieldName, { exact: false }).first()).toBeVisible({
    timeout: 3000,
  });
});

When(
  'cambia el nombre de la cuenta a un nombre único con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniqueEditedAccountName(page, prefix);
    const dialog = page.getByRole('dialog', { name: 'Editar' });
    await dialog.locator('#edit-name').fill(name);
  }
);

When('cambia la tasa de interés a {string}', async ({ page }, rate: string) => {
  await fillRateInput(page, getOpenDialog(page), '#edit-rate', rate);
});

When('guarda los cambios de la cuenta', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Editar' });
  await dialog.getByRole('button', { name: 'Guardar Cambios' }).click();
  // Modal closes on success
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 15000 });
});

When('cierra el panel de detalle de la cuenta', async ({ page }) => {
  // Back button in the detail top bar has text "Cuentas" (detail.back)
  await page.getByRole('button', { name: 'Cuentas', exact: true }).click();
  // The overlay animates closed and BankAccountsSection triggers router.refresh()
  await page.waitForTimeout(1200);
});

Then('el grid debe mostrar la cuenta editada con el nuevo nombre', async ({ page }) => {
  const name = await getStoredEditedAccountName(page);
  await expect(page.getByRole('button', { name, exact: true })).toBeVisible({ timeout: 10000 });
});

Then(
  'la tarjeta de la cuenta editada debe mostrar la tasa {string}',
  async ({ page }, rateText: string) => {
    const name = await getStoredEditedAccountName(page);
    const card = page.getByRole('button', { name, exact: true });
    await expect(card).toContainText(rateText, { timeout: 5000 });
  }
);

// ============================================================================
// BOLSILLOS - CRUD DESDE EL DETALLE
// ============================================================================

When('hace clic en "Agregar" en el detalle', async ({ page }) => {
  // The add-pocket button in the detail has text "Agregar" (detail.addPocket)
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
});

Then('debe ver el modal de creación en modo bolsillo', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog).toBeVisible({ timeout: 5000 });
  // POCKET mode title = newPocket ("Nuevo bolsillo")
  await expect(dialog.locator('h2')).toHaveText('Nuevo bolsillo');
  // The pocket name field label comes from the dictionary (pocketName)
  await expect(dialog.getByText('Nombre del bolsillo').first()).toBeVisible({ timeout: 3000 });
});

When(
  'ingresa un nombre único de bolsillo con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniquePocketName(page, prefix);
    const dialog = getOpenDialog(page);
    await dialog.locator('#acc-name').fill(name);
  }
);

When('ingresa {string} en la tasa de interés del bolsillo', async ({ page }, rate: string) => {
  await fillRateInput(page, getOpenDialog(page), '#acc-rate', rate);
});

When('envía el formulario de creación de bolsillo', async ({ page }) => {
  // Same submission mechanism as account creation: form.requestSubmit() to
  // properly trigger React's onSubmit handler (createBankAccount with POCKET type).
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    if (!dialog) return;
    const form = dialog.querySelector('form');
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    if (submitBtn) {
      form.requestSubmit(submitBtn);
    }
  });
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 60000 });
});

Then('el bolsillo debe aparecer en la sección de bolsillos', async ({ page }) => {
  const name = await getStoredPocketName(page);
  const pocketsList = page.locator('[data-pockets-list]');
  await expect(pocketsList).toBeVisible({ timeout: 10000 });
  await expect(pocketsList.getByText(name).first()).toBeVisible({ timeout: 10000 });
});

When('abre el detalle del bolsillo', async ({ page }) => {
  const name = await getStoredPocketName(page);
  const pocketCard = page.locator('[data-pockets-list] button').filter({ hasText: name }).first();
  await expect(pocketCard).toBeVisible({ timeout: 5000 });
  await pocketCard.click();
});

Then('debe ver el modal de detalle del bolsillo', async ({ page }) => {
  const name = await getStoredPocketName(page);
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver los textos del detalle del bolsillo {string}, {string} y {string}',
  async ({ page }, text1: string, text2: string, text3: string) => {
    const dialog = page.locator('dialog[open]').last();
    await expect(dialog.getByText(text1).first()).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(text2).first()).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText(text3).first()).toBeVisible({ timeout: 5000 });
  }
);

When('hace clic en "Editar bolsillo" en el detalle del bolsillo', async ({ page }) => {
  // PocketDetailModal edit button aria-label = pocketDetail.edit ("Editar bolsillo")
  await page.getByRole('button', { name: 'Editar bolsillo', exact: true }).click();
});

Then('debe ver el modal de edición de bolsillo', async ({ page }) => {
  // EditPocketModal h2 = edit ("Editar") + pocket badge ("Bolsillo")
  const dialog = page.getByRole('dialog', { name: 'Editar' });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.getByText('Bolsillo').first()).toBeVisible({ timeout: 3000 });
});

When(
  'cambia el nombre del bolsillo a un nombre único con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniquePocketName(page, prefix);
    const dialog = page.getByRole('dialog', { name: 'Editar' });
    await dialog.locator('#edit-pocket-name').fill(name);
  }
);

When('guarda los cambios del bolsillo', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Editar' });
  await dialog.getByRole('button', { name: 'Guardar Cambios' }).click();
  // EditPocketModal closes; PocketDetailModal stays open with liveName updated
  await expect(page.getByRole('dialog', { name: 'Editar' })).not.toBeVisible({ timeout: 15000 });
});

Then('el modal de detalle del bolsillo debe mostrar el nuevo nombre', async ({ page }) => {
  const name = await getStoredPocketName(page);
  const dialog = page.getByRole('dialog', { name });
  await expect(dialog).toBeVisible({ timeout: 5000 });
});

When('hace clic en "Eliminar bolsillo" en el detalle del bolsillo', async ({ page }) => {
  // PocketDetailModal delete button aria-label = pocketDetail.delete ("Eliminar bolsillo")
  await page.getByRole('button', { name: 'Eliminar bolsillo', exact: true }).click();
});

Then('debe ver el modal de confirmación de bolsillo {string}', async ({ page }, title: string) => {
  const dialog = page.getByRole('dialog', { name: title });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  await expect(dialog.locator('h2')).toHaveText(title);
});

When('confirma la eliminación del bolsillo', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Eliminar Bolsillo' });
  await dialog.locator('button').filter({ hasText: 'Eliminar' }).last().click();
  // DeleteConfirmModal closes on success (both success and error branches close it)
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 15000 });
});

Then('el bolsillo no debe aparecer en la sección de bolsillos', async ({ page }) => {
  const name = await getStoredPocketName(page);
  await expect(page.locator('[data-pockets-list]').getByText(name)).toHaveCount(0, {
    timeout: 15000,
  });
});

// ============================================================================
// MOVIMIENTOS DEL DETALLE - BÚSQUEDA, FILTRO Y PAGINACIÓN
// ============================================================================

When('abre el detalle de la cuenta {string}', async ({ page }, accountName: string) => {
  // AccountCard button has aria-label={account.name}
  const card = page.getByRole('button', { name: accountName, exact: true });
  await expect(card).toBeVisible({ timeout: 5000 });
  await card.click();
});

Then('debe ver la tabla de movimientos del detalle', async ({ page }) => {
  await expect(page.locator('table')).toBeVisible({ timeout: 10000 });
});

Then(
  'debe ver el indicador de paginación {string} en el detalle',
  async ({ page }, indicator: string) => {
    await expect(page.getByText(indicator, { exact: true })).toBeVisible({ timeout: 10000 });
  }
);

When('escribe {string} en el buscador de movimientos', async ({ page }, term: string) => {
  // Search input placeholder = detail.searchPlaceholder ("Buscar movimiento...")
  await page.getByPlaceholder('Buscar movimiento...').fill(term);
  // Search has a 300ms debounce before the fetch
  await page.waitForTimeout(800);
});

When('limpia el buscador de movimientos', async ({ page }) => {
  await page.getByPlaceholder('Buscar movimiento...').fill('');
  await page.waitForTimeout(800);
});

When('selecciona {string} en el filtro de tipo de movimientos', async ({ page }, label: string) => {
  // The detail type filter is the only visible select on the accounts page
  await page.getByRole('combobox').selectOption({ label });
  await page.waitForTimeout(600);
});

Then(
  'la descripción {string} debe estar visible en los movimientos',
  async ({ page }, desc: string) => {
    await expect(page.locator('table').getByText(desc).first()).toBeVisible({ timeout: 5000 });
  }
);

Then(
  'la descripción {string} no debe estar visible en los movimientos',
  async ({ page }, desc: string) => {
    await expect(page.locator('table').getByText(desc)).toHaveCount(0, { timeout: 5000 });
  }
);

When('hace clic en "Siguiente" en la paginación de movimientos', async ({ page }) => {
  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await page.waitForTimeout(800);
});

// ============================================================================
// DETALLE EN INGLÉS
// ============================================================================

When('cambia el idioma a {string} en la página de ajustes', async ({ page }, language: string) => {
  // The dashboard has no header language selector; the settings page exposes the
  // language switcher (changeLanguageAction + router.push to /en/settings).
  await page.goto('/es/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  await page.getByRole('button', { name: language, exact: true }).click();
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
});

When('navega a la página de cuentas en inglés', async ({ page }) => {
  await page.goto('/en/accounts', { waitUntil: 'domcontentloaded' });
});

Then('debe ver el detalle de la cuenta en inglés', async ({ page }) => {
  // English dictionary texts rendered by AccountFullDetail
  await expect(page.getByText('Current balance').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Annual interest').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Pockets').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Movements').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByPlaceholder('Search transactions...')).toBeVisible({ timeout: 5000 });
});
