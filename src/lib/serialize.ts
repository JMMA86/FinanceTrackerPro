/**
 * Serialization helpers for Server Action responses.
 *
 * Prisma returns BIGINT monetary fields as JS `bigint`, which `JSON.stringify`
 * cannot serialize. These helpers convert the money fields back to JS numbers
 * so Server Action responses remain safe to send to the client.
 */

/**
 * Convert Prisma monetary BIGINT fields back to JS numbers so the object is
 * safe to serialize back to the client (JSON.stringify throws on bigint).
 */
export function serializeTransaction<
  T extends {
    amountCents: bigint;
    originalAmountCents: bigint | null;
    exchangeRate?: unknown;
  },
>(tx: T) {
  return {
    ...tx,
    amountCents: Number(tx.amountCents),
    originalAmountCents: tx.originalAmountCents == null ? null : Number(tx.originalAmountCents),
    exchangeRate: toPlainNumberOrNull(tx.exchangeRate),
  };
}

/**
 * Convert a Prisma `Decimal`, `bigint`, number, or nullish value to a plain
 * JS number (or null) so Server Action responses remain JSON-safe.
 */
function toPlainNumberOrNull(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (
    typeof value === 'object' &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}
