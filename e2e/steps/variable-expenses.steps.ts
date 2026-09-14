/**
 * Variable Expenses Step Definitions
 * Covers the /variable-expenses module (monitored definitions): empty state,
 * summary cards, seeded definitions, create definition, detail filters (month +
 * definition), trend, scroll and expense registration, plus the transaction
 * form's Normal / Fijo / Variable natures.
 *
 * Precondition definitions/accounts are created by prisma/seed.e2e.ts and
 * referenced by name. Mutating scenarios create their own definitions via the UI
 * with UNIQUE timestamp names (see helpers/unique.ts) so a CI retry (which does
 * NOT reset the DB between attempts) never collides with leftover rows.
 *
 * All navigation lives in When steps — a Given only establishes state.
 * No fixed timeouts: Playwright auto-wait + auto-retry assertions.
 *
 * PRODUCTION FINDING (mirrors fixed-expenses.steps.ts): after a mutation the app
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
import { VARIABLE_EXPENSES_TEST_USER, VARIABLE_EXPENSES_EMPTY_USER } from '../fixtures';
import { getVariableExpenseMonthStatByEmail } from '../helpers/db';
import { selectAccount } from '../helpers/select';
import {
  storeUniqueVariableExpenseName,
  getStoredVariableExpenseName,
  storeUniqueVariableTxNote,
  getStoredVariableTxNote,
  setWindowValue,
  getWindowValue,
} from '../helpers/unique';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Seeded CHECKING/COP account used as the expense source. */
const VARIABLE_EXPENSES_ACCOUNT_NAME = 'Cuenta Corriente';

/** localStorage key prefix for the per-definition current-month count baseline. */
const VARIABLE_COUNT_KEY_PREFIX = '__e2eVariableCount_';

// ============================================================================
// HELPERS
// ============================================================================

/** Gets the currently open native <dialog> (with the open attribute). */
function getOpenDialog(page: Page): Locator {
  return page.locator('dialog[open]').first();
}

/** The definitions list section (aria-label "Definiciones" / "Definitions"). */
function getDefinitionsRegion(page: Page): Locator {
  return page.getByRole('region', { name: /^(Definiciones|Definitions)$/ });
}

/** Finds a monitored-definition card (<li>) inside the definitions list by name. */
function getDefinitionCard(page: Page, definitionName: string): Locator {
  return getDefinitionsRegion(page)
    .getByRole('listitem')
    .filter({ hasText: definitionName })
    .first();
}

/**
 * Waits until an opened variable-expenses modal is fully mounted and its form
 * state has settled. The dialogs run reset() + a requestAnimationFrame on open,
 * so filling a field before that rAF fires would get clobbered. The backdrop
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
 * Selects an option from a native <select> by PARTIAL visible text. Used for the
 * fixed-expense / variable-expense pickers (labels include the formatted amount,
 * which uses a locale non-breaking space and is therefore brittle to match
 * literally) and for the async-loaded definition options.
 */
async function selectByPartialOption(select: Locator, partialText: string): Promise<void> {
  await expect(select).toBeVisible({ timeout: 10000 });
  const option = select.locator('option').filter({ hasText: partialText }).first();
  await expect.poll(() => option.count(), { timeout: 10000 }).toBeGreaterThan(0);
  const value = await option.getAttribute('value');
  if (!value) throw new Error(`No option value found for "${partialText}"`);
  await select.selectOption(value);
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
      '[variable-expenses-refresh] stale RSC data — forcing full reload:',
      error instanceof Error ? error.message.split('\n')[0] : error
    );
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await assertion();
  }
}

// ============================================================================
// GIVEN - Authentication & State
// ============================================================================

Given('que el usuario de gastos variables ha iniciado sesión', async ({ page }) => {
  await loginAs(page, VARIABLE_EXPENSES_TEST_USER.email, VARIABLE_EXPENSES_TEST_USER.password);
});

Given('que el usuario sin definiciones variables ha iniciado sesión', async ({ page }) => {
  await loginAs(page, VARIABLE_EXPENSES_EMPTY_USER.email, VARIABLE_EXPENSES_EMPTY_USER.password);
});

Given(
  'guarda el conteo del mes de la definición {string} como {string}',
  async ({ page }, definitionName: string, key: string) => {
    const stat = await getVariableExpenseMonthStatByEmail(
      VARIABLE_EXPENSES_TEST_USER.email,
      definitionName
    );
    await setWindowValue(page, `${VARIABLE_COUNT_KEY_PREFIX}${key}`, String(stat.count));
  }
);

