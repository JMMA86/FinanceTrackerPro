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
import { storeUniqueAccountName, getStoredAccountName } from '../helpers/unique';

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
