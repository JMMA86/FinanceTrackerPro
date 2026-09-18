/**
 * Onboarding helper for E2E tests.
 *
 * Freshly-registered users have `onboardingCompletedAt = null`, so the dashboard
 * layout redirects them to `/[lang]/onboarding` on their first login. Scenarios
 * that only need to reach the dashboard (e.g. registering a throwaway user to
 * assert an empty state) skip the walkthrough instead of performing it.
 *
 * The walkthrough has 5 steps (`src/lib/onboarding/steps.ts`):
 *   welcome (1) → account (2) → salary (3) → modules (4) → finish (5)
 * `skipOnboardingIfPresent` is step-count agnostic (the "Omitir" action lives in
 * the wizard header on every step), so it keeps working unchanged for both the
 * 4-step legacy wizard and the current 5-step one.
 */

import { expect, type Page } from '@playwright/test';

/**
 * Total number of steps of the current first-run walkthrough. Mirrors
 * `ONBOARDING_TOTAL_STEPS` in `src/lib/onboarding/steps.ts`; kept here so the
 * E2E specs can assert the progress counter without importing app code.
 */
export const ONBOARDING_TOTAL_STEPS = 5;

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
  const skipButton = page.getByRole('button', { name: 'Omitir', exact: true });
  await expect(skipButton).toBeEnabled({ timeout: 15000 });
  await skipButton.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await dialog.getByRole('button', { name: 'Sí, omitir', exact: true }).click();
  // Completing the skip persists onboardingCompletedAt and pushes to the dashboard.
  await page.waitForURL(/\/es\/dashboard/, { timeout: 60000 });
}
