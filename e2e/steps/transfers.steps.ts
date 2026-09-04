/**
 * Transfers Step Definitions
 * Tests for the transfer-between-accounts flow (TransferModal).
 *
 * Covers:
 *  - Happy path: double-entry transfer (TRANSFER_OUT debit + TRANSFER_IN credit)
 *  - Validation: "Transferir" button hidden with a single account
 *  - Error: INSUFFICIENT_FUNDS inline alert keeps the modal open
 *  - Validation: destination account select excludes the source account
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page, type Locator } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { getAccountBalancesByEmail, getAccountTotalBalancesByEmail } from '../helpers/db';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Shared transactions user (seeded with "Efectivo" + "Bancolombia Ahorros"). */
const TRANSACTIONS_USER = {
  email: process.env.E2E_TRANSACTIONS_USER || 'transactions@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD || 'E2ePassword123',
};

/**
 * Isolated pockets user (seeded in prisma/seed.e2e.ts):
 *   - "Cuenta Principal" (CHECKING)   balanceCents =  700.000 (external)
 *   - "Bolsillo Viajes"  (POCKET)      balanceCents =  200.000 (parent = Cuenta Principal)
 *   - "Bolsillo Mercado" (POCKET)      balanceCents =  100.000 (parent = Cuenta Principal)
 *   - "Cuenta Externa"   (SAVINGS)     balanceCents =  500.000
 * Displayed total on the parent card = 700.000 + 200.000 + 100.000 = 1.000.000.
 */
const POCKETS_USER = {
  email: process.env.E2E_POCKETS_USER || 'pockets@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD || 'E2ePassword123',
};

/**
 * localStorage key where the unique transfer description is stored so the row
 * assertions can match both TRANSFER_OUT and TRANSFER_IN (same description).
 */
const TRANSFER_DESC_KEY = '__e2eUniqueTransferDescription';

/**
 * localStorage key where the pre-transfer account balances (from the DB) are
 * stored. The transactions user's balances are mutated by earlier scenarios in
 * the same run, so the happy path reads the CURRENT balances and asserts the
 * post-transfer DELTA instead of an absolute seed value.
 */
const TRANSFER_BALANCES_KEY = '__e2eTransferBalances';

/**
 * localStorage key where the pre-transfer TOTAL balances (external + pockets)
 * of the pockets user are stored. The pockets scenarios assert that an internal
 * transfer does NOT change the displayed total on the parent account card.
 */
const POCKET_TOTALS_KEY = '__e2ePocketTotalBalances';

// ============================================================================
// HELPERS
// ============================================================================

/** The transfer modal <dialog> (accessible name from aria-labelledby → h2). */
function getTransferDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Transferir entre cuentas' });
}

/** Stores a unique transfer description on the page for later steps. */
async function storeTransferDescription(page: Page, description: string) {
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
    },
    { key: TRANSFER_DESC_KEY, value: description }
  );
}

/** Reads the unique transfer description stored by the create step. */
async function getStoredTransferDescription(page: Page): Promise<string> {
  const description = await page.evaluate((key) => {
    return window.localStorage.getItem(key) ?? undefined;
  }, TRANSFER_DESC_KEY);
  if (!description) throw new Error('No unique transfer description stored on the page');
  return description;
}

/** Selects an account in a transfer AccountSelect (origin/destination) by partial name. */
async function selectTransferAccount(page: Page, selectName: string, accountName: string) {
  const dialog = getTransferDialog(page);
  const combo = dialog.getByRole('combobox', { name: new RegExp(selectName, 'i') });
  await combo.click();

  const controlsId = await combo.getAttribute('aria-controls');
  const listbox = controlsId ? dialog.locator(`#${controlsId}`) : dialog.getByRole('listbox');
  await expect(listbox).toBeVisible({ timeout: 5000 });

  const option = listbox.getByRole('option', { name: new RegExp(accountName, 'i') });
  await option.click();
  await expect(listbox).not.toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(150);
}

/**
 * Fills the transfer amount input. FormattedNumericInput updates on keyDown
 * (not on native fill), so we clear with Backspace and type each digit.
 */
async function fillTransferAmount(page: Page, dialog: Locator, amount: string) {
  const amountInput = dialog.getByRole('textbox', { name: /^valor/i });
  await amountInput.click();
  for (let i = 0; i < 10; i++) {
    await amountInput.press('Backspace');
  }
  for (const digit of amount) {
    await amountInput.press(digit);
  }
  await page.waitForTimeout(200);
}