// ============================================================================
// WHEN - Navigation
// ============================================================================

When('navega a la página de gastos variables', async ({ page }) => {
  await page.goto('/es/variable-expenses', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Gastos Variables' })).toBeVisible({
    timeout: 15000,
  });
});

When('navega a la página de gastos variables en inglés', async ({ page }) => {
  await page.goto('/en/variable-expenses', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Variable Expenses' })).toBeVisible({
    timeout: 15000,
  });
});

// ============================================================================
// WHEN - Create definition modal
// ============================================================================

When('abre el modal de creación de definición variable', async ({ page }) => {
  await page.getByRole('button', { name: 'Nueva definición', exact: true }).click();
  await waitForModalSettled(page);
  // Categories load asynchronously after the modal mounts; wait for the radios.
  await expect(getOpenDialog(page).getByRole('radio', { name: 'Entretenimiento' })).toBeVisible({
    timeout: 10000,
  });
});

When(
  'ingresa un nombre único de definición variable con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniqueVariableExpenseName(page, prefix);
    await getOpenDialog(page).locator('#definition-name').fill(name);
  }
);

When(
  'selecciona la categoría de la definición {string}',
  async ({ page }, categoryName: string) => {
    const dialog = getOpenDialog(page);
    const radio = dialog.getByRole('radio', { name: categoryName });
    // The radio is sr-only: click its wrapping <label> to activate it natively.
    await radio.locator('xpath=..').click();
    await expect(radio).toBeChecked();
  }
);

When(
  'ingresa {string} veces por mes como objetivo de la definición',
  async ({ page }, times: string) => {
    await getOpenDialog(page).locator('#definition-times').fill(times);
  }
);

When('ingresa {string} como monto esperado de la definición', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#definition-amount'), amount);
});

When('envía el formulario de creación de definición variable', async ({ page }) => {
  // Success: onClose() closes the dialog and router.refresh() re-renders the list.
  await getOpenDialog(page).locator('button[type="submit"]').click();
});

// ============================================================================
// WHEN - Register expense from a definition
// ============================================================================

When('abre el registro de gasto para la definición {string}', async ({ page }, definitionName) => {
  const card = getDefinitionCard(page, definitionName);
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.getByRole('button', { name: 'Registrar', exact: true }).click();
  await waitForModalSettled(page);
});

When(
  'registra un gasto variable con nota única {string} y monto {string}',
  async ({ page }, notePrefix: string, amount: string) => {
    const note = await storeUniqueVariableTxNote(page, notePrefix);
    const dialog = getOpenDialog(page);
    await fillCentsInput(dialog.locator('#register-amount'), amount);
    await selectAccount(page, 'Cuenta de origen', VARIABLE_EXPENSES_ACCOUNT_NAME);
    await dialog.locator('#register-notes').fill(note);
    await dialog.locator('button[type="submit"]').click();
  }
);

// ============================================================================
// WHEN - Detail modal
// ============================================================================

When('abre el detalle de la definición {string}', async ({ page }, definitionName) => {
  const card = getDefinitionCard(page, definitionName);
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.getByRole('button', { name: `Detalle: ${definitionName}`, exact: true }).click();
  await waitForModalSettled(page);
  await expect(getOpenDialog(page).getByRole('heading', { level: 2 })).toContainText(
    definitionName,
    { timeout: 10000 }
  );
});

When('filtra el detalle por la definición {string}', async ({ page }, definitionLabel: string) => {
  const select = getOpenDialog(page).getByLabel('Gasto variable');
  if (definitionLabel === 'Todos los gastos variables') {
    await select.selectOption('');
  } else {
    await select.selectOption({ label: definitionLabel });
  }
});

When('filtra los movimientos del detalle por {string}', async ({ page }, periodLabel: string) => {
  const select = getOpenDialog(page).getByLabel('Movimientos');
  if (periodLabel === 'Todos los movimientos') {
    await select.selectOption('all');
  } else {
    await select.selectOption({ label: periodLabel });
  }
});

// ============================================================================
// WHEN - Transaction form natures
// ============================================================================

When('selecciona la naturaleza de gasto {string}', async ({ page }, nature: string) => {
  await getOpenDialog(page).getByRole('button', { name: nature, exact: true }).click();
});

