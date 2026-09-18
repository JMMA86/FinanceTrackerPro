/**
 * Onboarding Step Definitions
 *
 * Covers the 5-step first-run walkthrough at `/[lang]/onboarding`:
 *   welcome (1) → account (2) → salary (3, OPTIONAL) → modules (4) → finish (5)
 *
 * Language selection, first account creation, the optional salary/bonus step,
 * the module tour, completion, skip and the first-run guard are all exercised.
 *
 * Three isolated non-onboarded users are seeded in `prisma/seed.e2e.ts`:
 *   - "1" → read-only walkthrough (redirect / welcome / i18n / modules) and the
 *           empty-salary path (never persists a salary configuration)
 *   - "2" → first-account creation + salary save, then skip
 *   - "3" → full walkthrough completion
 * The already-onboarded auth user verifies the dashboard guard.
 */

import { createBdd, DataTable } from 'playwright-bdd';
const { Given, When, Then, Before, After } = createBdd();
import { expect, type Page } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { clearSession, loginAs } from '../helpers/auth';
import { TEST_USER } from '../fixtures';

interface OnboardingUser {
  email: string;
  name: string;
}

const PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123';

/**
 * Dedicated non-onboarded users. Emails are env-overridable with mandatory
 * defaults because CI generates `.env.e2e` without these variables.
 */
const ONBOARDING_USERS: Record<string, OnboardingUser> = {
  '1': {
    email: process.env.E2E_ONBOARDING_USER_1 ?? 'onboarding1@e2e.financetrackerpro.com',
    name: 'Onboarding One E2E User',
  },
  '2': {
    email: process.env.E2E_ONBOARDING_USER_2 ?? 'onboarding2@e2e.financetrackerpro.com',
    name: 'Onboarding Two E2E User',
  },
  '3': {
    email: process.env.E2E_ONBOARDING_USER_3 ?? 'onboarding3@e2e.financetrackerpro.com',
    name: 'Onboarding Three E2E User',
  },
};

const ACCOUNT_TYPE_VALUES: Record<string, string> = {
  Corriente: 'CHECKING',
  Efectivo: 'CASH',
  Ahorros: 'SAVINGS',
};

function onboardingUser(key: string): OnboardingUser {
  const user = ONBOARDING_USERS[key];
  if (!user) throw new Error(`Unknown onboarding user "${key}"`);
  return user;
}

/**
 * Fills and submits the Spanish desktop login form.
 */
async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  const loginForm = page.locator('form').first();
  await loginForm.getByPlaceholder('Ingresa tu correo').fill(email);
  await loginForm.getByPlaceholder('Ingresa tu contraseña').fill(password);
  await page.getByRole('button', { name: 'Iniciar Sesión', exact: true }).click();
}

/**
 * Logs in a user that has NOT completed onboarding. Unlike `loginAs`, the
 * dashboard guard sends them to `/es/onboarding`, so this helper waits for that
 * route (and skips the decorative splash via reduced motion).
 */
async function loginExpectingOnboarding(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await clearSession(page);
  await submitLogin(page, email, password);
  await page.waitForURL(/\/es\/onboarding/, { timeout: 60000 });
}

// ============================================================================
// SCENARIO HOOKS — retry-safe onboarding state
// ============================================================================

/**
 * Emails of the three seeded non-onboarded users, resolved from the same
 * env-overridable constants used by the steps (CI defines no overrides, so the
 * defaults apply and match `prisma/seed.e2e.ts`).
 */
const NON_ONBOARDED_EMAILS: string[] = Object.values(ONBOARDING_USERS).map((user) => user.email);

/**
 * Dedicated Prisma client for the reset hook.
 *
 * Kept SEPARATE from `e2e/helpers/db.ts` so disconnecting it here can never
 * detach the shared client used by other feature files in the same worker. It
 * points at the same isolated `?schema=e2e` DATABASE_URL loaded from `.env.e2e`
 * by `playwright.config.ts`, so it NEVER touches the development database.
 */
let onboardingDb: PrismaClient | null = null;

function getOnboardingDb(): PrismaClient {
  if (!onboardingDb) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL is not set; cannot reset the onboarding E2E users');
    }
    const pool = new Pool({ connectionString: url });
    // disposeExternalPool:true makes `$disconnect()` close the pool, so the
    // teardown hook below leaves no open handles behind.
    onboardingDb = new PrismaClient({
      adapter: new PrismaPg(pool, { disposeExternalPool: true }),
    });
  }
  return onboardingDb;
}

async function closeOnboardingDb(): Promise<void> {
  const db = onboardingDb;
  if (!db) return;
  onboardingDb = null;
  await db.$disconnect();
}

