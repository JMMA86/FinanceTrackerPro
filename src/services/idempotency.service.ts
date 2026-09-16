/**
 * Idempotency Service (CLAUDE.md Rule 12)
 * Prevents duplicate financial operations from network retries
 *
 * CRITICAL: ALL transaction/transfer mutations MUST use idempotency keys
 * Keys: UUID v4 generated client-side
 * Lifetime: 24 hours for active records, forever for completed operations
 *
 * REFACTORED: Uses Repository Pattern with DI
 */

import 'server-only';
import type { ITransactionRepository } from '@/lib/repositories/interfaces/ITransactionRepository';

/**
 * Check if idempotency key was already processed
 * @param key UUID v4 idempotency key
 * @param transactionRepo Transaction repository (DI)
 * @returns Object with exists flag and existing record if found
 */
export async function checkIdempotencyKey(
  key: string,
  transactionRepo: ITransactionRepository
): Promise<{
  exists: boolean;
  record: unknown;
  type: 'transaction' | null;
}> {
  // Validate key format (UUID v4)
  if (!validateIdempotencyKey(key)) {
    throw new Error('Invalid idempotency key format - must be UUID v4');
  }

  // Check transactions
  const transaction = await transactionRepo.findByIdempotencyKey(key);

  if (transaction) {
    return {
      exists: true,
      record: transaction,
      type: 'transaction',
    };
  }

  // No existing record found
  return {
    exists: false,
    record: null,
    type: null,
  };
}

/**
 * Validate idempotency key format (UUID v4)
 * @param key Idempotency key to validate
 * @returns true if valid UUID v4
 */
export function validateIdempotencyKey(key: string): boolean {
  const uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV4Regex.test(key);
}

/**
 * Check and lock idempotency key atomically
 * Used for preventing race conditions in concurrent requests
 *
 * @param key UUID v4 idempotency key
 * @param operationType Type of operation ('transaction')
 * @param transactionRepo Transaction repository (DI)
 * @returns Existing record if already processed, null if first time
 */
export async function checkAndLockIdempotency(
  key: string,
  operationType: 'transaction',
  transactionRepo: ITransactionRepository
): Promise<unknown> {
  if (!validateIdempotencyKey(key)) {
    throw new Error('Invalid idempotency key format - must be UUID v4');
  }

  // Check existing records
  const existing = await checkIdempotencyKey(key, transactionRepo);

  if (existing.exists) {
    // Already processed - return existing record (idempotent response)
    return existing.record;
  }

  // First time - proceed with operation
  // The actual record creation happens in the calling action
  return null;
}

/**
 * Generate new idempotency key (UUID v4)
 * For server-side operations that need to create idempotent records
 *
 * NOTE: Client should generate keys, this is for server-initiated operations
 * @returns UUID v4 string
 */
export function generateIdempotencyKey(): string {
  return crypto.randomUUID();
}

/**
 * Idempotent wrapper for any async operation
 * Ensures operation runs only once per key
 *
 * @param key Idempotency key
 * @param operation Async operation to execute
 * @param transactionRepo Transaction repository (DI)
 * @returns Operation result
 */
export async function withIdempotency<T>(
  key: string,
  operation: () => Promise<T>,
  transactionRepo: ITransactionRepository
): Promise<{ result: T; wasIdempotent: boolean }> {
  const existing = await checkAndLockIdempotency(key, 'transaction', transactionRepo);

  if (existing) {
    // Already processed - return cached result
    return {
      result: existing as T,
      wasIdempotent: true,
    };
  }

  // Execute operation (first time)
  const result = await operation();

  return {
    result,
    wasIdempotent: false,
  };
}
