/**
 * Loans Step Definitions
 * Tests for the loans module: empty state, list + summary, detail modal with the
 * amortization schedule, create (TERM / INSTALLMENT), client-side validations and
 * the "Préstamo" nature of the transactions modal.
 *
 * Precondition loans/accounts are created by prisma/seed.e2e.ts and referenced by
 * name. Mutating scenarios create their own loans via the UI with UNIQUE timestamp
 * names (see helpers/unique.ts) so a CI retry (which does NOT reset the DB between
 * attempts) never collides with leftover rows.
 *
 * All navigation lives in When steps — a Given only establishes state.
 * No waitForTimeout/sleeps: Playwright auto-wait + auto-retry assertions.
 *
 * NOTE: reused steps (defined elsewhere, NOT here):
 *   - "presiona Escape"                          (savings.steps.ts)
 *   - "selecciona la naturaleza de gasto"        (variable-expenses.steps.ts)
 *   - "debe ver el título de sección"            (accounts.steps.ts)
 *   - "debe ver el mensaje de empty state"       (accounts.steps.ts)
 *   - "debe ver el botón ... en el empty state"  (accounts.steps.ts)
 *   - "abre el modal de nueva transacción"       (credit-cards.steps.ts)
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect, type Page, type Locator } from '@playwright/test';
import { loginAs } from '../helpers/auth';
import { LOANS_TEST_USER, LOANS_EMPTY_USER } from '../fixtures';
import { storeUniqueLoanName, getStoredLoanName } from '../helpers/unique';

// ============================================================================
// HELPERS
// ============================================================================

/** Gets the currently open native <dialog> (modal). */
function getOpenDialog(page: Page): Locator {
  return page.locator('dialog[open]').first();
}

/** Escapes a string so it can be embedded in a RegExp safely. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Finds a loan card (role=article) by visible name. */
function getLoanCard(page: Page, loanName: string): Locator {
  return page.getByRole('article', { name: new RegExp(escapeRegex(loanName)) }).first();
}

/**
 * Fills a FormattedNumericInput (money / rate). The input only updates on
 * keyDown, so clear with Backspace and type each digit (no native fill).
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

/** Selects an option of a NATIVE <select> by its visible (partial) text. */
async function selectNativeOptionByText(select: Locator, text: string) {
  await expect(select).toBeVisible({ timeout: 10000 });
  const option = select.locator('option').filter({ hasText: text }).first();
  await expect(option).toHaveCount(1, { timeout: 10000 });
  const value = await option.getAttribute('value');
  await select.selectOption(value ?? '');
}

/**
 * Waits until an opened modal is fully mounted and its form state has settled.
 * The modals run reset() + a requestAnimationFrame on open; the backdrop opacity
 * reaches 1 only after the rAF callback sets isVisible(true) → a deterministic
 * "ready" signal (same pattern as savings.steps.ts).
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

/** The per-currency summary section (Spanish "Resumen" or English "Summary"). */
function getSummarySection(page: Page): Locator {
  return page.locator('section[aria-label="Resumen"], section[aria-label="Summary"]').first();
}

// ============================================================================
// GIVEN - Authentication
// ============================================================================

Given('que el usuario de préstamos ha iniciado sesión', async ({ page }) => {
  await loginAs(page, LOANS_TEST_USER.email, LOANS_TEST_USER.password);
});

Given('que el usuario sin préstamos ha iniciado sesión', async ({ page }) => {
  await loginAs(page, LOANS_EMPTY_USER.email, LOANS_EMPTY_USER.password);
});

// ============================================================================
// WHEN - Navigation
// ============================================================================

When('navega a la página de préstamos', async ({ page }) => {
  await page.goto('/es/loans', { waitUntil: 'domcontentloaded' });
});

When('navega a la página de préstamos en inglés', async ({ page }) => {
  await page.goto('/en/loans', { waitUntil: 'domcontentloaded' });
});

