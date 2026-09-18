/**
 * Settings → "Ingresos y primas" Step Definitions.
 *
 * Covers the salary configuration (amount, currency, frequency and its payment
 * days: MONTHLY = 1 day of the month, BIWEEKLY = 2 days, WEEKLY = 1 ISO weekday),
 * the bonus list (name, amount, frequency, anchor month) and the monthly savings
 * target in COP — including persistence across a full page reload.
 *
 * The write scenarios run on the ACCOUNTS_TEST_USER, which is isolated from both
 * the projection (no dashboard assertions) and the transaction INCOME prefill, so
 * mutating its salary can never affect another feature file.
 */

import { createBdd } from 'playwright-bdd';
const { When, Then } = createBdd();
import { expect, type Locator, type Page } from '@playwright/test';
import { getStoredBonusName, storeUniqueBonusName } from '../helpers/unique';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Localized frequency label → persisted `SalaryFrequency` / `BonusFrequency` value. */
const SALARY_FREQUENCY_VALUE: Readonly<Record<string, string>> = {
  Mensual: 'MONTHLY',
  Quincenal: 'BIWEEKLY',
  Semanal: 'WEEKLY',
};

const BONUS_FREQUENCY_VALUE: Readonly<Record<string, string>> = {
  Mensual: 'MONTHLY',
  Bimestral: 'BIMONTHLY',
  Trimestral: 'QUARTERLY',
  Semestral: 'SEMIANNUAL',
  Anual: 'ANNUAL',
};

// ============================================================================
// HELPERS
// ============================================================================

/** The "Ingresos y primas" settings section (shell card holding the h2). */
function salarySection(page: Page): Locator {
  return page
    .locator('div.app-shell')
    .filter({ has: page.getByRole('heading', { name: 'Ingresos y primas', exact: true }) })
    .first();
}

/** es-CO formatted cents, mirroring `FormattedNumericInput.format`. */
function formattedCents(cents: number): string {
  return (cents / 100).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Types a cents value into a `FormattedNumericInput` (its value is updated on
 * keyDown, so digits are pressed one by one after clearing the current value).
 */
async function typeCents(input: Locator, cents: number): Promise<void> {
  await input.click();
  for (let i = 0; i < 16; i += 1) {
    await input.press('Backspace');
  }
  await input.pressSequentially(String(cents), { delay: 20 });
}

// ============================================================================
// WHEN - Navigation
// ============================================================================

When('navega a la página de ajustes', async ({ page }) => {
  await page.goto('/es/settings', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Ingresos y primas', exact: true })).toBeVisible({
    timeout: 15000,
  });
});

When('recarga la página de ajustes', async ({ page }) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Ingresos y primas', exact: true })).toBeVisible({
    timeout: 15000,
  });
});

// ============================================================================
// WHEN - Salary & bonuses
// ============================================================================

When(
  'configura un sueldo {string} con día de pago {string} y monto de {int} centavos',
  async ({ page }, frequencyLabel: string, payDay: string, amountCents: number) => {
    const section = salarySection(page);
    const frequency = SALARY_FREQUENCY_VALUE[frequencyLabel];
    if (!frequency) throw new Error(`Unknown salary frequency label "${frequencyLabel}"`);

    await section.locator('#settings-salary-frequency').selectOption(frequency);
    await expect(section.locator('#settings-salary-frequency')).toHaveValue(frequency);

    if (frequency === 'MONTHLY') {
      await section.locator('#settings-salary-pay-day').fill(payDay);
    } else if (frequency === 'WEEKLY') {
      await section.locator('#settings-salary-pay-weekday').selectOption({ label: payDay });
    } else {
      throw new Error(
        `BIWEEKLY requires two pay days; extend the step to cover "${frequencyLabel}"`
      );
    }

    await typeCents(section.locator('#settings-salary-amount'), amountCents);
  }
);

