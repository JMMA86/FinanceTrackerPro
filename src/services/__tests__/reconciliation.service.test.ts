/**
 * Reconciliation Service Test Suite
 * Tests balance reconciliation against transaction history
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getTrueBalance,
  reconcileAccount,
  reconcileMultipleAccounts,
  reconcileUserAccounts,
  getBalanceDiscrepancy,
  reconcileActiveAccounts,
} from '../reconciliation.service';
import type { IAccountRepository } from '@/lib/repositories/interfaces/IAccountRepository';
import type { ITransactionRepository } from '@/lib/repositories/interfaces/ITransactionRepository';
import type { Account, Transaction, AccountType, Currency, TransactionType } from '@prisma/client';

// Mock repositories
const createMockAccountRepo = (): IAccountRepository => ({
  findById: vi.fn(),
  findManyByUserId: vi.fn(),
  findActiveWithRecentActivity: vi.fn(),
  updateBalance: vi.fn(),
  updateReconciliation: vi.fn(),
  create: vi.fn(),
  softDelete: vi.fn(),
});

const createMockTransactionRepo = (): ITransactionRepository => ({
  findById: vi.fn(),
  findByIdempotencyKey: vi.fn(),
  findManyByAccountId: vi.fn(),
  findPairedTransfers: vi.fn(),
  create: vi.fn(),
  createMany: vi.fn(),
  softDelete: vi.fn(),
});

describe('reconciliation.service.ts - getTrueBalance', () => {
  it('should calculate balance from income transactions', async () => {
    const mockRepo = createMockTransactionRepo();
    vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      { amountCents: 50000, type: 'INCOME' as TransactionType } as Transaction,
    ]);

    const balance = await getTrueBalance('account-1', mockRepo);
    expect(balance).toBe(150000);
  });

  it('should handle expenses as negative amounts', async () => {
    const mockRepo = createMockTransactionRepo();
    vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      { amountCents: -30000, type: 'EXPENSE' as TransactionType } as Transaction,
    ]);

    const balance = await getTrueBalance('account-1', mockRepo);
    expect(balance).toBe(70000);
  });

  it('should handle transfers in/out', async () => {
    const mockRepo = createMockTransactionRepo();
    vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      { amountCents: -20000, type: 'TRANSFER_OUT' as TransactionType } as Transaction,
      { amountCents: 50000, type: 'TRANSFER_IN' as TransactionType } as Transaction,
    ]);

    const balance = await getTrueBalance('account-1', mockRepo);
    expect(balance).toBe(130000);
  });

  it('should return 0 for empty transaction history', async () => {
    const mockRepo = createMockTransactionRepo();
    vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([]);

    const balance = await getTrueBalance('account-1', mockRepo);
    expect(balance).toBe(0);
  });
});

describe('reconciliation.service.ts - reconcileAccount', () => {
  let mockAccountRepo: IAccountRepository;
  let mockTransactionRepo: ITransactionRepository;

  beforeEach(() => {
    mockAccountRepo = createMockAccountRepo();
    mockTransactionRepo = createMockTransactionRepo();
  });

  it('should detect and fix balance discrepancy', async () => {
    const mockAccount: Account = {
      id: 'account-1',
      userId: 'user-1',
      name: 'Checking',
      type: 'BANK' as AccountType,
      currency: 'USD' as Currency,
      balanceCents: 90000, // Cached (incorrect)
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

    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);
    vi.mocked(mockAccountRepo.updateBalance).mockResolvedValue(mockAccount);
    vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

    const result = await reconcileAccount('account-1', mockAccountRepo, mockTransactionRepo);

    expect(result.success).toBe(true);
    expect(result.cachedBalance).toBe(90000);
    expect(result.trueBalance).toBe(100000);
    expect(result.discrepancy).toBe(-10000);
    expect(result.wasUpdated).toBe(true);
    expect(mockAccountRepo.updateBalance).toHaveBeenCalledWith(
      'account-1',
      100000,
      'system-reconciliation'
    );
  });

  it('should not update if no discrepancy', async () => {
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

    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);
    vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

    const result = await reconcileAccount('account-1', mockAccountRepo, mockTransactionRepo);

    expect(result.success).toBe(true);
    expect(result.discrepancy).toBe(0);
    expect(result.wasUpdated).toBe(false);
    expect(mockAccountRepo.updateBalance).not.toHaveBeenCalled();
  });

  it('should throw error if account not found', async () => {
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(null);

    await expect(
      reconcileAccount('non-existent', mockAccountRepo, mockTransactionRepo)
    ).rejects.toThrow('Account non-existent not found');
  });
});

describe('reconciliation.service.ts - reconcileMultipleAccounts', () => {
  it('should reconcile multiple accounts in parallel', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

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

    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);
    vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

    const results = await reconcileMultipleAccounts(
      ['account-1', 'account-2'],
      mockAccountRepo,
      mockTransactionRepo
    );

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('should handle failures gracefully', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

    vi.mocked(mockAccountRepo.findById).mockResolvedValue(null);

    const results = await reconcileMultipleAccounts(
      ['non-existent'],
      mockAccountRepo,
      mockTransactionRepo
    );

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('not found');
  });

  it('should handle mixed success and failure results', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

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

    // First call succeeds, second fails
    vi.mocked(mockAccountRepo.findById)
      .mockResolvedValueOnce(mockAccount)
      .mockResolvedValueOnce(null);

    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);
    vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

    const results = await reconcileMultipleAccounts(
      ['account-1', 'non-existent'],
      mockAccountRepo,
      mockTransactionRepo
    );

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error).toContain('not found');
  });

  it('should handle repository errors in parallel execution', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

    vi.mocked(mockAccountRepo.findById).mockRejectedValue(new Error('Database connection failed'));

    const results = await reconcileMultipleAccounts(
      ['account-1'],
      mockAccountRepo,
      mockTransactionRepo
    );

    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Database connection failed');
  });
});

describe('reconciliation.service.ts - reconcileUserAccounts', () => {
  it('should reconcile all user accounts', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

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
    ];

    vi.mocked(mockAccountRepo.findManyByUserId).mockResolvedValue(mockAccounts);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccounts[0]);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);
    vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccounts[0]);

    const result = await reconcileUserAccounts('user-1', mockAccountRepo, mockTransactionRepo);

    expect(result.totalAccounts).toBe(1);
    expect(result.reconciledCount).toBe(1);
    expect(result.discrepanciesFound).toBe(0);
  });
});

describe('reconciliation.service.ts - getBalanceDiscrepancy', () => {
  it('should throw error when account not found', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

    vi.mocked(mockAccountRepo.findById).mockResolvedValue(null);

    await expect(
      getBalanceDiscrepancy('account-not-found', mockAccountRepo, mockTransactionRepo)
    ).rejects.toThrow('Account account-not-found not found');
  });

  it('should return discrepancy without updating', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

    const mockAccount: Account = {
      id: 'account-1',
      userId: 'user-1',
      name: 'Checking',
      type: 'BANK' as AccountType,
      currency: 'USD' as Currency,
      balanceCents: 90000,
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

    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);

    const result = await getBalanceDiscrepancy('account-1', mockAccountRepo, mockTransactionRepo);

    expect(result.cachedBalance).toBe(90000);
    expect(result.trueBalance).toBe(100000);
    expect(result.discrepancy).toBe(-10000);
    expect(result.needsReconciliation).toBe(true);
    expect(mockAccountRepo.updateBalance).not.toHaveBeenCalled();
  });

  it('should return needsReconciliation=false when balanced', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

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

    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);

    const result = await getBalanceDiscrepancy('account-1', mockAccountRepo, mockTransactionRepo);

    expect(result.needsReconciliation).toBe(false);
    expect(result.discrepancy).toBe(0);
  });
});

describe('reconciliation.service.ts - reconcileActiveAccounts', () => {
  it('should reconcile accounts with recent activity', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

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

    vi.mocked(mockAccountRepo.findActiveWithRecentActivity).mockResolvedValue([
      { id: 'account-1' } as Account,
    ]);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);
    vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

    const result = await reconcileActiveAccounts(mockAccountRepo, mockTransactionRepo);

    expect(result.processed).toBe(1);
    expect(result.discrepanciesFound).toBe(0);
    expect(result.criticalAlerts).toBe(0);
  });

  it('should trigger critical alert for large discrepancy', async () => {
    const mockAccountRepo = createMockAccountRepo();
    const mockTransactionRepo = createMockTransactionRepo();

    const mockAccount: Account = {
      id: 'account-1',
      userId: 'user-1',
      name: 'Checking',
      type: 'BANK' as AccountType,
      currency: 'USD' as Currency,
      balanceCents: 50000, // Cached (large discrepancy)
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

    vi.mocked(mockAccountRepo.findActiveWithRecentActivity).mockResolvedValue([
      { id: 'account-1' } as Account,
    ]);
    vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
    vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
      { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
    ]);
    vi.mocked(mockAccountRepo.updateBalance).mockResolvedValue(mockAccount);
    vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

    const result = await reconcileActiveAccounts(mockAccountRepo, mockTransactionRepo);

    expect(result.processed).toBe(1);
    expect(result.discrepanciesFound).toBe(1);
    expect(result.criticalAlerts).toBe(1); // > $10 discrepancy
  });
});
