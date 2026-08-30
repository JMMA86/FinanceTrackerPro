/**
 * Shared helpers for storing/reading unique values between steps.
 *
 * Values are stored in localStorage (NOT window) because several scenarios
 * navigate with page.goto() between storing and reading a value, and a full
 * page load resets window state. localStorage survives same-origin navigations
 * within the isolated browser context, so the value is still available after
 * e.g. "navega a la página de transacciones".
 *
 * A unique value per attempt keeps retries clean (a retry never collides with
 * a leftover row from the failed attempt).
 */

import type { Page } from '@playwright/test';

/** localStorage key where the unique account name is stored for the current scenario. */
export const UNIQUE_ACCOUNT_NAME_KEY = '__e2eUniqueAccountName';

export async function setWindowValue(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(
    ({ k, v }) => {
      window.localStorage.setItem(k, v);
    },
    { k: key, v: value }
  );
}

export async function getWindowValue(page: Page, key: string): Promise<string | undefined> {
  return page.evaluate((k) => {
    return window.localStorage.getItem(k) ?? undefined;
  }, key);
}

/** Generates a timestamped account name, stores it and returns it. */
export async function storeUniqueAccountName(page: Page, prefix: string): Promise<string> {
  const name = `${prefix} ${Date.now()}`;
  await setWindowValue(page, UNIQUE_ACCOUNT_NAME_KEY, name);
  return name;
}

/** Reads the unique account name stored by the create-account step. */
export async function getStoredAccountName(page: Page): Promise<string> {
  const name = await getWindowValue(page, UNIQUE_ACCOUNT_NAME_KEY);
  if (!name) throw new Error('No unique account name stored on the page');
  return name;
}
