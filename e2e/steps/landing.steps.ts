/**
 * Landing Step Definitions
 * Step definitions for the public bilingual landing page (ES/EN), its
 * language selector, in-page anchors, FAQ disclosures and mobile navigation.
 *
 * The landing is public: no authentication is needed, so these steps never
 * touch the session helpers.
 */

import { createBdd } from 'playwright-bdd';
const { Given, When, Then } = createBdd();
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Escapes a literal string so it can be embedded safely in a RegExp. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Navigates to a public landing locale and waits until the hero heading is
 * visible, which is the readiness signal used by every landing scenario.
 */
async function openLanding(page: Page, path: '/es' | '/en'): Promise<void> {
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  // Cap networkidle so a busy server can never hang a test; the heading
  // assertion is the real readiness signal.
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/**
 * The header's main navigation. At most one navigation is exposed at a time:
 * the desktop nav is `display:none` below `lg` and the mobile nav lives inside
 * a `<details>` that is `display:none` at `lg` and above.
 */
function headerNav(page: Page) {
  return page.getByRole('banner').getByRole('navigation');
}

// ============================================================================
// GIVEN - Navigation
// ============================================================================

Given('que el usuario navega a la landing en español', async ({ page }) => {
  await openLanding(page, '/es');
});

Given('que el usuario navega a la landing en inglés', async ({ page }) => {
  await openLanding(page, '/en');
});

// ============================================================================
// WHEN - Navigation, locale switching and interactions
// ============================================================================

When('el usuario navega a la raíz del sitio', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
});

When('vuelve a la landing en español', async ({ page }) => {
  await openLanding(page, '/es');
});

When(
  'cambia el idioma de la landing a {string} desde la cabecera',
  async ({ page }, language: string) => {
    const banner = page.getByRole('banner');
    await banner.locator('button[title="Select language"]').click();
    await banner.getByRole('button', { name: language, exact: true }).click();
  }
);

When('hace clic en el ancla {string} de la cabecera', async ({ page }, label: string) => {
  await headerNav(page).getByRole('link', { name: label, exact: true }).click();
});

When('hace clic en el CTA {string} de la cabecera', async ({ page }, label: string) => {
  await page.getByRole('banner').getByRole('link', { name: label, exact: true }).click();
});

When('abre el menú de navegación móvil', async ({ page }) => {
  const menu = page.getByRole('banner').locator('details');
  await menu.locator('summary').click();
  await expect(menu).toHaveJSProperty('open', true);
});

When('abre la primera pregunta del FAQ', async ({ page }) => {
  await page.locator('#faq details').first().locator('summary').click();
});

// ============================================================================
// THEN - Language and content assertions
// ============================================================================

Then('la landing debe mostrarse en español', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Tus finanzas, exactas al centavo'
  );

  const nav = headerNav(page);
  for (const label of ['Módulos', 'Beneficios', 'Seguridad', 'Preguntas']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }

  const banner = page.getByRole('banner');
  await expect(banner.getByRole('link', { name: 'Crear cuenta', exact: true })).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Iniciar sesión', exact: true })).toBeVisible();
});

Then('la landing debe mostrarse en inglés', async ({ page }) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Your finances, accurate to the cent'
  );

  const nav = headerNav(page);
  for (const label of ['Modules', 'Benefits', 'Security', 'FAQ']) {
    await expect(nav.getByRole('link', { name: label, exact: true })).toBeVisible();
  }

  const banner = page.getByRole('banner');
  await expect(banner.getByRole('link', { name: 'Create account', exact: true })).toBeVisible();
  await expect(banner.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
});

Then('debe ver las secciones de la landing', async ({ page }) => {
  for (const sectionId of ['features', 'benefits', 'security', 'faq']) {
    await expect(page.locator(`#${sectionId}`)).toBeVisible();
    await expect(page.locator(`#${sectionId}-title`)).toBeVisible();
  }
});

Then('debe ver el CTA {string}', async ({ page }, label: string) => {
  await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeVisible();
});

// ============================================================================
// THEN - URL and anchor position assertions
// ============================================================================

Then('la URL de la landing debe apuntar a {string}', async ({ page }, path: string) => {
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(path)}$`));
});

Then('la URL de la landing debe terminar en {string}', async ({ page }, hash: string) => {
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(hash)}$`));
});

Then(
  'el borde superior de la sección {string} debe quedar bajo el header sticky',
  async ({ page }, sectionId: string) => {
    const section = page.locator(`#${sectionId}`);
    await expect(section).toBeVisible();

    // The smooth-scroll component aligns the section top with its own
    // `scroll-margin-top` (Tailwind `scroll-mt-24` → 96px), which reserves
    // room for the sticky header. Poll until the animation settles.
    await expect
      .poll(
        async () =>
          page.evaluate((id) => {
            const element = document.getElementById(id);
            if (!element) {
              return Number.POSITIVE_INFINITY;
            }
            const scrollMargin = Number.parseFloat(getComputedStyle(element).scrollMarginTop) || 0;
            return Math.abs(element.getBoundingClientRect().top - scrollMargin);
          }, sectionId),
        {
          timeout: 6000,
          message: `La sección #${sectionId} no quedó alineada bajo el header sticky`,
        }
      )
      .toBeLessThanOrEqual(4);

    const geometry = await page.evaluate((id) => {
      const element = document.getElementById(id);
      const header = document.querySelector('header');
      if (!element || !header) {
        return null;
      }
      return {
        top: element.getBoundingClientRect().top,
        headerBottom: header.getBoundingClientRect().bottom,
      };
    }, sectionId);

    expect(geometry).not.toBeNull();
    // The section must not be hidden underneath the sticky header.
    expect(geometry?.top ?? -1).toBeGreaterThanOrEqual(geometry?.headerBottom ?? 0);
  }
);

// ============================================================================
// THEN - FAQ and mobile assertions
// ============================================================================

Then('la primera pregunta del FAQ debe mostrar su respuesta', async ({ page }) => {
  const firstQuestion = page.locator('#faq details').first();
  await expect(firstQuestion).toHaveJSProperty('open', true);
  await expect(firstQuestion.locator('p')).toBeVisible();
});

Then('el menú de navegación móvil debe estar cerrado', async ({ page }) => {
  await expect(page.getByRole('banner').locator('details')).toHaveJSProperty('open', false);
});
