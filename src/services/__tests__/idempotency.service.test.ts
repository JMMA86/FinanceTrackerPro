import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  checkIdempotencyKey,
  validateIdempotencyKey,
  checkAndLockIdempotency,
  generateIdempotencyKey,
  withIdempotency,
} from '../idempotency.service';
import type { ITransactionRepository } from '@/lib/repositories/interfaces/ITransactionRepository';
import type { Transaction, TransactionType, Currency } from '@prisma/client';

const createMockTransactionRepo = (): ITransactionRepository => ({
  findById: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  findManyByAccountId: vi.fn(),
  findPairedTransfers: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  softDelete: vi.fn(),
});

const VALID_UUID_V4 = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';

const buildMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  idempotencyKey: VALID_UUID_V4,
  userId: 'user-1',
  accountId: 'account-1',
  type: 'INCOME' as TransactionType,
  amountCents: 100000,
  currency: 'USD' as Currency,
  description: null,
  date: new Date(),
  originalAmountCents: null,
  originalCurrency: null,
  exchangeRate: null,
  transferId: null,
  transferToAccountId: null,
  transferFromAccountId: null,
  categoryId: null,
  fixedExpensePaymentId: null,
  loanInstallmentId: null,
  ipAddress: null,
  userAgent: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  createdBy: 'user-1',
  lastModifiedBy: 'user-1',
  openingBalance: false,
  ...overrides,
});

describe('idempotency.service.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateIdempotencyKey', () => {
    it('should accept a valid UUID v4', () => {
      // Given / When / Then
      expect(validateIdempotencyKey(VALID_UUID_V4)).toBe(true);
    });

    it('should reject an invalid UUID format', () => {
      // Given / When / Then
      expect(validateIdempotencyKey('not-a-uuid')).toBe(false);
      expect(validateIdempotencyKey('12345678-1234-1234-1234-123456789abc')).toBe(false);
    });

    it('should reject UUID v1', () => {
      // Given
      const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';

      // When / Then
      expect(validateIdempotencyKey(uuidV1)).toBe(false);
    });

    it('should reject empty string', () => {
      // Given / When / Then
      expect(validateIdempotencyKey('')).toBe(false);
    });
  });

  describe('checkIdempotencyKey', () => {
    let mockRepo: ITransactionRepository;

    beforeEach(() => {
      mockRepo = createMockTransactionRepo();
    });

    it('should return exists=true with the record when key already processed', async () => {
      // Given
      const mockTransaction = buildMockTransaction();
      vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(mockTransaction);

      // When
      const result = await checkIdempotencyKey(VALID_UUID_V4, mockRepo);

      // Then
      expect(result.exists).toBe(true);
      expect(result.type).toBe('transaction');
      expect(result.record).toEqual(mockTransaction);
    });

    it('should return exists=false when key is new', async () => {
      // Given
      vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(null);

      // When
      const result = await checkIdempotencyKey(VALID_UUID_V4, mockRepo);

      // Then
      expect(result.exists).toBe(false);
      expect(result.type).toBeNull();
      expect(result.record).toBeNull();
    });

    it('should throw when the key format is invalid', async () => {
      // Given / When / Then
      await expect(checkIdempotencyKey('invalid-key', mockRepo)).rejects.toThrow(
        'Invalid idempotency key format - must be UUID v4'
      );
    });
  });

  describe('checkAndLockIdempotency', () => {
    let mockRepo: ITransactionRepository;

    beforeEach(() => {
      mockRepo = createMockTransactionRepo();
    });

    it('should return the existing record when key was already processed', async () => {
      // Given
      const mockTransaction = buildMockTransaction();
      vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(mockTransaction);

      // When
      const result = await checkAndLockIdempotency(VALID_UUID_V4, 'transaction', mockRepo);

      // Then
      expect(result).toEqual(mockTransaction);
    });

    it('should return null when processing for the first time', async () => {
      // Given
      vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(null);

      // When
      const result = await checkAndLockIdempotency(VALID_UUID_V4, 'transaction', mockRepo);

      // Then
      expect(result).toBeNull();
    });

    it('should throw when the key format is invalid', async () => {
      // Given / When / Then
      await expect(checkAndLockIdempotency('invalid-key', 'transaction', mockRepo)).rejects.toThrow(
        'Invalid idempotency key format - must be UUID v4'
      );
    });
  });

  describe('generateIdempotencyKey', () => {
    it('should generate a valid UUID v4', () => {
      // Given / When
      const key = generateIdempotencyKey();

      // Then
      expect(validateIdempotencyKey(key)).toBe(true);
    });

    it('should generate unique keys on each call', () => {
      // Given / When
      const key1 = generateIdempotencyKey();
      const key2 = generateIdempotencyKey();

      // Then
      expect(key1).not.toBe(key2);
    });
  });

  describe('withIdempotency', () => {
    let mockRepo: ITransactionRepository;

    beforeEach(() => {
      mockRepo = createMockTransactionRepo();
    });

    it('should execute the operation and return wasIdempotent=false on first call', async () => {
      // Given
      vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(null);
      const operation = vi.fn().mockResolvedValue({ data: 'success' });

      // When
      const result = await withIdempotency(VALID_UUID_V4, operation, mockRepo);

      // Then
      expect(result.wasIdempotent).toBe(false);
      expect(result.result).toEqual({ data: 'success' });
      expect(operation).toHaveBeenCalled();
    });

    it('should return the cached result and wasIdempotent=true on retry', async () => {
      // Given
      const mockTransaction = buildMockTransaction();
      vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(mockTransaction);
      const operation = vi.fn();

      // When
      const result = await withIdempotency(VALID_UUID_V4, operation, mockRepo);

      // Then
      expect(result.wasIdempotent).toBe(true);
      expect(result.result).toEqual(mockTransaction);
      expect(operation).not.toHaveBeenCalled();
    });
  });
});