/** Asserts an account card on /es/accounts shows the given balance in es-CO. */
async function expectAccountBalance(page: Page, accountName: string, balanceCents: number) {
  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const card = page.getByRole('button', { name: accountName, exact: true });
  await expect(card).toBeVisible({ timeout: 5000 });
  const expectedNumber = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(balanceCents / 100);
  await expect(card).toContainText(expectedNumber, { timeout: 5000 });
}

/** Reads the pre-transfer balances stored by the Given step. */
async function getStoredTransferBalances(page: Page): Promise<Record<string, number>> {
  const raw = await page.evaluate((key) => {
    return window.localStorage.getItem(key) ?? '{}';
  }, TRANSFER_BALANCES_KEY);
  return JSON.parse(raw) as Record<string, number>;
}

/** Reads the pre-transfer TOTAL balances (external + pockets) stored by the Given step. */
async function getStoredPocketTotals(page: Page): Promise<Record<string, number>> {
  const raw = await page.evaluate((key) => {
    return window.localStorage.getItem(key) ?? '{}';
  }, POCKET_TOTALS_KEY);
  return JSON.parse(raw) as Record<string, number>;
}

// ============================================================================
// GIVEN - State
// ============================================================================

Given('guarda los saldos actuales de las cuentas de transferencia', async ({ page }) => {
  const balances = await getAccountBalancesByEmail(TRANSACTIONS_USER.email);
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: TRANSFER_BALANCES_KEY, value: balances }
  );
});

Given('que el usuario de bolsillos ha iniciado sesión', async ({ page }) => {
  await loginAs(page, POCKETS_USER.email, POCKETS_USER.password);
});

Given('guarda los saldos totales de las cuentas de bolsillo', async ({ page }) => {
  const totals = await getAccountTotalBalancesByEmail(POCKETS_USER.email);
  await page.evaluate(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: POCKET_TOTALS_KEY, value: totals }
  );
});

// ============================================================================
// WHEN - Open modal & fill form
// ============================================================================

When('abre el modal de transferencia', async ({ page }) => {
  await page.getByRole('button', { name: 'Transferir', exact: true }).click();
  await expect(getTransferDialog(page)).toBeVisible({ timeout: 5000 });
});

When('selecciona {string} como cuenta origen', async ({ page }, accountName: string) => {
  await selectTransferAccount(page, 'Cuenta origen', accountName);
});

When('selecciona {string} como cuenta destino', async ({ page }, accountName: string) => {
  await selectTransferAccount(page, 'Cuenta destino', accountName);
});

When('ingresa {string} en el campo valor de transferencia', async ({ page }, amount: string) => {
  await fillTransferAmount(page, getTransferDialog(page), amount);
});

When(
  'ingresa una descripción única de transferencia {string}',
  async ({ page }, prefix: string) => {
    const description = `${prefix} ${Date.now()}`;
    await storeTransferDescription(page, description);
    const dialog = getTransferDialog(page);
    const descInput = dialog.getByRole('textbox', { name: /descripción/i });
    await descInput.fill(description);
    await page.waitForTimeout(200);
  }
);

// ============================================================================
// WHEN - Submit
// ============================================================================

When('envía la transferencia', async ({ page }) => {
  const dialog = getTransferDialog(page);
  // The only button named exactly "Transferir" inside the dialog is the submit.
  await dialog.getByRole('button', { name: 'Transferir', exact: true }).click();
  // On success onClose() animates the dialog out (~240ms) and the server action
  // revalidates transactions/accounts/dashboard — the table refreshes in place.
  await expect(dialog).not.toBeVisible({ timeout: 15000 });
});

When('envía la transferencia esperando error', async ({ page }) => {
  const dialog = getTransferDialog(page);
  const submitBtn = dialog.getByRole('button', { name: 'Transferir', exact: true });
  await submitBtn.click();
  // While submitting the button becomes "Transfiriendo..." and disabled; when the
  // server responds with an error it re-enables and the inline alert renders.
  await expect(submitBtn).toBeEnabled({ timeout: 15000 });
  await page.waitForTimeout(300);
});

When('hace clic en {string} en el modal de transferencia', async ({ page }, label: string) => {
  const dialog = getTransferDialog(page);
  if (label === 'Cancelar') {
    // Backdrop + close X + footer "Cancelar" all share the name; use the footer.
    await dialog.getByRole('button', { name: label, exact: true }).last().click();
  } else {
    await dialog.getByRole('button', { name: new RegExp(label, 'i') }).click();
  }
});

// ============================================================================
// THEN - Visibility & modal state
// ============================================================================

Then('el botón {string} debe estar visible', async ({ page }, buttonName: string) => {
  await expect(page.getByRole('button', { name: buttonName, exact: true })).toBeVisible({
    timeout: 5000,
  });
});