// NOTE: "navega a la página de transacciones" is defined in transactions.steps.ts
// as a Given and is reused here (keyword is interchangeable in playwright-bdd).

// ============================================================================
// WHEN - Create loan modal
// ============================================================================

When('abre el modal de creación de préstamo', async ({ page }) => {
  await page.getByRole('button', { name: 'Nuevo préstamo', exact: true }).click();
  await waitForModalSettled(page);
});

When(
  'ingresa un nombre único de préstamo con prefijo {string}',
  async ({ page }, prefix: string) => {
    const name = await storeUniqueLoanName(page, prefix);
    await getOpenDialog(page).locator('#loan-name').fill(name);
  }
);

When('ingresa {string} en el monto principal del préstamo', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#loan-principal'), amount);
});

When('ingresa {string} en la tasa de interés del préstamo', async ({ page }, rate: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#loan-rate'), rate);
});

When('ingresa {string} en el número de cuotas del préstamo', async ({ page }, term: string) => {
  await getOpenDialog(page).locator('#loan-term').fill(term);
});

When('ingresa {string} en el valor de la cuota', async ({ page }, amount: string) => {
  await fillCentsInput(getOpenDialog(page).locator('#loan-installment-amount'), amount);
});

When('selecciona el modo de programación {string}', async ({ page }, modeLabel: string) => {
  // Schedule-mode radios are sr-only; clicking the visible label text toggles them.
  await getOpenDialog(page).getByText(modeLabel, { exact: true }).click();
});

When(
  'selecciona la cuenta {string} en el formulario de préstamo',
  async ({ page }, accountName: string) => {
    await selectNativeOptionByText(getOpenDialog(page).locator('#loan-account'), accountName);
  }
);

When('envía el formulario de creación de préstamo', async ({ page }) => {
  await getOpenDialog(page).getByRole('button', { name: 'Crear préstamo', exact: true }).click();
  // The modal closes only after createLoan() resolves with success, so waiting
  // for it guarantees the loan row is committed before we re-read server data.
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 30000 });
  // Re-fetch the server-rendered list with a full navigation instead of relying
  // on the coalesced client router.refresh(), which can intermittently leave a
  // stale RSC payload when workers run concurrently.
  await page.reload({ waitUntil: 'domcontentloaded' });
});

// ============================================================================
// WHEN - Detail modal
// ============================================================================

When('abre el detalle del préstamo {string}', async ({ page }, loanName: string) => {
  const card = getLoanCard(page, loanName);
  await expect(card).toBeVisible({ timeout: 10000 });
  // Card action buttons use opacity-0 group-hover:opacity-100.
  await card.hover();
  await card
    .getByRole('button', { name: /Ver detalle/i })
    .first()
    .click();
  await waitForModalSettled(page);
});

// ============================================================================
// WHEN - Transactions modal (loan nature)
// ============================================================================

When('selecciona el tipo de transacción {string}', async ({ page }, typeLabel: string) => {
  // Type radios are sr-only; clicking the visible label text toggles them.
  await getOpenDialog(page).getByText(typeLabel, { exact: true }).click();
});

When(
  'selecciona el préstamo {string} en el formulario de transacción',
  async ({ page }, loanName: string) => {
    await selectNativeOptionByText(getOpenDialog(page).locator('#tx-loan'), loanName);
  }
);

// ============================================================================
// THEN - Empty state / list / summary
// ============================================================================

Then(
  'debe ver el botón {string} en la página de préstamos',
  async ({ page }, buttonName: string) => {
    await expect(
      page.getByRole('button', { name: new RegExp(`^${escapeRegex(buttonName)}$`, 'i') })
    ).toBeVisible({ timeout: 10000 });
  }
);

Then('la tarjeta de préstamo {string} debe ser visible', async ({ page }, loanName: string) => {
  await expect(getLoanCard(page, loanName)).toBeVisible({ timeout: 15000 });
});

