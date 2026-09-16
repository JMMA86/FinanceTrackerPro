/**
 * Shared date utilities for client components.
 */

/**
 * Serialize a Date into a `datetime-local` input value using the user's LOCAL
 * timezone (e.g. "2024-06-15T14:30"). This keeps the browser from treating
 * the value as UTC when the form is submitted.
 */
export function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
