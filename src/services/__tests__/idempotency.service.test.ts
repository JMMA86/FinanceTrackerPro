/**
 * Idempotency Service Test Suite
 * Tests idempotency key validation and checking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('idempotency.service.ts - validateIdempotencyKey', () => {
  it('should validate correct UUID v4', () => {
    const validKey = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
    expect(validateIdempotencyKey(validKey)).toBe(true);
  });

  it('should reject invalid UUID format', () => {
    expect(validateIdempotencyKey('not-a-uuid')).toBe(false);
    expect(validateIdempotencyKey('12345678-1234-1234-1234-123456789abc')).toBe(false);
  });

  it('should reject UUID v1', () => {
    const uuidV1 = '550e8400-e29b-11d4-a716-446655440000';
    expect(validateIdempotencyKey(uuidV1)).toBe(false);
  });

  it('should reject empty string', () => {
    expect(validateIdempotencyKey('')).toBe(false);
  });
});

describe('idempotency.service.ts - checkIdempotencyKey', () => {
  let mockRepo: ITransactionRepository;

  beforeEach(() => {
    mockRepo = createMockTransactionRepo();
  });

  it('should return exists=true for existing transaction', async () => {
    const mockTransaction: Transaction = {
      id: 'tx-1',
      idempotencyKey: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
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
    };

    vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(mockTransaction);

    const result = await checkIdempotencyKey('a1b2c3d4-e5f6-4789-a012-3456789abcde', mockRepo);

    expect(result.exists).toBe(true);
    expect(result.type).toBe('transaction');
    expect(result.record).toEqual(mockTransaction);
  });

  it('should return exists=false for new key', async () => {
    vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(null);

    const result = await checkIdempotencyKey('a1b2c3d4-e5f6-4789-a012-3456789abcde', mockRepo);

    expect(result.exists).toBe(false);
    expect(result.type).toBeNull();
    expect(result.record).toBeNull();
  });

  it('should throw error for invalid key format', async () => {
    await expect(checkIdempotencyKey('invalid-key', mockRepo)).rejects.toThrow(
      'Invalid idempotency key format - must be UUID v4'
    );
  });
});

describe('idempotency.service.ts - checkAndLockIdempotency', () => {
  let mockRepo: ITransactionRepository;

  beforeEach(() => {
    mockRepo = createMockTransactionRepo();
  });

  it('should return existing record if already processed', async () => {
    const mockTransaction: Transaction = {
      id: 'tx-1',
      idempotencyKey: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
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
    };

    vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(mockTransaction);

    const result = await checkAndLockIdempotency(
      'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      'transaction',
      mockRepo
    );

    expect(result).toEqual(mockTransaction);
  });

  it('should return null for first-time processing', async () => {
    vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(null);

    const result = await checkAndLockIdempotency(
      'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      'transaction',
      mockRepo
    );

    expect(result).toBeNull();
  });

  it('should throw error for invalid key', async () => {
    await expect(checkAndLockIdempotency('invalid-key', 'transaction', mockRepo)).rejects.toThrow(
      'Invalid idempotency key format - must be UUID v4'
    );
  });
});

describe('idempotency.service.ts - generateIdempotencyKey', () => {
  it('should generate valid UUID v4', () => {
    const key = generateIdempotencyKey();
    expect(validateIdempotencyKey(key)).toBe(true);
  });

  it('should generate unique keys', () => {
    const key1 = generateIdempotencyKey();
    const key2 = generateIdempotencyKey();
    expect(key1).not.toBe(key2);
  });
});

describe('idempotency.service.ts - withIdempotency', () => {
  let mockRepo: ITransactionRepository;

  beforeEach(() => {
    mockRepo = createMockTransactionRepo();
  });

  it('should execute operation first time', async () => {
    vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(null);

    const operation = vi.fn().mockResolvedValue({ data: 'success' });

    const result = await withIdempotency(
      'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      operation,
      mockRepo
    );

    expect(result.wasIdempotent).toBe(false);
    expect(result.result).toEqual({ data: 'success' });
    expect(operation).toHaveBeenCalled();
  });

  it('should return cached result on retry', async () => {
    const mockTransaction: Transaction = {
      id: 'tx-1',
      idempotencyKey: 'a1b2c3d4-e5f6-4789-a012-3456789abcde',
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
    };

    vi.mocked(mockRepo.findByIdempotencyKey).mockResolvedValue(mockTransaction);

    const operation = vi.fn();

    const result = await withIdempotency(
      'a1b2c3d4-e5f6-4789-a012-3456789abcde',
      operation,
      mockRepo
    );

    expect(result.wasIdempotent).toBe(true);
    expect(result.result).toEqual(mockTransaction);
    expect(operation).not.toHaveBeenCalled();
  });
});