/**
 * Restores the three seeded users to "not onboarded" before every @onboarding
 * scenario.
 *
 * Why: the terminal scenarios (@account, @finish, @skip-flow) complete the
 * walkthrough, setting `onboardingCompletedAt`. Playwright retries (CI: 2) reuse
 * the same seeded database — `globalSetup` does NOT run between retries — so a
 * retried scenario would log in straight into the dashboard and fail
 * deterministically. A single `updateMany` per scenario makes every onboarding
 * scenario idempotent and retry-safe.
 *
 * The @onboarding @salary scenarios also depend on a CLEAN salary state: the
 * salary configuration of these three users is deleted here (hard delete inside
 * the isolated `?schema=e2e` database — the `SalaryBonus` rows cascade) so the
 * walkthrough always starts without a persisted salary. These users are used by
 * no other feature file, so the cleanup can never affect another suite.
 */
Before({ tags: '@onboarding', name: 'Restore non-onboarded state of seeded users' }, async () => {
  const db = getOnboardingDb();
  await db.user.updateMany({
    where: { email: { in: NON_ONBOARDED_EMAILS } },
    data: { onboardingCompletedAt: null, onboardingStep: 0 },
  });
  await db.salaryConfiguration.deleteMany({
    where: { user: { email: { in: NON_ONBOARDED_EMAILS } } },
  });
});

After({ tags: '@onboarding', name: 'Close onboarding reset DB client' }, async () => {
  await closeOnboardingDb();
});

// ============================================================================
// GIVEN - State & Authentication
// ============================================================================

Given('que las animaciones del onboarding están reducidas', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

Given(
  'que el usuario de onboarding {string} ha iniciado sesión por primera vez',
  async ({ page }, key: string) => {
    const user = onboardingUser(key);
    await loginExpectingOnboarding(page, user.email, PASSWORD);
  }
);

Given('que el usuario de autenticación ya completó el onboarding', async ({ page }) => {
  await loginAs(page, TEST_USER.email, TEST_USER.password);
});

// ============================================================================
// WHEN - Authentication & Navigation
// ============================================================================

When(
  'inicia sesión por primera vez el usuario de onboarding {string}',
  async ({ page }, key: string) => {
    const user = onboardingUser(key);
    await loginExpectingOnboarding(page, user.email, PASSWORD);
  }
);

When('selecciona el idioma {string}', async ({ page }, language: string) => {
  const languageGroup = page.getByRole('group', { name: /Idioma|Language/i });
  await languageGroup.getByText(language, { exact: true }).click();
});

When('avanza al paso de crear cuenta', async ({ page }) => {
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crea tu primera cuenta' })).toBeVisible({
    timeout: 10000,
  });
});

/**
 * Advances from the welcome step (1) or the account step (2) to the OPTIONAL
 * salary step (3). The account step is skippable: "Continuar" advances even when
 * no account has been created.
 */
When('avanza al paso de sueldo', async ({ page }) => {
  const continueButton = page.getByRole('button', { name: 'Continuar', exact: true });
  const salaryHeading = page.getByRole('heading', { name: 'Configura tu sueldo' });
  // At most two clicks: welcome → account and account → salary.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (await salaryHeading.isVisible().catch(() => false)) return;
    await continueButton.click();
    await expect(page.getByText(/^Paso \d de 5$/))
      .toBeVisible({ timeout: 10000 })
      .catch(() => {});
  }
  await expect(salaryHeading).toBeVisible({ timeout: 10000 });
});

When(
  'crea la cuenta {string} de tipo {string} con saldo {string}',
  async ({ page }, name: string, type: string, balance: string) => {
    const accountType = ACCOUNT_TYPE_VALUES[type];
    if (!accountType) throw new Error(`Unknown account type "${type}"`);

    await page.locator('#onboarding-account-name').fill(name);
    await page.locator('#onboarding-account-type').selectOption(accountType);
    // The balance is a controlled numeric input: digits must be typed so its
    // onKeyDown handler updates the value (cents) one key at a time.
    await page.locator('#onboarding-account-balance').pressSequentially(balance);
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  }
);

When('avanza hasta el paso de módulos', async ({ page }) => {
  const continueButton = page.getByRole('button', { name: 'Continuar', exact: true });
  const modulesHeading = page.getByRole('heading', { name: 'Explora los módulos' });
  // Advance one step at a time until the modules step (4) is reached. The salary
  // step (3) in between is optional: an untouched form advances without saving.
  for (let step = 1; step < 4; step += 1) {
    if (await modulesHeading.isVisible().catch(() => false)) return;
    await continueButton.click();
    await expect(page.getByText(`Paso ${step + 1} de 5`, { exact: true })).toBeVisible({
      timeout: 15000,
    });
  }
  await expect(modulesHeading).toBeVisible({ timeout: 15000 });
});

/** Reads the current "Paso N de 5" indicator (1-based). */
async function currentOnboardingStep(page: Page): Promise<number> {
  const label = await page
    .getByText(/^Paso \d de 5$/)
    .first()
    .innerText();
  const match = /\d/.exec(label);
  return match ? Number(match[0]) : 1;
}

