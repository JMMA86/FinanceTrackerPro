import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaAccountRepository } from '../prisma/PrismaAccountRepository';
import type { PrismaClient, Account, AccountType, Currency } from '@prisma/client';

const createMockPrismaClient = () =>
  ({
    account: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  }) as unknown as PrismaClient;

const buildMockAccount = (overrides: Partial<Account> = {}): Account => ({
  id: 'account-1',
  userId: 'user-1',
  name: 'Checking',
  type: 'BANK' as AccountType,
  currency: 'USD' as Currency,
  balanceCents: 100000,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  createdBy: 'user-1',
  lastModifiedBy: 'user-1',
  interestRateEA: null,
  creditLimitCents: null,
  cutoffDay: null,
  paymentDueDay: null,
  parentAccountId: null,
  lastReconciled: null,
  ...overrides,
});

describe('PrismaAccountRepository', () => {
  let mockPrisma: PrismaClient;
  let repository: PrismaAccountRepository;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaAccountRepository(mockPrisma);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findById', () => {
    it('should return account when found', async () => {
      // Given
      const mockAccount = buildMockAccount();
      vi.mocked(mockPrisma.account.findUnique).mockResolvedValue(mockAccount);

      // When
      const result = await repository.findById('account-1');

      // Then
      expect(result).toEqual(mockAccount);
      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'account-1', isActive: true },
      });
    });

    it('should return null when account does not exist', async () => {
      // Given
      vi.mocked(mockPrisma.account.findUnique).mockResolvedValue(null);

      // When
      const result = await repository.findById('non-existent');

      // Then
      expect(result).toBeNull();
    });
  });

  describe('findManyByUserId', () => {
    it('should return all active accounts for user ordered by creation date', async () => {
      // Given
      const mockAccounts = [
        buildMockAccount({ id: 'account-1', name: 'Checking' }),
        buildMockAccount({ id: 'account-2', name: 'Savings', balanceCents: 50000 }),
      ];
      vi.mocked(mockPrisma.account.findMany).mockResolvedValue(mockAccounts);

      // When
      const result = await repository.findManyByUserId('user-1');

      // Then
      expect(result).toHaveLength(2);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findActiveWithRecentActivity', () => {
    it('should return accounts that have transactions since the given date', async () => {
      // Given
      const since = new Date('2024-01-01');
      const mockAccounts = [{ id: 'account-1' }] as Account[];
      vi.mocked(mockPrisma.account.findMany).mockResolvedValue(mockAccounts);

      // When
      const result = await repository.findActiveWithRecentActivity(since);

      // Then
      expect(result).toHaveLength(1);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          transactions: { some: { createdAt: { gte: since } } },
        },
        select: { id: true },
      });
    });
  });

  describe('updateBalance', () => {
    it('should update balance and lastModifiedBy', async () => {
      // Given
      const mockAccount = buildMockAccount({ balanceCents: 200000, lastModifiedBy: 'system' });
      vi.mocked(mockPrisma.account.update).mockResolvedValue(mockAccount);

      // When
      const result = await repository.updateBalance('account-1', 200000, 'system');

      // Then
      expect(result.balanceCents).toBe(200000);
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { balanceCents: 200000, lastModifiedBy: 'system', updatedAt: expect.any(Date) },
      });
    });
  });

  describe('updateReconciliation', () => {
    it('should update lastReconciled timestamp', async () => {
      // Given
      const reconciledDate = new Date();
      const mockAccount = buildMockAccount({ lastReconciled: reconciledDate });
      vi.mocked(mockPrisma.account.update).mockResolvedValue(mockAccount);

      // When
      await repository.updateReconciliation('account-1', reconciledDate);

      // Then
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { lastReconciled: reconciledDate, updatedAt: expect.any(Date) },
      });
    });
  });

  describe('create', () => {
    it('should create account with zero initial balance by default', async () => {
      // Given
      const mockAccount = buildMockAccount({ balanceCents: 0 });
      vi.mocked(mockPrisma.account.create).mockResolvedValue(mockAccount);

      // When
      const result = await repository.create({
        userId: 'user-1',
        name: 'Checking',
        type: 'BANK' as AccountType,
        currency: 'USD' as Currency,
        createdBy: 'user-1',
      });

      // Then
      expect(result.name).toBe('Checking');
      expect(result.balanceCents).toBe(0);
    });

    it('should create account with provided initial balance', async () => {
      // Given
      const mockAccount = buildMockAccount({ balanceCents: 100000 });
      vi.mocked(mockPrisma.account.create).mockResolvedValue(mockAccount);

      // When
      const result = await repository.create({
        userId: 'user-1',
        name: 'Savings',
        type: 'BANK' as AccountType,
        currency: 'USD' as Currency,
        balanceCents: 100000,
        createdBy: 'user-1',
      });

      // Then
      expect(result.balanceCents).toBe(100000);
    });
  });

  describe('softDelete', () => {
    it('should mark account as inactive with deletedAt timestamp', async () => {
      // Given
      const mockAccount = buildMockAccount({ isActive: false, deletedAt: new Date() });
      vi.mocked(mockPrisma.account.update).mockResolvedValue(mockAccount);

      // When
      const result = await repository.softDelete('account-1', 'user-1');

      // Then
      expect(result.isActive).toBe(false);
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: { isActive: false, deletedAt: expect.any(Date), lastModifiedBy: 'user-1' },
      });
    });
  });
});
