/**
 * Investment Structured Trades Step Definitions
 *
 * Covers the seeded, deterministic structured BUY trades of the
 * "Portafolio Trade E2E" account: rendering, decimal-comma editing end-to-end,
 * undo (soft-delete) and the sell modal's decimal input.
 *
 * These scenarios NEVER select a symbol from the market search nor depend on the
 * server-side quote to build their data — the trades come from `prisma/seed.e2e.ts`.
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { getInvestmentTradeByKey } from '../helpers/db';
import { INVESTMENTS_TRADES_USER, INVESTMENTS_TRADES_FIXTURE } from '../fixtures';

// ============================================================================
// HELPERS
// ============================================================================

/** Maps the seeded symbol to its deterministic idempotency key. */
function seededTradeKey(symbol: string): string {
  if (symbol === 'AAPL') return INVESTMENTS_TRADES_FIXTURE.aaplBuyIdempotencyKey;
  if (symbol === 'MSFT') return INVESTMENTS_TRADES_FIXTURE.msftBuyIdempotencyKey;
  throw new Error(`seededTradeKey: unknown seeded symbol "${symbol}"`);
}

/**
 * Locates one activity row by the structured trade text
 * (`"<quantity> <SYMBOL> · <price>"`) and its edit action. The innermost
 * matching <div> is the row itself (its container also matches the text), so
 * `.last()` returns the row.
 */
function tradeRow(page: Page, symbol: string) {
  return page
    .locator('div')
    .filter({ has: page.getByText(new RegExp(`\\d+(?:[.,]\\d+)?\\s*${symbol}\\b`)) })
    .filter({ has: page.getByRole('button', { name: 'Editar operación' }) })
    .last();
}

/** The currently open native <dialog> (only one modal is open at a time). */
function openDialog(page: Page) {
  return page.locator('dialog[open]').first();
}

// ============================================================================
// GIVEN
// ============================================================================

Given('que el usuario de operaciones de inversión ha iniciado sesión', async ({ page }) => {
  await loginAs(page, INVESTMENTS_TRADES_USER.email, INVESTMENTS_TRADES_USER.password);
});

// ============================================================================
// THEN — Structured activity rendering
// ============================================================================

Then(
  'la actividad de inversión debe mostrar {string} de {string} con cantidad {string}',
  async ({ page }, label: string, symbol: string, quantity: string) => {
    const row = tradeRow(page, symbol);
    await expect(row).toBeVisible({ timeout: 20000 });
    await expect(row.getByText(label, { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(row.getByText(new RegExp(`${quantity}\\s*${symbol}\\b`))).toBeVisible({
      timeout: 10000,
    });
  }
);

Then(
  'los botones {string} y {string} de la operación {string} deben estar visibles y habilitados',
  async ({ page }, first: string, second: string, symbol: string) => {
    const row = tradeRow(page, symbol);
    await expect(row).toBeVisible({ timeout: 20000 });

    const firstButton = row.getByRole('button', { name: first });
    await expect(firstButton).toBeVisible({ timeout: 10000 });
    await expect(firstButton).toBeEnabled();

    const secondButton = row.getByRole('button', { name: second });
    await expect(secondButton).toBeVisible({ timeout: 10000 });
    await expect(secondButton).toBeEnabled();
  }
);

// ============================================================================
// WHEN — Edit action
// ============================================================================

When(
  'hace clic en {string} de la operación {string}',
  async ({ page }, action: string, symbol: string) => {
    const row = tradeRow(page, symbol);
    await expect(row).toBeVisible({ timeout: 20000 });
    await row.getByRole('button', { name: action }).click();
  }
);

Then(
  'el modal de edición debe estar visible con título {string}',
  async ({ page }, title: string) => {
    const dialog = openDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('h2')).toHaveText(title);
  }
);

When('escribe {string} en la cantidad de la operación', async ({ page }, value: string) => {
  const qty = page.locator('#edit-trade-qty');
  await expect(qty).toBeVisible({ timeout: 10000 });
  // `fill` replaces the seeded quantity and fires the React onChange, which
  // sanitizes the comma separator exactly like a real keystroke would.
  await qty.fill(value);
});

When('guarda los cambios de la operación', async ({ page }) => {
  const dialog = openDialog(page);
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click();

  // Two deterministic outcomes: the update commits directly, or the ±2% market
  // price guard raises the override confirmation (the seeded trade price is far
  // from the live quote, so this is the expected branch in practice).
  const overrideCta = page.getByRole('button', { name: 'Registrar con mi precio' });
  await Promise.race([
    overrideCta.waitFor({ state: 'visible', timeout: 30000 }).catch(() => {}),
    dialog.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {}),
  ]);
  if (await overrideCta.isVisible().catch(() => false)) {
    await overrideCta.click();
  }

  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 30000 });
});

Then('el modal de edición debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

Then(
  'la operación {string} debe tener cantidad {string} en la base de datos',
  async ({ page }, symbol: string, quantity: string) => {
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
    const trade = await getInvestmentTradeByKey(
      INVESTMENTS_TRADES_USER.email,
      seededTradeKey(symbol)
    );
    expect(trade.isActive).toBe(true);
    expect(trade.assetSymbol).toBe(symbol);
    expect(trade.assetQuantity).toBe(quantity);
  }
);

// ============================================================================
// WHEN/THEN — Undo action
// ============================================================================

Then(
  'el diálogo de deshacer debe estar visible con título {string}',
  async ({ page }, title: string) => {
    const dialog = openDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('h2')).toHaveText(title);
  }
);

When('confirma deshacer la operación', async ({ page }) => {
  const dialog = openDialog(page);
  // `exact` so it never matches the row action "Deshacer operación".
  await dialog.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 30000 });
});

Then('el diálogo de deshacer debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

Then(
  'la operación {string} ya no debe aparecer en la actividad',
  async ({ page }, symbol: string) => {
    await expect(tradeRow(page, symbol)).toHaveCount(0, { timeout: 15000 });
  }
);

Then(
  'la operación {string} debe quedar inactiva en la base de datos',
  async ({ page }, symbol: string) => {
    await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
    const trade = await getInvestmentTradeByKey(
      INVESTMENTS_TRADES_USER.email,
      seededTradeKey(symbol)
    );
    expect(trade.isActive).toBe(false);
    expect(trade.assetSymbol).toBe(symbol);
  }
);

// ============================================================================
// WHEN/THEN — Sell modal decimal input
// ============================================================================

When(
  'hace clic en {string} para el activo {string}',
  async ({ page }, action: string, symbol: string) => {
    await page.getByRole('button', { name: `${action} ${symbol}` }).click();
  }
);

Then(
  'el modal de venta debe estar visible con título {string}',
  async ({ page }, title: string) => {
    const dialog = openDialog(page);
    await expect(dialog).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator('h2')).toHaveText(title);
  }
);

When('escribe {string} en la cantidad de venta', async ({ page }, value: string) => {
  const qty = page.locator('#sell-qty');
  await expect(qty).toBeVisible({ timeout: 10000 });
  await qty.fill(value);
});

Then('la cantidad de venta debe mostrarse como {string}', async ({ page }, value: string) => {
  await expect(page.locator('#sell-qty')).toHaveValue(value);
});