Then(
  'la tarjeta de préstamo {string} debe mostrar la insignia {string}',
  async ({ page }, loanName: string, badgeText: string) => {
    const card = getLoanCard(page, loanName);
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.getByText(badgeText, { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
  }
);

Then('la tarjeta de préstamo con el nombre único debe ser visible', async ({ page }) => {
  const name = await getStoredLoanName(page);
  await expect(getLoanCard(page, name)).toBeVisible({ timeout: 20000 });
});

Then(
  'el resumen de préstamos debe mostrar la etiqueta {string}',
  async ({ page }, label: string) => {
    const summary = getSummarySection(page);
    await expect(summary).toBeVisible({ timeout: 10000 });
    await expect(summary.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 10000 });
  }
);

// ============================================================================
// THEN - Detail modal
// ============================================================================

Then(
  'el modal de detalle del préstamo debe estar visible con el título {string}',
  async ({ page }, loanName: string) => {
    const dialog = getOpenDialog(page);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByRole('heading', { name: loanName })).toBeVisible({ timeout: 10000 });
  }
);

Then('la URL debe seguir siendo la página de préstamos', async ({ page }) => {
  // The detail opens IN PLACE: it must never push a /loans/[loanId] route.
  await expect(page).toHaveURL(/\/es\/loans\/?$/);
});

Then(
  'la tabla de amortización debe mostrar la columna {string}',
  async ({ page }, column: string) => {
    const dialog = getOpenDialog(page);
    const table = dialog.getByRole('table').first();
    await expect(table).toBeVisible({ timeout: 10000 });
    await expect(table.getByRole('columnheader', { name: column, exact: true })).toBeVisible({
      timeout: 10000,
    });
  }
);

Then('el modal de detalle del préstamo debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// THEN - Create modal validations
// ============================================================================

Then('el botón de crear préstamo debe estar deshabilitado', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('button', { name: 'Crear préstamo', exact: true })).toBeDisabled();
});

Then('el botón de crear préstamo debe estar habilitado', async ({ page }) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('button', { name: 'Crear préstamo', exact: true })).toBeEnabled({
    timeout: 10000,
  });
});

Then(
  'debe ver la etiqueta {string} en la vista previa del préstamo',
  async ({ page }, label: string) => {
    await expect(getOpenDialog(page).getByText(label, { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
  }
);

Then('debe ver el error de préstamo {string}', async ({ page }, message: string) => {
  const dialog = getOpenDialog(page);
  await expect(dialog.getByRole('alert').filter({ hasText: message }).first()).toBeVisible({
    timeout: 10000,
  });
});

Then('el modal de creación de préstamo debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});

// ============================================================================
// THEN - Transactions modal (loan nature)
// ============================================================================

Then(
  'el selector de préstamo debe listar el préstamo {string} y no cuotas',
  async ({ page }, loanName: string) => {
    const select = getOpenDialog(page).locator('#tx-loan');
    await expect(select).toBeVisible({ timeout: 10000 });
    // The selector lists LOANS (name + balance), never individual installments.
    await expect(select.locator('option').filter({ hasText: loanName })).toHaveCount(1, {
      timeout: 10000,
    });
    await expect(select.locator('option').filter({ hasText: /Cuota #/ })).toHaveCount(0);
  }
);

Then('debe ver el estado de cuota {string}', async ({ page }, stateText: string) => {
  await expect(getOpenDialog(page).getByText(stateText, { exact: false }).first()).toBeVisible({
    timeout: 10000,
  });
});

Then(
  'debe ver las acciones de préstamo {string} y {string}',
  async ({ page }, actionA: string, actionB: string) => {
    const dialog = getOpenDialog(page);
    await expect(dialog.getByText(actionA, { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(dialog.getByText(actionB, { exact: true }).first()).toBeVisible({
      timeout: 10000,
    });
  }
);

Then('el modal de transacción debe cerrarse', async ({ page }) => {
  await expect(page.locator('dialog[open]')).toHaveCount(0, { timeout: 10000 });
});
