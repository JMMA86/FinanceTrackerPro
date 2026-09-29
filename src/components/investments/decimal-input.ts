/**
 * Quantity input helpers shared by the buy / sell / edit-trade forms.
 *
 * Quantities are NOT money: they are decimal strings sent to the backend with a
 * dot separator. These helpers keep the UI tolerant of the comma separator used
 * in es-CO while guaranteeing a normalized payload.
 */

import { Decimal } from 'decimal.js';

/** Maximum decimals rendered by `formatQuantity` (display only). */
const MAX_DISPLAY_DECIMALS = 12;

/**
 * Keep digits and at most one decimal separator (`,` or `.`), rejecting the
 * rest. A trailing separator (`"2."`, `"2,"`) is a valid intermediate state
 * while the user is still typing.
 */
export function sanitizeQuantityInput(raw: string): string {
  let result = '';
  let hasSeparator = false;

  for (const char of raw) {
    if (char >= '0' && char <= '9') {
      result += char;
    } else if ((char === '.' || char === ',') && !hasSeparator) {
      result += char;
      hasSeparator = true;
    }
  }

  return result;
}

/**
 * Normalize a quantity to the backend representation: comma → dot and a
 * trailing separator removed (`"2,"` → `"2"`).
 */
export function toDecimalString(value: string): string {
  const normalized = value.trim().replaceAll(',', '.');
  return normalized.endsWith('.') ? normalized.slice(0, -1) : normalized;
}

/**
 * Parse a (localized) quantity string into a number. Empty or malformed input
 * resolves to `0`; Decimal.js is used so no `parseFloat` edge cases leak in.
 */
export function parseQuantity(value: string): number {
  const normalized = toDecimalString(value);
  if (!/^\d+(\.\d*)?$/.test(normalized)) return 0;
  const parsed = new Decimal(normalized).toNumber();
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Format a quantity for display: up to 12 decimals with trailing zeros trimmed,
 * so a position of `2.243695838` is not hidden as `2.2437` while `10` stays `10`.
 */
export function formatQuantity(value: number): string {
  if (!Number.isFinite(value)) return '0';
  // Fixed decimals protect the integer part: trim only trailing fractional
  // zeros (the decimal point stops the loop), then drop a dangling point.
  let trimmed = new Decimal(value)
    .toDecimalPlaces(MAX_DISPLAY_DECIMALS)
    .toFixed(MAX_DISPLAY_DECIMALS);
  while (trimmed.endsWith('0')) {
    trimmed = trimmed.slice(0, -1);
  }
  if (trimmed.endsWith('.')) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed === '' ? '0' : trimmed;
}
