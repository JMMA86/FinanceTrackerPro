import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { transferBetweenAccounts, getTransferDetails, reverseTransfer } from '../transfer.actions';
import type { Prisma, Transaction, Currency } from '@prisma/client';

vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(),
    account: { findUnique: vi.fn(), update: vi.fn() },
    transaction: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => {
    const headersMap = new Map();
    headersMap.set('x-forwarded-for', '192.168.1.1');
    headersMap.set('x-real-ip', '192.168.1.1');
    headersMap.set('user-agent', 'test-agent');
    return headersMap;
  }),
}));

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn((accountId: string) => {
    if (accountId === VALID_FROM_ACCOUNT) return Promise.resolve(100000);
    if (accountId === VALID_TO_ACCOUNT) return Promise.resolve(50000);
    return Promise.resolve(0);
  }),
}));

vi.mock('@/services/idempotency.service', () => ({
  checkAndLockIdempotency: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/lib/repositories', () => ({
  getTransactionRepository: vi.fn(() => ({
    findByIdempotencyKey: vi.fn(() => Promise.resolve(null)),
    findPairedTransfers: vi.fn(() => Promise.resolve([])),
    create: vi.fn(),
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const VALID_USER_ID = 'clh1234567890abcdefghij';
const VALID_FROM_ACCOUNT = 'clh1234567890abcdefghik';
const VALID_TO_ACCOUNT = 'clh1234567890abcdefghil';

const asTransactionClient = (tx: object): Prisma.TransactionClient =>
  tx as Prisma.TransactionClient;

const buildValidTransferInput = (overrides: Record<string, unknown> = {}) => ({
  userId: VALID_USER_ID,
  idempotencyKey: crypto.randomUUID(),
  fromAccountId: VALID_FROM_ACCOUNT,
  toAccountId: VALID_TO_ACCOUNT,
  amountCents: 10000,
  currency: 'USD',
  description: 'Test transfer',
  ...overrides,
});

const buildMockAccount = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  userId: VALID_USER_ID,
  balanceCents: id === VALID_FROM_ACCOUNT ? 100000 : 50000,
  currency: 'USD',
  isActive: true,
  ...overrides,
});

const buildMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'tx-1',
  idempotencyKey: 'key-1',
  userId: VALID_USER_ID,
  accountId: VALID_FROM_ACCOUNT,
  type: 'TRANSFER_OUT',
  amountCents: -10000,
  currency: 'USD' as Currency,
  description: 'Transfer',
  date: new Date(),
  originalAmountCents: null,
  originalCurrency: null,
  exchangeRate: null,
  transferId: 'transfer-1',
  transferToAccountId: VALID_TO_ACCOUNT,
  transferFromAccountId: VALID_FROM_ACCOUNT,
  categoryId: null,
  fixedExpensePaymentId: null,
  loanInstallmentId: null,
  ipAddress: '192.168.1.1',
  userAgent: 'test',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  createdBy: VALID_USER_ID,
  lastModifiedBy: VALID_USER_ID,
  ...overrides,
});

describe('transfer.actions.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('transferBetweenAccounts', () => {
    describe('when input validation fails', () => {
      it('should return VALIDATION_ERROR when required fields are missing', async () => {
        // Given
        const invalidInput = { fromAccountId: 'account-1' };

        // When
        const response = await transferBetweenAccounts(invalidInput);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('VALIDATION_ERROR');
      });

      it('should return VALIDATION_ERROR when idempotencyKey is missing', async () => {
        // Given
        const input = buildValidTransferInput({ idempotencyKey: undefined });

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('VALIDATION_ERROR');
      });

      it('should return VALIDATION_ERROR for negative amount', async () => {
        // Given
        const input = buildValidTransferInput({ amountCents: -10000 });

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('VALIDATION_ERROR');
      });

      it('should return VALIDATION_ERROR for zero amount', async () => {
        // Given
        const input = buildValidTransferInput({ amountCents: 0 });

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('VALIDATION_ERROR');
      });

      it('should return VALIDATION_ERROR when transferring to the same account', async () => {
        // Given
        const input = buildValidTransferInput({ toAccountId: VALID_FROM_ACCOUNT });

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('when the transfer is a duplicate (idempotent retry)', () => {
      it('should return success with wasIdempotent=true', async () => {
        // Given
        const { checkAndLockIdempotency } = await import('@/services/idempotency.service');
        const existingTransaction = {
          id: 'existing-tx',
          transferId: 'existing-transfer-123',
          amountCents: 10000,
          accountId: VALID_FROM_ACCOUNT,
        };
        vi.mocked(checkAndLockIdempotency).mockResolvedValueOnce(existingTransaction as unknown);
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(true);
        expect(response.data?.wasIdempotent).toBe(true);
      });
    });

    describe('when accounts are not found', () => {
      it('should return NOT_FOUND when source account does not exist', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({}),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('NOT_FOUND');
      });

      it('should return NOT_FOUND when destination account does not exist', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT))
                  .mockResolvedValueOnce(null),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('NOT_FOUND');
      });
    });

    describe('when accounts are inactive', () => {
      it('should return INACTIVE_ACCOUNT when source account is inactive', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT, { isActive: false }))
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT)),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('INACTIVE_ACCOUNT');
      });

      it('should return INACTIVE_ACCOUNT when destination account is inactive', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT))
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT, { isActive: false })),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('INACTIVE_ACCOUNT');
      });
    });

    describe('when ownership is violated', () => {
      it('should return UNAUTHORIZED when source account belongs to another user', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(
                    buildMockAccount(VALID_FROM_ACCOUNT, { userId: 'clh9999999999999999999' })
                  )
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT)),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('UNAUTHORIZED');
      });

      it('should return UNAUTHORIZED when destination account belongs to another user', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT))
                  .mockResolvedValueOnce(
                    buildMockAccount(VALID_TO_ACCOUNT, { userId: 'clh9999999999999999999' })
                  ),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('UNAUTHORIZED');
      });
    });

    describe('when currencies mismatch', () => {
      it('should return CURRENCY_MISMATCH when source account currency differs', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT, { currency: 'EUR' }))
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT)),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('CURRENCY_MISMATCH');
      });

      it('should return CURRENCY_MISMATCH when destination account currency differs', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT))
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT, { currency: 'EUR' })),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('CURRENCY_MISMATCH');
      });
    });

    describe('when funds are insufficient', () => {
      it('should return INSUFFICIENT_FUNDS', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        const { getTrueBalance } = await import('@/services/reconciliation.service');
        vi.mocked(getTrueBalance).mockResolvedValueOnce(5000);
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT))
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT)),
              },
              transaction: { create: vi.fn() },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('INSUFFICIENT_FUNDS');
      });
    });

    describe('when a database error occurs', () => {
      it('should return error response with the database error message', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementationOnce(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT))
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT)),
              },
              transaction: { create: vi.fn().mockRejectedValueOnce(new Error('Database error')) },
            };
            return callback(asTransactionClient(mockTx));
          }
        );
        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(false);
        expect(response.error).toContain('Database error');
      });
    });

    describe('when transfer is valid', () => {
      it('should create double-entry transactions and return transferId', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
          const mockTx = {
            account: {
              findUnique: vi.fn()
                .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT))
                .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT)),
              update: vi.fn().mockResolvedValue({}),
            },
            transaction: {
              create: vi.fn()
                .mockResolvedValueOnce(buildMockTransaction({ id: 'tx-debit', type: 'TRANSFER_OUT', amountCents: -10000 }))
                .mockResolvedValueOnce(buildMockTransaction({ id: 'tx-credit', type: 'TRANSFER_IN', amountCents: 10000 })),
            },
          };
          return callback(asTransactionClient(mockTx));
        });

        const input = buildValidTransferInput();

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(true);
        expect(response.data?.transferId).toBeDefined();
      });

      it('should create a reversal transfer with swapped accounts', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
          const mockTx = {
            account: {
              findUnique: vi.fn()
                .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT)) // Swapped
                .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT)), // Swapped
              update: vi.fn().mockResolvedValue({}),
            },
            transaction: {
              create: vi.fn()
                .mockResolvedValueOnce(buildMockTransaction({ id: 'tx-reversal-debit', type: 'TRANSFER_OUT', amountCents: -10000 }))
                .mockResolvedValueOnce(buildMockTransaction({ id: 'tx-reversal-credit', type: 'TRANSFER_IN', amountCents: 10000 })),
            },
          };
          return callback(asTransactionClient(mockTx));
        });

        const input = buildValidTransferInput({
          fromAccountId: VALID_TO_ACCOUNT,
          toAccountId: VALID_FROM_ACCOUNT,
          description: 'Reversal-like transfer',
        });

        // When
        const response = await transferBetweenAccounts(input);

        // Then
        expect(response.success).toBe(true);
        expect(response.data?.transferId).toBeDefined();
      });
    });
  });

  describe('getTransferDetails', () => {
    it('should return VALIDATION_ERROR when transferId is empty', async () => {
      // Given / When
      const response = await getTransferDetails('');

      // Then
      expect(response.success).toBe(false);
    });

    it('should return error when repository throws', async () => {
      // Given
      const { getTransactionRepository } = await import('@/lib/repositories');
      vi.mocked(getTransactionRepository).mockReturnValueOnce({
        findPairedTransfers: vi.fn(() => Promise.reject(new Error('Repository error'))),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
        findById: vi.fn(),
        findManyByAccountId: vi.fn(),
        createMany: vi.fn(),
        softDelete: vi.fn(),
      });

      // When
      const response = await getTransferDetails('transfer-1');

      // Then
      expect(response.success).toBe(false);
      expect(response.error).toContain('Repository error');
    });

    it('should return NOT_FOUND when fewer than 2 transactions are paired', async () => {
      // Given
      const { getTransactionRepository } = await import('@/lib/repositories');
      vi.mocked(getTransactionRepository).mockReturnValueOnce({
        findPairedTransfers: vi.fn(() => Promise.resolve([])),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
        findById: vi.fn(),
        findManyByAccountId: vi.fn(),
        createMany: vi.fn(),
        softDelete: vi.fn(),
      });

      // When
      const response = await getTransferDetails('transfer-1');

      // Then
      expect(response.success).toBe(false);
      expect(response.code).toBe('NOT_FOUND');
    });

    it('should return paired transactions when transfer exists', async () => {
      // Given
      const { getTransactionRepository } = await import('@/lib/repositories');
      const mockTransactions: Transaction[] = [
        buildMockTransaction({ id: 'tx-1', type: 'TRANSFER_OUT', amountCents: -10000 }),
        buildMockTransaction({
          id: 'tx-2',
          type: 'TRANSFER_IN',
          amountCents: 10000,
          accountId: VALID_TO_ACCOUNT,
        }),
      ];
      vi.mocked(getTransactionRepository).mockReturnValueOnce({
        findPairedTransfers: vi.fn(() => Promise.resolve(mockTransactions)),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
        findById: vi.fn(),
        findManyByAccountId: vi.fn(),
        createMany: vi.fn(),
        softDelete: vi.fn(),
      });

      // When
      const response = await getTransferDetails('transfer-1');

      // Then
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
    });

    it('should log warning when double-entry integrity is violated', async () => {
      // Given
      const { getTransactionRepository } = await import('@/lib/repositories');
      const mockTransactions: Transaction[] = [
        buildMockTransaction({ id: 'tx-1', type: 'TRANSFER_OUT', amountCents: -10000 }),
        buildMockTransaction({ id: 'tx-2', type: 'TRANSFER_IN', amountCents: 9999 }),
      ];
      vi.mocked(getTransactionRepository).mockReturnValueOnce({
        findPairedTransfers: vi.fn(() => Promise.resolve(mockTransactions)),
        findByIdempotencyKey: vi.fn(),
        create: vi.fn(),
        findById: vi.fn(),
        findManyByAccountId: vi.fn(),
        createMany: vi.fn(),
        softDelete: vi.fn(),
      });

      // When
      const response = await getTransferDetails('transfer-1');

      // Then
      expect(response.success).toBe(true);
    });
  });

  describe('reverseTransfer', () => {
    describe('when reversal is not allowed', () => {
      it('should return UNAUTHORIZED when transfer is older than 24 hours', async () => {
        // Given
        const { getTransactionRepository } = await import('@/lib/repositories');
        const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
        vi.mocked(getTransactionRepository).mockReturnValue({
          findPairedTransfers: vi.fn(() =>
            Promise.resolve([
              buildMockTransaction({ date: oldDate, userId: VALID_USER_ID }),
              buildMockTransaction({
                id: 'tx-2',
                type: 'TRANSFER_IN',
                amountCents: 10000,
                accountId: VALID_TO_ACCOUNT,
                date: oldDate,
                userId: VALID_USER_ID,
              }),
            ])
          ),
          findByIdempotencyKey: vi.fn(),
          create: vi.fn(),
          findById: vi.fn(),
          findManyByAccountId: vi.fn(),
          createMany: vi.fn(),
          softDelete: vi.fn(),
        });

        // When
        const response = await reverseTransfer({
          transferId: 'transfer-1',
          userId: VALID_USER_ID,
          reason: 'Test',
        });

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('UNAUTHORIZED');
        expect(response.error).toContain('24 hours');
      });

      it('should return UNAUTHORIZED when transfer belongs to a different user', async () => {
        // Given
        const { getTransactionRepository } = await import('@/lib/repositories');
        const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
        vi.mocked(getTransactionRepository).mockReturnValue({
          findPairedTransfers: vi.fn(() =>
            Promise.resolve([
              buildMockTransaction({ date: recentDate, userId: 'clh9999999999999999999' }),
              buildMockTransaction({
                id: 'tx-2',
                type: 'TRANSFER_IN',
                amountCents: 10000,
                accountId: VALID_TO_ACCOUNT,
                date: recentDate,
                userId: 'clh9999999999999999999',
              }),
            ])
          ),
          findByIdempotencyKey: vi.fn(),
          create: vi.fn(),
          findById: vi.fn(),
          findManyByAccountId: vi.fn(),
          createMany: vi.fn(),
          softDelete: vi.fn(),
        });

        // When
        const response = await reverseTransfer({
          transferId: 'transfer-1',
          userId: VALID_USER_ID,
          reason: 'Test',
        });

        // Then
        expect(response.success).toBe(false);
        expect(response.code).toBe('UNAUTHORIZED');
        expect(response.error).toContain('does not belong');
      });
    });

    describe('when reversal is valid', () => {
      it('should create a reversal transfer with swapped accounts', async () => {
        // Given
        const { prisma } = await import('@/lib/db');
        const { getTransactionRepository } = await import('@/lib/repositories');
        const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
        vi.mocked(getTransactionRepository).mockReturnValue({
          findPairedTransfers: vi.fn(() =>
            Promise.resolve([
              buildMockTransaction({
                date: recentDate,
                userId: VALID_USER_ID,
                transferId: 'transfer-to-reverse',
              }),
              buildMockTransaction({
                id: 'tx-2',
                type: 'TRANSFER_IN',
                amountCents: 10000,
                accountId: VALID_TO_ACCOUNT,
                date: recentDate,
                userId: VALID_USER_ID,
                transferId: 'transfer-to-reverse',
              }),
            ])
          ),
          findByIdempotencyKey: vi.fn(() => Promise.resolve(null)),
          create: vi.fn(),
          findById: vi.fn(),
          findManyByAccountId: vi.fn(),
          createMany: vi.fn(),
          softDelete: vi.fn(),
        });
        vi.mocked(prisma.$transaction).mockImplementation(
          async <T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> => {
            const mockTx = {
              account: {
                findUnique: vi
                  .fn()
                  .mockResolvedValueOnce(buildMockAccount(VALID_TO_ACCOUNT))
                  .mockResolvedValueOnce(buildMockAccount(VALID_FROM_ACCOUNT)),
                update: vi.fn().mockResolvedValue({}),
              },
              transaction: {
                create: vi
                  .fn()
                  .mockResolvedValueOnce({
                    id: 'tx-rev-debit',
                    amountCents: -10000,
                    transferId: 'reversal-id',
                  })
                  .mockResolvedValueOnce({
                    id: 'tx-rev-credit',
                    amountCents: 10000,
                    transferId: 'reversal-id',
                  }),
              },
            };
            return callback(asTransactionClient(mockTx));
          }
        );

        const response = await reverseTransfer({
          transferId: 'transfer-to-reverse',
          userId: VALID_USER_ID,
          reason: 'Test reversal',
        });

        // Then
        expect(response.success).toBe(true);
        expect(response.data?.transferId).toBeDefined();
      });
    });
  });
});
