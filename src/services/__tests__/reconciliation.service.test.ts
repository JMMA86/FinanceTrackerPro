import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

describe('reconciliation.service.ts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTrueBalance', () => {
    it('should sum all income transaction amounts', async () => {
      // Given
      const mockRepo = createMockTransactionRepo();
      vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
        { amountCents: 50000, type: 'INCOME' as TransactionType } as Transaction,
      ]);

      // When
      const balance = await getTrueBalance('account-1', mockRepo);

      // Then
      expect(balance).toBe(150000);
    });

    it('should treat negative expense amounts as deductions', async () => {
      // Given
      const mockRepo = createMockTransactionRepo();
      vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
        { amountCents: -30000, type: 'EXPENSE' as TransactionType } as Transaction,
      ]);

      // When
      const balance = await getTrueBalance('account-1', mockRepo);

      // Then
      expect(balance).toBe(70000);
    });

    it('should handle transfer in/out amounts correctly', async () => {
      // Given
      const mockRepo = createMockTransactionRepo();
      vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
        { amountCents: -20000, type: 'TRANSFER_OUT' as TransactionType } as Transaction,
        { amountCents: 50000, type: 'TRANSFER_IN' as TransactionType } as Transaction,
      ]);

      // When
      const balance = await getTrueBalance('account-1', mockRepo);

      // Then
      expect(balance).toBe(130000);
    });

    it('should return 0 for empty transaction history', async () => {
      // Given
      const mockRepo = createMockTransactionRepo();
      vi.mocked(mockRepo.findManyByAccountId).mockResolvedValue([]);

      // When
      const balance = await getTrueBalance('account-1', mockRepo);

      // Then
      expect(balance).toBe(0);
    });
  });

  describe('reconcileAccount', () => {
    let mockAccountRepo: IAccountRepository;
    let mockTransactionRepo: ITransactionRepository;

    beforeEach(() => {
      mockAccountRepo = createMockAccountRepo();
      mockTransactionRepo = createMockTransactionRepo();
    });

    it('should detect discrepancy, update balance, and return reconciliation result', async () => {
      // Given
      const mockAccount = buildMockAccount({ balanceCents: 90000 });
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateBalance).mockResolvedValue(mockAccount);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const result = await reconcileAccount('account-1', mockAccountRepo, mockTransactionRepo);

      // Then
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

    it('should not update balance when cached balance is accurate', async () => {
      // Given
      const mockAccount = buildMockAccount({ balanceCents: 100000 });
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const result = await reconcileAccount('account-1', mockAccountRepo, mockTransactionRepo);

      // Then
      expect(result.success).toBe(true);
      expect(result.discrepancy).toBe(0);
      expect(result.wasUpdated).toBe(false);
      expect(mockAccountRepo.updateBalance).not.toHaveBeenCalled();
    });

    it('should throw when account is not found', async () => {
      // Given
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(null);

      // When / Then
      await expect(
        reconcileAccount('non-existent', mockAccountRepo, mockTransactionRepo)
      ).rejects.toThrow('Account non-existent not found');
    });
  });

  describe('reconcileMultipleAccounts', () => {
    it('should reconcile accounts in parallel and return results', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount();
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const results = await reconcileMultipleAccounts(
        ['account-1', 'account-2'],
        mockAccountRepo,
        mockTransactionRepo
      );

      // Then
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should report failure for accounts that cannot be found', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(null);

      // When
      const results = await reconcileMultipleAccounts(
        ['non-existent'],
        mockAccountRepo,
        mockTransactionRepo
      );

      // Then
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('not found');
    });

    it('should return mixed results when some accounts succeed and some fail', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount();
      vi.mocked(mockAccountRepo.findById)
        .mockResolvedValueOnce(mockAccount)
        .mockResolvedValueOnce(null);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const results = await reconcileMultipleAccounts(
        ['account-1', 'non-existent'],
        mockAccountRepo,
        mockTransactionRepo
      );

      // Then
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toContain('not found');
    });

    it('should handle repository errors gracefully', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      vi.mocked(mockAccountRepo.findById).mockRejectedValue(
        new Error('Database connection failed')
      );

      // When
      const results = await reconcileMultipleAccounts(
        ['account-1'],
        mockAccountRepo,
        mockTransactionRepo
      );

      // Then
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Database connection failed');
    });
  });

  describe('reconcileUserAccounts', () => {
    it('should reconcile all user accounts and return summary', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount();
      vi.mocked(mockAccountRepo.findManyByUserId).mockResolvedValue([mockAccount]);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const result = await reconcileUserAccounts('user-1', mockAccountRepo, mockTransactionRepo);

      // Then
      expect(result.totalAccounts).toBe(1);
      expect(result.reconciledCount).toBe(1);
      expect(result.discrepanciesFound).toBe(0);
    });

    it('should count and total discrepancies when cached balance differs from true balance', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount({ balanceCents: 50000 });
      vi.mocked(mockAccountRepo.findManyByUserId).mockResolvedValue([mockAccount]);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateBalance).mockResolvedValue(mockAccount);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const result = await reconcileUserAccounts('user-1', mockAccountRepo, mockTransactionRepo);

      // Then
      expect(result.totalAccounts).toBe(1);
      expect(result.reconciledCount).toBe(1);
      expect(result.discrepanciesFound).toBe(1);
      expect(result.totalDiscrepancy).toBe(50000);
    });
  });

  describe('getBalanceDiscrepancy', () => {
    it('should throw when account is not found', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(null);

      // When / Then
      await expect(
        getBalanceDiscrepancy('account-not-found', mockAccountRepo, mockTransactionRepo)
      ).rejects.toThrow('Account account-not-found not found');
    });

    it('should return discrepancy details without updating the database', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount({ balanceCents: 90000 });
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);

      // When
      const result = await getBalanceDiscrepancy('account-1', mockAccountRepo, mockTransactionRepo);

      // Then
      expect(result.cachedBalance).toBe(90000);
      expect(result.trueBalance).toBe(100000);
      expect(result.discrepancy).toBe(-10000);
      expect(result.needsReconciliation).toBe(true);
      expect(mockAccountRepo.updateBalance).not.toHaveBeenCalled();
    });

    it('should return needsReconciliation=false when balance is accurate', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount({ balanceCents: 100000 });
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);

      // When
      const result = await getBalanceDiscrepancy('account-1', mockAccountRepo, mockTransactionRepo);

      // Then
      expect(result.needsReconciliation).toBe(false);
      expect(result.discrepancy).toBe(0);
    });
  });

  describe('reconcileActiveAccounts', () => {
    it('should reconcile all accounts with recent activity', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount();
      vi.mocked(mockAccountRepo.findActiveWithRecentActivity).mockResolvedValue([
        { id: 'account-1' } as Account,
      ]);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const result = await reconcileActiveAccounts(mockAccountRepo, mockTransactionRepo);

      // Then
      expect(result.processed).toBe(1);
      expect(result.discrepanciesFound).toBe(0);
      expect(result.criticalAlerts).toBe(0);
    });

    it('should trigger a critical alert when discrepancy exceeds $10', async () => {
      // Given
      const mockAccountRepo = createMockAccountRepo();
      const mockTransactionRepo = createMockTransactionRepo();
      const mockAccount = buildMockAccount({ balanceCents: 50000 });
      vi.mocked(mockAccountRepo.findActiveWithRecentActivity).mockResolvedValue([
        { id: 'account-1' } as Account,
      ]);
      vi.mocked(mockAccountRepo.findById).mockResolvedValue(mockAccount);
      vi.mocked(mockTransactionRepo.findManyByAccountId).mockResolvedValue([
        { amountCents: 100000, type: 'INCOME' as TransactionType } as Transaction,
      ]);
      vi.mocked(mockAccountRepo.updateBalance).mockResolvedValue(mockAccount);
      vi.mocked(mockAccountRepo.updateReconciliation).mockResolvedValue(mockAccount);

      // When
      const result = await reconcileActiveAccounts(mockAccountRepo, mockTransactionRepo);

      // Then
      expect(result.processed).toBe(1);
      expect(result.discrepanciesFound).toBe(1);
      expect(result.criticalAlerts).toBe(1);
    });
  });
});