When('avanza hasta el último paso', async ({ page }) => {
  const continueButton = page.getByRole('button', { name: 'Continuar', exact: true });
  const ctaButton = page.getByRole('button', { name: 'Ir al dashboard', exact: true });
  // The walkthrough can start at welcome (step 1) or at the account step (step 2)
  // depending on what the scenario already did, so advance one step at a time.
  // The salary step (3) auto-submits: an empty form advances without persisting.
  const start = await currentOnboardingStep(page);
  for (let step = start; step < 5; step += 1) {
    await continueButton.click();
    await expect(page.getByText(`Paso ${step + 1} de 5`, { exact: true })).toBeVisible({
      timeout: 20000,
    });
  }
  await expect(ctaButton).toBeVisible({ timeout: 10000 });
});

When('navega a la página de cuentas bancarias', async ({ page }) => {
  await page.goto('/es/accounts', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
});

When('pulsa el CTA {string}', async ({ page }, label: string) => {
  await page.getByRole('button', { name: label, exact: true }).click();
});

When('pulsa {string} y confirma en el modal', async ({ page }, label: string) => {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await dialog.getByRole('button', { name: 'Sí, omitir', exact: true }).click();
});

When('pulsa {string}', async ({ page }, label: string) => {
  await page.getByRole('button', { name: label, exact: true }).click();
});

/**
 * Fills the OPTIONAL salary step: it types the amount digit by digit (the field
 * is a `FormattedNumericInput` whose value is updated on keyDown, in cents) and
 * sets the day of the month for the default MONTHLY frequency.
 */
When(
  'ingresa {string} centavos como monto de sueldo con día de pago {string}',
  async ({ page }, amountCents: string, payDay: string) => {
    const amount = page.locator('#onboarding-salary-amount');
    await expect(amount).toBeVisible({ timeout: 15000 });
    await amount.click();
    await amount.pressSequentially(amountCents);
    await page.locator('#onboarding-salary-pay-day').fill(payDay);
  }
);

When('recarga el dashboard', async ({ page }) => {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
});

// ============================================================================
// THEN - Assertions
// ============================================================================

Then('debe estar en el onboarding en español', async ({ page }) => {
  await expect(page).toHaveURL(/\/es\/onboarding/, { timeout: 30000 });
});

Then('debe estar en el onboarding en inglés', async ({ page }) => {
  await expect(page).toHaveURL(/\/en\/onboarding/, { timeout: 30000 });
});

Then('debe estar en el dashboard en español', async ({ page }) => {
  await expect(page).toHaveURL(/\/es\/dashboard/, { timeout: 40000 });
});

Then('debe ver el contador de progreso {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 10000 });
});

Then('debe estar en el paso {string}', async ({ page }, text: string) => {
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible({ timeout: 15000 });
});

/** es-CO formatted cents, mirroring `FormattedNumericInput.format`. */
function formattedCents(cents: number): string {
  return (cents / 100).toLocaleString('es-CO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

Then(
  'el formulario de sueldo debe mostrar el monto {string} centavos y día {string}',
  async ({ page }, amountCents: string, payDay: string) => {
    await expect(page.getByRole('heading', { name: 'Configura tu sueldo' })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.locator('#onboarding-salary-amount')).toHaveValue(
      formattedCents(Number(amountCents))
    );
    await expect(page.locator('#onboarding-salary-pay-day')).toHaveValue(payDay);
  }
);

Then('el formulario de sueldo debe estar sin monto', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Configura tu sueldo' })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.locator('#onboarding-salary-amount')).toHaveValue(formattedCents(0));
});

Then('debe ver el saludo del usuario de onboarding {string}', async ({ page }, key: string) => {
  const user = onboardingUser(key);
  await expect(page.getByText(`¡Hola, ${user.name}!`, { exact: true })).toBeVisible({
    timeout: 10000,
  });
});

Then('debe ver las 2 opciones de idioma', async ({ page }) => {
  await expect(page.getByRole('radio')).toHaveCount(2);
  await expect(page.getByText('Español', { exact: true })).toBeVisible();
  await expect(page.getByText('English', { exact: true })).toBeVisible();
});

Then('debe ver el título en inglés {string}', async ({ page }, title: string) => {
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({
    timeout: 10000,
  });
});

Then('debe ver la confirmación de cuenta creada', async ({ page }) => {
  await expect(page.getByText('¡Cuenta creada!', { exact: true })).toBeVisible({ timeout: 30000 });
});

Then(
  'la cuenta {string} debe existir en la página de cuentas',
  async ({ page }, accountName: string) => {
    await expect(page.getByText(accountName, { exact: true }).first()).toBeVisible({
      timeout: 15000,
    });
  }
);

Then('debe ver los siguientes módulos:', async ({ page }, dataTable: DataTable) => {
  const modules = dataTable.raw().flat();
  for (const moduleName of modules) {
    await expect(
      page.getByRole('heading', { level: 3, name: moduleName, exact: true })
    ).toBeVisible({ timeout: 5000 });
  }
});

Then('debe seguir en el dashboard', async ({ page }) => {
  await expect(page).toHaveURL(/\/es\/dashboard/, { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Omitir' })).toHaveCount(0);
});

Then('no debe ver el recorrido de onboarding', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Omitir' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Configura tu cuenta' })).toHaveCount(0);
});