When(
  'selecciona la definición variable {string} en el formulario de transacción',
  async ({ page }, definitionName: string) => {
    await selectByPartialOption(
      getOpenDialog(page).locator('#tx-variable-expense'),
      definitionName
    );
  }
);

When('ingresa {string} en el campo valor de la transacción', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#tx-amount'), amount);
});

When(
  'ingresa una descripción única de transacción variable con prefijo {string}',
  async ({ page }, prefix: string) => {
    const description = await storeUniqueVariableTxNote(page, prefix);
    await getOpenDialog(page).locator('#tx-description').fill(description);
  }
);

When('envía el formulario de transacción variable', async ({ page }) => {
  await getOpenDialog(page).locator('button[type="submit"]').click();
});

When(
  'selecciona el gasto fijo {string} en el formulario de transacción',
  async ({ page }, expenseName: string) => {
    await selectByPartialOption(getOpenDialog(page).locator('#tx-fixed-expense'), expenseName);
  }
);

// ============================================================================
// THEN - Summary & seeded definitions
// ============================================================================

Then('debe ver las tarjetas de resumen de gastos variables', async ({ page }) => {
  const summary = page.getByRole('region', { name: 'Resumen' });
  await expect(summary).toBeVisible({ timeout: 15000 });
  await expect(summary.getByText('Total Monitoreado', { exact: true })).toBeVisible();
  await expect(summary.getByText('Nº de Transacciones', { exact: true })).toBeVisible();
  await expect(summary.getByText('Definiciones', { exact: true })).toBeVisible();
});

Then('la definición {string} debe aparecer en la lista', async ({ page }, definitionName) => {
  await expectWithRscReloadFallback(page, async () => {
    await expect(getDefinitionCard(page, definitionName)).toBeVisible({ timeout: 8000 });
  });
});

Then(
  'la definición {string} debe mostrar su categoría {string}',
  async ({ page }, definitionName: string, categoryName: string) => {
    const card = getDefinitionCard(page, definitionName);
    await expect(card).toBeVisible({ timeout: 10000 });
    // The category is the only <span> whose text is exactly the category name
    // (the definition name is rendered in a <p>), so a regex-anchored span filter
    // never collides when the name and the category share the same word.
    const escaped = categoryName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    await expect(
      card
        .locator('span')
        .filter({ hasText: new RegExp(`^${escaped}$`) })
        .first()
    ).toBeVisible({ timeout: 10000 });
  }
);

Then(
  'la definición {string} debe mostrar el resumen esperado vs real',
  async ({ page }, definitionName: string) => {
    const card = getDefinitionCard(page, definitionName);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card.getByText('Esperado:', { exact: false })).toBeVisible();
    await expect(card.getByText('Real:', { exact: false })).toBeVisible();
    // The real line renders "N de M veces · $real de $esperado".
    await expect(card.getByText('veces', { exact: false }).first()).toBeVisible();
    await expect(card.getByText(' de ', { exact: false }).first()).toBeVisible();
  }
);

Then(
  'la definición con el nombre único debe aparecer en la lista con la categoría {string}',
  async ({ page }, categoryName: string) => {
    const name = await getStoredVariableExpenseName(page);
    await expectWithRscReloadFallback(page, async () => {
      const card = getDefinitionCard(page, name);
      await expect(card).toBeVisible({ timeout: 8000 });
      await expect(card.getByText(categoryName, { exact: true })).toBeVisible({ timeout: 8000 });
    });
  }
);

// ============================================================================
// THEN - Detail (trend, all definitions, scroll)
// ============================================================================

Then(
  'el detalle debe mostrar la tendencia de la definición {string}',
  async ({ page }, definitionName: string) => {
    const dialog = getOpenDialog(page);
    await expect(dialog.getByRole('heading', { name: 'Tendencia' })).toBeVisible({
      timeout: 10000,
    });
    await expect(
      dialog.getByRole('img', { name: new RegExp(`Tendencia ${definitionName}`) })
    ).toBeVisible({ timeout: 10000 });
  }
);

Then('el detalle no debe mostrar la tendencia', async ({ page }) => {
  await expect(getOpenDialog(page).getByRole('heading', { name: 'Tendencia' })).toHaveCount(0, {
    timeout: 10000,
  });
});