When(
  'añade una prima única con monto de {int} centavos y frecuencia {string} en el mes {string}',
  async ({ page }, amountCents: number, frequencyLabel: string, anchorMonthLabel: string) => {
    const section = salarySection(page);
    await section.getByRole('button', { name: 'Añadir prima' }).click();

    // The new bonus is APPENDED, so its fields are the last ones of the list. A
    // retry may leave the previous attempt's bonus in place, so resolve the index
    // from the DOM instead of assuming 0.
    const nameInput = section.locator('input[id^="settings-salary-bonus-"][id$="-name"]').last();
    await expect(nameInput).toBeVisible({ timeout: 5000 });
    const nameId = await nameInput.getAttribute('id');
    if (!nameId) throw new Error('Bonus name input has no id');
    const prefix = nameId.replace(/-name$/, '');

    const uniqueName = await storeUniqueBonusName(page, 'Bono E2E');
    await nameInput.fill(uniqueName);
    await typeCents(section.locator(`#${prefix}-amount`), amountCents);

    const frequency = BONUS_FREQUENCY_VALUE[frequencyLabel];
    if (!frequency) throw new Error(`Unknown bonus frequency label "${frequencyLabel}"`);
    await section.locator(`#${prefix}-frequency`).selectOption(frequency);
    await section.locator(`#${prefix}-month`).selectOption({ label: anchorMonthLabel });
  }
);

When('guarda la configuración de ingresos', async ({ page }) => {
  await salarySection(page).getByRole('button', { name: 'Guardar configuración' }).click();
});

When('configura la meta de ahorro mensual en {int} centavos', async ({ page }, cents: number) => {
  await typeCents(salarySection(page).locator('#settings-savings-target'), cents);
});

When('guarda la meta de ahorro', async ({ page }) => {
  await salarySection(page).getByRole('button', { name: 'Guardar meta' }).click();
});

// ============================================================================
// THEN - Assertions
// ============================================================================

// `debe ver la sección {string}` (h2 heading) is defined in credit-cards.steps.ts
// and reused by the "Ingresos y primas" section assertion.

Then('la frecuencia de sueldo debe ser {string}', async ({ page }, frequencyLabel: string) => {
  const frequency = SALARY_FREQUENCY_VALUE[frequencyLabel];
  if (!frequency) throw new Error(`Unknown salary frequency label "${frequencyLabel}"`);
  await expect(salarySection(page).locator('#settings-salary-frequency')).toHaveValue(frequency);
});

Then(
  'los días de pago del sueldo deben ser {string} y {string}',
  async ({ page }, firstDay: string, secondDay: string) => {
    const section = salarySection(page);
    await expect(section.locator('#settings-salary-first-pay-day')).toHaveValue(firstDay);
    await expect(section.locator('#settings-salary-second-pay-day')).toHaveValue(secondDay);
  }
);

Then('el día de pago del sueldo debe ser {string}', async ({ page }, payDay: string) => {
  await expect(salarySection(page).locator('#settings-salary-pay-day')).toHaveValue(payDay);
});

Then('el monto de sueldo configurado debe ser {int} centavos', async ({ page }, cents: number) => {
  await expect(salarySection(page).locator('#settings-salary-amount')).toHaveValue(
    formattedCents(cents)
  );
});

Then('la meta de ahorro configurada debe ser {int} centavos', async ({ page }, cents: number) => {
  await expect(salarySection(page).locator('#settings-savings-target')).toHaveValue(
    formattedCents(cents)
  );
});

Then('la prima {string} debe estar listada', async ({ page }, name: string) => {
  const nameInputs = salarySection(page).locator(
    'input[id^="settings-salary-bonus-"][id$="-name"]'
  );
  await expect(nameInputs.first()).toBeVisible({ timeout: 5000 });
  const values = await nameInputs.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value)
  );
  expect(values).toContain(name);
});

Then('la prima única debe estar listada', async ({ page }) => {
  const stored = await getStoredBonusName(page);
  const nameInputs = salarySection(page).locator(
    'input[id^="settings-salary-bonus-"][id$="-name"]'
  );
  await expect(nameInputs.first()).toBeVisible({ timeout: 5000 });
  const values = await nameInputs.evaluateAll((inputs) =>
    inputs.map((input) => (input as HTMLInputElement).value)
  );
  expect(values).toContain(stored);
});

Then('debe ver la confirmación {string}', async ({ page }, message: string) => {
  await expect(salarySection(page).getByText(message, { exact: true })).toBeVisible({
    timeout: 15000,
  });
});

// The generic login Givens used by this feature live in dashboard.steps.ts
// (`que el usuario del dashboard ha iniciado sesión`) and accounts.steps.ts
// (`que el usuario de cuentas ha iniciado sesión`).
