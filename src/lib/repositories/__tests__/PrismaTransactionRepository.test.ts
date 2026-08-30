import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaTransactionRepository } from '../prisma/PrismaTransactionRepository';
import type { PrismaClient, Transaction, TransactionType, Currency } from '@prisma/client';
import { Decimal } from 'decimal.js';

const createMockPrismaClient = () =>
  ({
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  }) as unknown as PrismaClient;

const buildMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
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

describe('PrismaTransactionRepository', () => {
  let mockPrisma: PrismaClient;
  let repository: PrismaTransactionRepository;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaTransactionRepository(mockPrisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findById', () => {
    it('should return transaction when found', async () => {
      // Given
      const mockTx = buildMockTransaction();
      vi.mocked(mockPrisma.transaction.findUnique).mockResolvedValue(mockTx);

      // When
      const result = await repository.findById('tx-1');

      // Then
      expect(result).toEqual(mockTx);
      expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { id: 'tx-1', isActive: true },
      });
    });

    it('should return null when transaction does not exist', async () => {
      // Given
      vi.mocked(mockPrisma.transaction.findUnique).mockResolvedValue(null);

      // When
      const result = await repository.findById('non-existent');

      // Then
      expect(result).toBeNull();
    });
  });

  describe('findByIdempotencyKey', () => {
    it('should find transaction by idempotency key without active filter', async () => {
      // Given
      const mockTx = buildMockTransaction();
      vi.mocked(mockPrisma.transaction.findUnique).mockResolvedValue(mockTx);

      // When
      const result = await repository.findByIdempotencyKey('key-1');

      // Then
      expect(result).toEqual(mockTx);
      expect(mockPrisma.transaction.findUnique).toHaveBeenCalledWith({
        where: { idempotencyKey: 'key-1' },
      });
    });
  });

  describe('findManyByAccountId', () => {
    it('should return all active transactions for the account', async () => {
      // Given
      const mockTransactions = [
        { amountCents: 100000, type: 'INCOME' as TransactionType },
        { amountCents: -30000, type: 'EXPENSE' as TransactionType },
      ] as Transaction[];
      vi.mocked(mockPrisma.transaction.findMany).mockResolvedValue(mockTransactions);

      // When
      const result = await repository.findManyByAccountId('account-1');

      // Then
      expect(result).toHaveLength(2);
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
        where: { accountId: 'account-1', isActive: true },
        select: { amountCents: true, type: true },
      });
    });
  });

  describe('findPairedTransfers', () => {
    it('should return paired transactions ordered by amount ascending (debit first)', async () => {
      // Given
      const debit = buildMockTransaction({
        id: 'tx-1',
        type: 'TRANSFER_OUT',
        amountCents: -50000,
        transferId: 'transfer-1',
        accountId: 'account-1',
        transferToAccountId: 'account-2',
        transferFromAccountId: 'account-1',
      });
      const credit = buildMockTransaction({
        id: 'tx-2',
        type: 'TRANSFER_IN',
        amountCents: 50000,
        transferId: 'transfer-1',
        accountId: 'account-2',
        transferToAccountId: 'account-2',
        transferFromAccountId: 'account-1',
      });
      vi.mocked(mockPrisma.transaction.findMany).mockResolvedValue([debit, credit]);

      // When
      const result = await repository.findPairedTransfers('transfer-1');

      // Then
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
    it('should create a basic transaction', async () => {
      // Given
      const mockTx = buildMockTransaction({ ipAddress: '127.0.0.1', userAgent: 'test-agent' });
      vi.mocked(mockPrisma.transaction.create).mockResolvedValue(mockTx);

      // When
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

      // Then
      expect(result.amountCents).toBe(100000);
      expect(result.type).toBe('INCOME');
    });

    it('should create a transaction with currency conversion fields', async () => {
      // Given
      const mockTx = buildMockTransaction({
        amountCents: 110000,
        currency: 'USD' as Currency,
        originalAmountCents: 100000,
        originalCurrency: 'EUR' as Currency,
        exchangeRate: new Decimal('1.1'),
      });
      vi.mocked(mockPrisma.transaction.create).mockResolvedValue(mockTx);

      // When
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

      // Then
      expect(result.originalAmountCents).toBe(100000);
      expect(result.exchangeRate).toEqual(new Decimal('1.1'));
    });
  });

  describe('createMany', () => {
    it('should create multiple transactions and return all results', async () => {
      // Given
      const debit = buildMockTransaction({
        id: 'tx-1',
        type: 'TRANSFER_OUT',
        amountCents: -50000,
        transferId: 'transfer-1',
      });
      const credit = buildMockTransaction({
        id: 'tx-2',
        type: 'TRANSFER_IN',
        amountCents: 50000,
        transferId: 'transfer-1',
      });
      vi.mocked(mockPrisma.transaction.create)
        .mockResolvedValueOnce(debit)
        .mockResolvedValueOnce(credit);

      // When
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

      // Then
      expect(result).toHaveLength(2);
      expect(result[0].amountCents).toBe(-50000);
      expect(result[1].amountCents).toBe(50000);
    });
  });

  describe('softDelete', () => {
    it('should mark transaction as inactive with audit trail', async () => {
      // Given
      const mockTx = buildMockTransaction({ isActive: false, deletedAt: new Date() });
      vi.mocked(mockPrisma.transaction.update).mockResolvedValue(mockTx);

      // When
      const result = await repository.softDelete('tx-1', 'user-1');

      // Then
      expect(result.isActive).toBe(false);
      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: { isActive: false, deletedAt: expect.any(Date), lastModifiedBy: 'user-1' },
      });
    });
  });
});