Then('el modal de transferencia debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 5000 });
});

Then('el modal de transferencia debe permanecer abierto', async ({ page }) => {
  await expect(getTransferDialog(page)).toBeVisible({ timeout: 5000 });
});

Then(
  'debe ver el error {string} dentro del modal de transferencia',
  async ({ page }, message: string) => {
    const dialog = getTransferDialog(page);
    await expect(dialog.getByRole('alert').filter({ hasText: message })).toBeVisible({
      timeout: 5000,
    });
  }
);

// ============================================================================
// THEN - Double-entry table rows
// ============================================================================

Then('la fila de transferencia enviada debe aparecer con monto negativo', async ({ page }) => {
  const description = await getStoredTransferDescription(page);
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
  const row = table
    .getByRole('row')
    .filter({ hasText: description })
    .filter({ hasText: 'Transferencia enviada' })
    .first();
  await expect(row).toBeVisible({ timeout: 10000 });
  // TRANSFER_OUT renders a debit: rose-400 amount prefixed with "-".
  const amount = row.locator('span.text-rose-400').first();
  await expect(amount).toBeVisible({ timeout: 5000 });
  await expect(amount).toHaveText(/-/);
});

Then('la fila de transferencia recibida debe aparecer con monto positivo', async ({ page }) => {
  const description = await getStoredTransferDescription(page);
  const table = page.getByRole('table', { name: 'Transacciones' });
  await expect(table).toBeVisible({ timeout: 5000 });
  const row = table
    .getByRole('row')
    .filter({ hasText: description })
    .filter({ hasText: 'Transferencia recibida' })
    .first();
  await expect(row).toBeVisible({ timeout: 10000 });
  // TRANSFER_IN renders a credit: emerald-400 amount prefixed with "+".
  const amount = row.locator('span.text-emerald-400').first();
  await expect(amount).toBeVisible({ timeout: 5000 });
  await expect(amount).toHaveText(/\+/);
});

// ============================================================================
// THEN - Destination select excludes source
// ============================================================================

Then(
  'las opciones del campo destino no deben incluir {string}',
  async ({ page }, accountName: string) => {
    const dialog = getTransferDialog(page);
    const combo = dialog.getByRole('combobox', { name: /cuenta destino/i });
    // The AccountSelect listbox is only in the DOM while the dropdown is open.
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

Then(
  'las opciones del campo destino deben incluir {string}',
  async ({ page }, accountName: string) => {
    const dialog = getTransferDialog(page);
    const combo = dialog.getByRole('combobox', { name: /cuenta destino/i });
    await combo.click();
    const listbox = dialog.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 5000 });
    const options = await listbox.getByRole('option').allTextContents();
    expect(options.some((o) => o.toLowerCase().includes(accountName.toLowerCase()))).toBeTruthy();
    await dialog.getByRole('heading', { name: 'Transferir entre cuentas' }).click();
    await expect(listbox).not.toBeVisible({ timeout: 5000 });
  }
);

// ============================================================================
// THEN - Post-transfer balance deltas (accounts page)
// ============================================================================

Then(
  'la cuenta {string} debe mostrar el saldo reducido en {int} por la transferencia',
  async ({ page }, accountName: string, amountCents: number) => {
    const balances = await getStoredTransferBalances(page);
    const before = balances[accountName];
    if (before === undefined) {
      throw new Error(`No pre-transfer balance stored for account "${accountName}"`);
    }
    await expectAccountBalance(page, accountName, before - amountCents);
  }
);

Then(
  'la cuenta {string} debe mostrar el saldo incrementado en {int} por la transferencia',
  async ({ page }, accountName: string, amountCents: number) => {
    const balances = await getStoredTransferBalances(page);
    const before = balances[accountName];
    if (before === undefined) {
      throw new Error(`No pre-transfer balance stored for account "${accountName}"`);
    }
    await expectAccountBalance(page, accountName, before + amountCents);
  }
);

Then(
  'la cuenta {string} debe mostrar el MISMO saldo total tras la transferencia a bolsillo',
  async ({ page }, accountName: string) => {
    const totals = await getStoredPocketTotals(page);
    const expected = totals[accountName];
    if (expected === undefined) {
      throw new Error(`No pre-transfer total balance stored for account "${accountName}"`);
    }
    // An internal transfer (parent ⇄ pocket or pocket ⇄ sibling pocket) moves
    // money WITHIN the parent account, so the parent card total (external +
    // pockets) must be identical before and after the transfer.
    await expectAccountBalance(page, accountName, expected);
  }
);
