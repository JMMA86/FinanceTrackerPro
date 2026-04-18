/**
 * PrismaAccountRepository Test Suite
 * Tests account repository with mocked Prisma client
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaAccountRepository } from '../prisma/PrismaAccountRepository';
import type { PrismaClient, Account, AccountType, Currency } from '@prisma/client';

// Create mock Prisma client
const createMockPrismaClient = () => {
  return {
    account: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as PrismaClient;
};

describe('PrismaAccountRepository', () => {
  let mockPrisma: PrismaClient;
  let repository: PrismaAccountRepository;

  beforeEach(() => {
    mockPrisma = createMockPrismaClient();
    repository = new PrismaAccountRepository(mockPrisma);
  });

  describe('findById', () => {
    it('should find account by id', async () => {
      const mockAccount: Account = {
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
      };

      vi.mocked(mockPrisma.account.findUnique).mockResolvedValue(mockAccount);

      const result = await repository.findById('account-1');

      expect(result).toEqual(mockAccount);
      expect(mockPrisma.account.findUnique).toHaveBeenCalledWith({
        where: { id: 'account-1', isActive: true },
      });
    });

    it('should return null if account not found', async () => {
      vi.mocked(mockPrisma.account.findUnique).mockResolvedValue(null);

      const result = await repository.findById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('findManyByUserId', () => {
    it('should find all active accounts for user', async () => {
      const mockAccounts: Account[] = [
        {
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
        },
        {
          id: 'account-2',
          userId: 'user-1',
          name: 'Savings',
          type: 'BANK' as AccountType,
          currency: 'USD' as Currency,
          balanceCents: 50000,
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
        },
      ];

      vi.mocked(mockPrisma.account.findMany).mockResolvedValue(mockAccounts);

      const result = await repository.findManyByUserId('user-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isActive: true },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('findActiveWithRecentActivity', () => {
    it('should find accounts with transactions since date', async () => {
      const since = new Date('2024-01-01');
      const mockAccounts = [
        {
          id: 'account-1',
        },
      ];

      vi.mocked(mockPrisma.account.findMany).mockResolvedValue(mockAccounts as Account[]);

      const result = await repository.findActiveWithRecentActivity(since);

      expect(result).toHaveLength(1);
      expect(mockPrisma.account.findMany).toHaveBeenCalledWith({
        where: {
          isActive: true,
          transactions: {
            some: {
              createdAt: { gte: since },
            },
          },
        },
        select: { id: true },
      });
    });
  });

  describe('updateBalance', () => {
    it('should update account balance', async () => {
      const mockAccount: Account = {
        id: 'account-1',
        userId: 'user-1',
        name: 'Checking',
        type: 'BANK' as AccountType,
        currency: 'USD' as Currency,
        balanceCents: 200000,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'system',
        interestRateEA: null,
        creditLimitCents: null,
        cutoffDay: null,
        paymentDueDay: null,
        parentAccountId: null,
        lastReconciled: null,
      };

      vi.mocked(mockPrisma.account.update).mockResolvedValue(mockAccount);

      const result = await repository.updateBalance('account-1', 200000, 'system');

      expect(result.balanceCents).toBe(200000);
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: {
          balanceCents: 200000,
          lastModifiedBy: 'system',
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('updateReconciliation', () => {
    it('should update lastReconciled timestamp', async () => {
      const mockAccount: Account = {
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
        lastReconciled: new Date(),
      };

      vi.mocked(mockPrisma.account.update).mockResolvedValue(mockAccount);

      const reconciledDate = new Date();
      await repository.updateReconciliation('account-1', reconciledDate);

      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: {
          lastReconciled: reconciledDate,
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('create', () => {
    it('should create new account', async () => {
      const mockAccount: Account = {
        id: 'account-1',
        userId: 'user-1',
        name: 'Checking',
        type: 'BANK' as AccountType,
        currency: 'USD' as Currency,
        balanceCents: 0,
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
      };

      vi.mocked(mockPrisma.account.create).mockResolvedValue(mockAccount);

      const result = await repository.create({
        userId: 'user-1',
        name: 'Checking',
        type: 'BANK' as AccountType,
        currency: 'USD' as Currency,
        createdBy: 'user-1',
      });

      expect(result.name).toBe('Checking');
      expect(result.balanceCents).toBe(0);
      expect(mockPrisma.account.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-1',
          name: 'Checking',
          type: 'BANK',
          currency: 'USD',
          balanceCents: 0,
          interestRateEA: undefined,
          creditLimitCents: undefined,
          cutoffDay: undefined,
          paymentDueDay: undefined,
          parentAccountId: undefined,
          createdBy: 'user-1',
          lastModifiedBy: 'user-1',
        },
      });
    });

    it('should create account with initial balance', async () => {
      const mockAccount: Account = {
        id: 'account-1',
        userId: 'user-1',
        name: 'Savings',
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
      };

      vi.mocked(mockPrisma.account.create).mockResolvedValue(mockAccount);

      const result = await repository.create({
        userId: 'user-1',
        name: 'Savings',
        type: 'BANK' as AccountType,
        currency: 'USD' as Currency,
        balanceCents: 100000,
        createdBy: 'user-1',
      });

      expect(result.balanceCents).toBe(100000);
    });
  });

  describe('softDelete', () => {
    it('should soft delete account', async () => {
      const mockAccount: Account = {
        id: 'account-1',
        userId: 'user-1',
        name: 'Checking',
        type: 'BANK' as AccountType,
        currency: 'USD' as Currency,
        balanceCents: 100000,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
        interestRateEA: null,
        creditLimitCents: null,
        cutoffDay: null,
        paymentDueDay: null,
        parentAccountId: null,
        lastReconciled: null,
      };

      vi.mocked(mockPrisma.account.update).mockResolvedValue(mockAccount);

      const result = await repository.softDelete('account-1', 'user-1');

      expect(result.isActive).toBe(false);
      expect(mockPrisma.account.update).toHaveBeenCalledWith({
        where: { id: 'account-1' },
        data: {
          isActive: false,
          deletedAt: expect.any(Date),
          lastModifiedBy: 'user-1',
        },
      });
    });
  });
});
