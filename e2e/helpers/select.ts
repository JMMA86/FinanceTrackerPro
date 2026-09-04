/**
 * Shared helper for the custom `AccountSelect` dropdown (combobox + listbox).
 *
 * The account selectors are NO LONGER native `<select>` elements: they are
 * custom ARIA comboboxes rendered by `src/components/transactions/AccountSelect.tsx`:
 *   - trigger button `role="combobox"` (accessible name from the associated
 *     `<label htmlFor>`, e.g. "Cuenta origen", "Cuenta destino", "Cuenta")
 *   - panel `role="listbox"` only present in the DOM while the dropdown is open
 *     (click on the trigger opens it)
 *   - options `role="option"` (buttons); their accessible name includes the
 *     account name + currency + (when showBalance) the formatted balance, so a
 *     partial match by account name works.
 */

import { type Page, expect } from '@playwright/test';

/**
 * Selects an account in an AccountSelect custom dropdown.
 *
 * @param page        The active page.
 * @param comboName   Accessible name of the combobox (label text), e.g. "Cuenta origen".
 * @param accountName Partial text of the account name (case-insensitive match).
 */
export async function selectAccount(
  page: Page,
  comboName: string,
  accountName: string
): Promise<void> {
  const combo = page.getByRole('combobox', { name: new RegExp(comboName, 'i') });
  await combo.click();

  // Scope the listbox by the combobox's aria-controls id so a stray listbox
  // from another (closed) dropdown never matches.
  const controlsId = await combo.getAttribute('aria-controls');
  const listbox = controlsId ? page.locator(`#${controlsId}`) : page.getByRole('listbox');
  await expect(listbox).toBeVisible({ timeout: 5000 });

  const option = listbox.getByRole('option', { name: new RegExp(accountName, 'i') });
  await option.click();

  // Wait for the dropdown to close and the selection state to settle.
  await expect(listbox).not.toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(150);
}
