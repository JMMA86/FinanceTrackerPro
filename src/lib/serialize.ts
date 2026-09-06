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
  T extends { amountCents: bigint; originalAmountCents: bigint | null },
>(tx: T) {
  return {
    ...tx,
    amountCents: Number(tx.amountCents),
    originalAmountCents: tx.originalAmountCents == null ? null : Number(tx.originalAmountCents),
  };
}
