/**
 * Onboarding helper for E2E tests.
 *
 * Freshly-registered users have `onboardingCompletedAt = null`, so the dashboard
 * layout redirects them to `/[lang]/onboarding` on their first login. Scenarios
 * that only need to reach the dashboard (e.g. registering a throwaway user to
 * assert an empty state) skip the walkthrough instead of performing it.
 */

import { expect, type Page } from '@playwright/test';

/**
 * Skips the first-run onboarding walkthrough when the current page is the
 * onboarding route, leaving the browser on `/es/dashboard`.
 *
 * Idempotent: if the page is not on `/onboarding` (e.g. an already-onboarded
 * user), it does nothing. Safe to call right after a login redirect.
 */
export async function skipOnboardingIfPresent(page: Page): Promise<void> {
  // A login redirect for a non-onboarded user is observed as `/es/dashboard`
  // for an instant before the layout's first-run guard redirects to
  // `/es/onboarding`. If the URL is not onboarding yet, give that server
  // redirect a bounded window to settle. An already-onboarded user never
  // redirects, so the wait times out and we bail out without acting (idempotent).
  if (!page.url().includes('/onboarding')) {
    await page.waitForURL(/\/es\/onboarding/, { timeout: 15000 }).catch(() => {});
  }
  if (!page.url().includes('/onboarding')) {
    return;
  }

  // "Omitir" lives in the wizard header and opens the confirmation modal.
  await page.getByRole('button', { name: 'Omitir', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await dialog.getByRole('button', { name: 'Sí, omitir', exact: true }).click();
  // Completing the skip persists onboardingCompletedAt and pushes to the dashboard.
  await page.waitForURL(/\/es\/dashboard/, { timeout: 60000 });
}