Then('el detalle debe listar movimientos de todas las definiciones', async ({ page }) => {
  const dialog = getOpenDialog(page);
  // Two different seeded definitions prove the "all" filter aggregates movements.
  await expect(dialog.getByText('Café E2E', { exact: false }).first()).toBeVisible({
    timeout: 10000,
  });
  await expect(dialog.getByText('Mercado E2E', { exact: false }).first()).toBeVisible({
    timeout: 10000,
  });
});

Then('la lista de movimientos del detalle debe ser desplazable', async ({ page }) => {
  const list = getOpenDialog(page).locator('ul.overflow-y-auto').first();
  await expect(list).toBeVisible({ timeout: 10000 });
  await expect
    .poll(() => list.evaluate((el) => el.scrollHeight > el.clientHeight), { timeout: 10000 })
    .toBe(true);
});

// ============================================================================
// THEN - Register expense
// ============================================================================

Then(
  'el conteo del mes de la definición {string} debe haber aumentado respecto a {string}',
  async ({ page }, definitionName: string, key: string) => {
    const raw = await getWindowValue(page, `${VARIABLE_COUNT_KEY_PREFIX}${key}`);
    if (raw === undefined) throw new Error(`No baseline count stored for key "${key}"`);
    const before = Number(raw);
    await expect
      .poll(
        async () =>
          (
            await getVariableExpenseMonthStatByEmail(
              VARIABLE_EXPENSES_TEST_USER.email,
              definitionName
            )
          ).count,
        { timeout: 15000 }
      )
      .toBeGreaterThan(before);
  }
);

Then('el detalle debe incluir la nota única del gasto variable', async ({ page }) => {
  const note = await getStoredVariableTxNote(page);
  await expect(getOpenDialog(page).getByText(note, { exact: false }).first()).toBeVisible({
    timeout: 10000,
  });
});

// ============================================================================
// THEN - Transaction form natures
// ============================================================================

Then(
  'el campo categoría no debe estar visible en el formulario de transacción',
  async ({ page }) => {
    await expect(getOpenDialog(page).getByText('Categoría', { exact: true })).toHaveCount(0, {
      timeout: 5000,
    });
  }
);

Then('debe ver el selector de gasto variable en el formulario de transacción', async ({ page }) => {
  await expect(getOpenDialog(page).locator('#tx-variable-expense')).toBeVisible({ timeout: 10000 });
});

Then('el detalle debe incluir la descripción única de transacción variable', async ({ page }) => {
  const description = await getStoredVariableTxNote(page);
  await expect(getOpenDialog(page).getByText(description, { exact: false }).first()).toBeVisible({
    timeout: 10000,
  });
});

Then('debe ver el monto automático del gasto fijo', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByText('Monto automático', { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await expect(
    dialog.getByText('Monto tomado del gasto fijo (solo lectura)', { exact: false })
  ).toBeVisible();
});

Then('el campo valor de la transacción no debe estar visible', async ({ page }) => {
  await expect(getOpenDialog(page).locator('#tx-amount')).toHaveCount(0, { timeout: 5000 });
});

Then('debe ver la opción de adelantar el próximo mes', async ({ page }) => {
  await expect(
    getOpenDialog(page).getByRole('checkbox', { name: 'Adelantar el pago del próximo mes' })
  ).toBeVisible({ timeout: 10000 });
});

// ============================================================================
// THEN - Empty state & i18n
// ============================================================================

Then(
  'debe ver el botón {string} en la página de gastos variables',
  async ({ page }, buttonName: string) => {
    await expect(page.getByRole('button', { name: buttonName, exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
  }
);

Then(
  'el botón {string} de la página de gastos variables debe estar deshabilitado',
  async ({ page }, buttonName: string) => {
    await expect(page.getByRole('button', { name: buttonName, exact: true })).toBeDisabled({
      timeout: 10000,
    });
  }
);

Then('debe ver las tarjetas de resumen de gastos variables en inglés', async ({ page }) => {
  const summary = page.getByRole('region', { name: 'Summary' });
  await expect(summary).toBeVisible({ timeout: 15000 });
  await expect(summary.getByText('Total Monitored', { exact: true })).toBeVisible();
  await expect(summary.getByText('Transactions', { exact: true })).toBeVisible();
  await expect(summary.getByText('Definitions', { exact: true })).toBeVisible();
});
