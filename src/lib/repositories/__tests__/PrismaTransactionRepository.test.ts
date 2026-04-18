/**
 * PrismaTransactionRepository Test Suite
 * Tests transaction repository with mocked Prisma client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaTransactionRepository } from '../prisma/PrismaTransactionRepository';
import type { PrismaClient, Transaction, TransactionType, Currency } from '@prisma/client';
import { Decimal } from 'decimal.js';

// Create mock Prisma client
const createMockPrismaClient = () => {
  return {
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('PrismaTransactionRepository', () => {
  let mockPrisma: PrismaClient;
  let repository: PrismaTransactionRepository;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaTransactionRepository(mockPrisma);
  });

  describe('findById', () => {
    it('should find transaction by id', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'INCOME' as TransactionType,
        amountCents: 100000,
        currency: 'USD' as Currency,
        description: 'Salary',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: null,
        transferToAccountId: null,
        transferFromAccountId: null,
        categoryId: null,
        ipAddress: null,
        userAgent: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      };

      vi.mocked(mockPrisma.transaction.findUnique).mockResolvedValue(mockTransaction);

      const result = await repository.findById('tx-1');

      expect(result).toEqual(mockTransaction);
      expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: 'tx-1', isActive: true },
      });
    });

    it('should return null if transaction not found', async () => {
      vi.mocked(mockPrisma.transaction.findUnique).mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findByIdempotencyKey', () => {
    it('should find transaction by idempotency key', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'INCOME' as TransactionType,
        amountCents: 100000,
        currency: 'USD' as Currency,
        description: 'Salary',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: null,
        transferToAccountId: null,
        transferFromAccountId: null,
        categoryId: null,
        ipAddress: null,
        userAgent: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      };

      vi.mocked(mockPrisma.transaction.findUnique).mockResolvedValue(mockTransaction);

      const result = await repository.findByIdempotencyKey('key-1');

      expect(result).toEqual(mockTransaction);
      expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'key-1' },
      });
    });
  });

  describe('findManyByAccountId', () => {
    it('should find all active transactions for account', async () => {
      const mockTransactions = [
        {
          amountCents: 100000,
          type: 'INCOME' as TransactionType,
        },
        {
          amountCents: -30000,
          type: 'EXPENSE' as TransactionType,
        },
      ];

      vi.mocked(mockPrisma.transaction.findMany).mockResolvedValue(
        mockTransactions as Transaction[]
      );

      const result = await repository.findManyByAccountId('account-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
        where: { accountId: 'account-1', isActive: true },
        select: {
          amountCents: true,
          type: true,
        },
      });
    });
  });

  describe('findPairedTransfers', () => {
    it('should find paired transfer transactions', async () => {
      const mockTransactions: Transaction[] = [
        {
          id: 'tx-1',
          idempotencyKey: 'key-1',
          userId: 'user-1',
          accountId: 'account-1',
          type: 'TRANSFER_OUT' as TransactionType,
          amountCents: -50000,
          currency: 'USD' as Currency,
          description: 'Transfer',
          date: new Date(),
          originalAmountCents: null,
          originalCurrency: null,
          exchangeRate: null,
          transferId: 'transfer-1',
          transferToAccountId: 'account-2',
          transferFromAccountId: 'account-1',
          categoryId: null,
          ipAddress: null,
          userAgent: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: 'user-1',
          lastModifiedBy: 'user-1',
        },
        {
          id: 'tx-2',
          idempotencyKey: 'key-2',
          userId: 'user-1',
          accountId: 'account-2',
          type: 'TRANSFER_IN' as TransactionType,
          amountCents: 50000,
          currency: 'USD' as Currency,
          description: 'Transfer',
          date: new Date(),
          originalAmountCents: null,
          originalCurrency: null,
          exchangeRate: null,
          transferId: 'transfer-1',
          transferToAccountId: 'account-2',
          transferFromAccountId: 'account-1',
          categoryId: null,
          ipAddress: null,
          userAgent: null,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          createdBy: 'user-1',
          lastModifiedBy: 'user-1',
        },
      ];

      vi.mocked(mockPrisma.transaction.findMany).mockResolvedValue(mockTransactions);

      const result = await repository.findPairedTransfers('transfer-1');

      expect(result).toHaveLength(2);
      expect(result[0].amountCents).toBe(-50000);
      expect(result[1].amountCents).toBe(50000);
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
        where: { transferId: 'transfer-1', isActive: true },
        orderBy: { amountCents: 'asc' },
      });
    });
  });

  describe('create', () => {
    it('should create new transaction', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'INCOME' as TransactionType,
        amountCents: 100000,
        currency: 'USD' as Currency,
        description: 'Salary',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: null,
        transferToAccountId: null,
        transferFromAccountId: null,
        categoryId: null,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      };

      vi.mocked(mockPrisma.transaction.create).mockResolvedValue(mockTransaction);

      const result = await repository.create({
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'INCOME' as TransactionType,
        amountCents: 100000,
        currency: 'USD' as Currency,
        description: 'Salary',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        createdBy: 'user-1',
      });

      expect(result.amountCents).toBe(100000);
      expect(result.type).toBe('INCOME');
    });

    it('should create transaction with currency conversion', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'INCOME' as TransactionType,
        amountCents: 110000,
        currency: 'USD' as Currency,
        description: 'Payment',
        date: new Date(),
        originalAmountCents: 100000,
        originalCurrency: 'EUR' as Currency,
        exchangeRate: new Decimal('1.1'),
        transferId: null,
        transferToAccountId: null,
        transferFromAccountId: null,
        categoryId: null,
        ipAddress: null,
        userAgent: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      };

      vi.mocked(mockPrisma.transaction.create).mockResolvedValue(mockTransaction);

      const result = await repository.create({
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'INCOME' as TransactionType,
        amountCents: 110000,
        currency: 'USD' as Currency,
        originalAmountCents: 100000,
        originalCurrency: 'EUR' as Currency,
        exchangeRate: new Decimal('1.1'),
        createdBy: 'user-1',
      });

      expect(result.originalAmountCents).toBe(100000);
      expect(result.exchangeRate).toEqual(new Decimal('1.1'));
    });
  });

  describe('createMany', () => {
    it('should create multiple transactions', async () => {
      const mockTransaction1: Transaction = {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'TRANSFER_OUT' as TransactionType,
        amountCents: -50000,
        currency: 'USD' as Currency,
        description: 'Transfer',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: 'transfer-1',
        transferToAccountId: 'account-2',
        transferFromAccountId: 'account-1',
        categoryId: null,
        ipAddress: null,
        userAgent: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      };

      const mockTransaction2: Transaction = {
        id: 'tx-2',
        idempotencyKey: 'key-2',
        userId: 'user-1',
        accountId: 'account-2',
        type: 'TRANSFER_IN' as TransactionType,
        amountCents: 50000,
        currency: 'USD' as Currency,
        description: 'Transfer',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: 'transfer-1',
        transferToAccountId: 'account-2',
        transferFromAccountId: 'account-1',
        categoryId: null,
        ipAddress: null,
        userAgent: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      };

      vi.mocked(mockPrisma.transaction.create)
        .mockResolvedValueOnce(mockTransaction1)
        .mockResolvedValueOnce(mockTransaction2);

      const result = await repository.createMany([
        {
          idempotencyKey: 'key-1',
          userId: 'user-1',
          accountId: 'account-1',
          type: 'TRANSFER_OUT' as TransactionType,
          amountCents: -50000,
          currency: 'USD' as Currency,
          transferId: 'transfer-1',
          transferToAccountId: 'account-2',
          transferFromAccountId: 'account-1',
          createdBy: 'user-1',
        },
        {
          idempotencyKey: 'key-2',
          userId: 'user-1',
          accountId: 'account-2',
          type: 'TRANSFER_IN' as TransactionType,
          amountCents: 50000,
          currency: 'USD' as Currency,
          transferId: 'transfer-1',
          transferToAccountId: 'account-2',
          transferFromAccountId: 'account-1',
          createdBy: 'user-1',
        },
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].amountCents).toBe(-50000);
      expect(result[1].amountCents).toBe(50000);
    });
  });

  describe('softDelete', () => {
    it('should soft delete transaction', async () => {
      const mockTransaction: Transaction = {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-1',
        type: 'INCOME' as TransactionType,
        amountCents: 100000,
        currency: 'USD' as Currency,
        description: 'Salary',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: null,
        transferToAccountId: null,
        transferFromAccountId: null,
        categoryId: null,
        ipAddress: null,
        userAgent: null,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      };

      vi.mocked(mockPrisma.transaction.update).mockResolvedValue(mockTransaction);

      const result = await repository.softDelete('tx-1', 'user-1');

      expect(result.isActive).toBe(false);
      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: {
          isActive: false,
          deletedAt: expect.any(Date),
          lastModifiedBy: 'user-1',
        },
      });
    });
  });
});
