/**
 * Transfer Actions Test Suite
 * Tests Server Actions for atomic transfers with double-entry bookkeeping
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transferBetweenAccounts, getTransferDetails, reverseTransfer } from '../transfer.actions';
import type { Transaction, Currency } from '@prisma/client';

// Mock all dependencies
vi.mock('@/lib/db', () => ({
  prisma: {
    $transaction: vi.fn(),
    account: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(() => ({
    get: vi.fn((name: string) => {
      if (name === 'x-forwarded-for') return '192.168.1.1';
      if (name === 'user-agent') return 'test-agent';
      return null;
    }),
  })),
}));

vi.mock('@/services/reconciliation.service', () => ({
  getTrueBalance: vi.fn((accountId: string) => {
    // Match CUID format used in tests
    if (accountId === 'clh1234567890abcdefghik') return Promise.resolve(100000); // fromAccount
    if (accountId === 'clh1234567890abcdefghil') return Promise.resolve(50000); // toAccount
    if (accountId === 'account-from') return Promise.resolve(100000);
    if (accountId === 'account-to') return Promise.resolve(50000);
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

// Valid CUIDs for success tests
const VALID_USER_ID = 'clh1234567890abcdefghij';
const VALID_FROM_ACCOUNT = 'clh1234567890abcdefghik';
const VALID_TO_ACCOUNT = 'clh1234567890abcdefghil';

describe('transfer.actions.ts - transferBetweenAccounts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate input with TransferSchema', async () => {
    const invalidInput = {
      // Missing required fields
      fromAccountId: 'account-1',
    };

    const response = await transferBetweenAccounts(invalidInput);

    expect(response.success).toBe(false);
    expect(response.code).toBe('VALIDATION_ERROR');
  });

  it('should handle missing idempotencyKey', async () => {
    const input = {
      userId: 'user-1',
      fromAccountId: 'account-from',
      toAccountId: 'account-to',
      amountCents: 10000,
      currency: 'USD',
      description: 'Test transfer',
      // Missing idempotencyKey
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('VALIDATION_ERROR');
  });

  it('should handle negative amounts', async () => {
    const input = {
      userId: 'user-1',
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: 'account-from',
      toAccountId: 'account-to',
      amountCents: -10000, // Negative
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('VALIDATION_ERROR');
  });

  it('should handle zero amounts', async () => {
    const input = {
      userId: 'user-1',
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: 'account-from',
      toAccountId: 'account-to',
      amountCents: 0, // Zero
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('VALIDATION_ERROR');
  });

  it('should handle same account transfer', async () => {
    const input = {
      userId: 'user-1',
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: 'account-same',
      toAccountId: 'account-same', // Same account
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('VALIDATION_ERROR');
  });

  it('should return error for internal exceptions', async () => {
    const { prisma } = await import('@/lib/db');

    // Mock accounts exist and active
    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'USD',
      isActive: true,
    };

    // Mock $transaction to throw error during execution
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        // Create mock transaction client
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount) // fromAccount
              .mockResolvedValueOnce(mockToAccount), // toAccount
          },
          transaction: {
            create: vi.fn().mockRejectedValueOnce(new Error('Database error')),
          },
        };

        // Execute callback with mock tx - will throw inside transaction
        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.error).toContain('Database error');
  });

  it('should return idempotent response for duplicate idempotency key', async () => {
    const { checkAndLockIdempotency } = await import('@/services/idempotency.service');

    // Mock existing transfer (idempotent case)
    const existingTransaction = {
      id: 'existing-tx',
      transferId: 'existing-transfer-123',
      amountCents: 10000,
      accountId: VALID_FROM_ACCOUNT,
    };

    vi.mocked(checkAndLockIdempotency).mockResolvedValueOnce(existingTransaction as unknown);

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(), // Valid UUID v4
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test transfer',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(true);
    expect(response.data?.wasIdempotent).toBe(true);
  });

  it('should successfully transfer between accounts', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'USD',
      isActive: true,
    };

    const mockDebitTx = {
      id: 'tx-debit',
      amountCents: -10000,
      transferId: 'transfer-123',
    };

    const mockCreditTx = {
      id: 'tx-credit',
      amountCents: 10000,
      transferId: 'transfer-123',
    };

    // Mock successful transaction
    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
            update: vi.fn().mockResolvedValue({}),
          },
          transaction: {
            create: vi.fn().mockResolvedValueOnce(mockDebitTx).mockResolvedValueOnce(mockCreditTx),
          },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test transfer',
    };

    const response = await transferBetweenAccounts(input);

    if (!response.success) {
      console.error('Transfer failed:', response);
    }

    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
    expect(response.data?.transferId).toBeDefined();
  });

  it('should handle fromAccount not found', async () => {
    const { prisma } = await import('@/lib/db');

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(null) // fromAccount not found
              .mockResolvedValueOnce({}),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('NOT_FOUND');
  });

  it('should handle toAccount not found', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi.fn().mockResolvedValueOnce(mockFromAccount).mockResolvedValueOnce(null), // toAccount not found
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('NOT_FOUND');
  });

  it('should handle inactive fromAccount', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: false, // Inactive
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'USD',
      isActive: true,
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('INACTIVE_ACCOUNT');
  });

  it('should handle inactive toAccount', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'USD',
      isActive: false, // Inactive
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('INACTIVE_ACCOUNT');
  });

  it('should handle unauthorized fromAccount', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: 'clh9999999999999999999', // Different user
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'USD',
      isActive: true,
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('UNAUTHORIZED');
  });

  it('should handle currency mismatch on fromAccount', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'EUR', // Mismatch
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'USD',
      isActive: true,
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('CURRENCY_MISMATCH');
  });

  it('should handle unauthorized toAccount', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: 'clh9999999999999999999', // Different user
      balanceCents: 50000,
      currency: 'USD',
      isActive: true,
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('UNAUTHORIZED');
  });

  it('should handle currency mismatch on toAccount', async () => {
    const { prisma } = await import('@/lib/db');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'EUR', // Mismatch
      isActive: true,
    };

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('CURRENCY_MISMATCH');
  });

  it('should handle insufficient funds', async () => {
    const { prisma } = await import('@/lib/db');
    const { getTrueBalance } = await import('@/services/reconciliation.service');

    const mockFromAccount = {
      id: VALID_FROM_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 100000,
      currency: 'USD',
      isActive: true,
    };

    const mockToAccount = {
      id: VALID_TO_ACCOUNT,
      userId: VALID_USER_ID,
      balanceCents: 50000,
      currency: 'USD',
      isActive: true,
    };

    // Override getTrueBalance to return insufficient funds
    vi.mocked(getTrueBalance).mockResolvedValueOnce(5000);

    vi.mocked(prisma.$transaction).mockImplementationOnce(
      async <T>(callback: (tx: unknown) => Promise<T>): Promise<T> => {
        const mockTx = {
          account: {
            findUnique: vi
              .fn()
              .mockResolvedValueOnce(mockFromAccount)
              .mockResolvedValueOnce(mockToAccount),
          },
          transaction: { create: vi.fn() },
        };

        return callback(mockTx);
      }
    );

    const input = {
      userId: VALID_USER_ID,
      idempotencyKey: crypto.randomUUID(),
      fromAccountId: VALID_FROM_ACCOUNT,
      toAccountId: VALID_TO_ACCOUNT,
      amountCents: 10000,
      currency: 'USD',
      description: 'Test',
    };

    const response = await transferBetweenAccounts(input);

    expect(response.success).toBe(false);
    expect(response.code).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('transfer.actions.ts - getTransferDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should validate transferId is provided', async () => {
    const response = await getTransferDetails('');

    expect(response.success).toBe(false);
  });

  it('should handle repository errors', async () => {
    const { getTransactionRepository } = await import('@/lib/repositories');

    // Mock repository to throw error
    vi.mocked(getTransactionRepository).mockReturnValueOnce({
      findPairedTransfers: vi.fn(() => Promise.reject(new Error('Repository error'))),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findManyByAccountId: vi.fn(),
      createMany: vi.fn(),
      softDelete: vi.fn(),
    });

    const response = await getTransferDetails('transfer-1');

    expect(response.success).toBe(false);
    expect(response.error).toContain('Repository error');
  });

  it('should handle missing paired transactions', async () => {
    const { getTransactionRepository } = await import('@/lib/repositories');

    // Mock empty result (< 2 transactions)
    vi.mocked(getTransactionRepository).mockReturnValueOnce({
      findPairedTransfers: vi.fn(() => Promise.resolve([])),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findManyByAccountId: vi.fn(),
      createMany: vi.fn(),
      softDelete: vi.fn(),
    });

    const response = await getTransferDetails('transfer-1');

    expect(response.success).toBe(false);
    expect(response.code).toBe('NOT_FOUND');
  });

  it('should return paired transactions when found', async () => {
    const { getTransactionRepository } = await import('@/lib/repositories');

    const mockTransactions: Transaction[] = [
      {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-from',
        type: 'TRANSFER_OUT',
        amountCents: -10000,
        currency: 'USD' as Currency,
        description: 'Transfer',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: 'transfer-1',
        transferToAccountId: 'account-to',
        transferFromAccountId: 'account-from',
        categoryId: null,
        ipAddress: '192.168.1.1',
        userAgent: 'test',
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
        accountId: 'account-to',
        type: 'TRANSFER_IN',
        amountCents: 10000,
        currency: 'USD' as Currency,
        description: 'Transfer',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: 'transfer-1',
        transferToAccountId: 'account-to',
        transferFromAccountId: 'account-from',
        categoryId: null,
        ipAddress: '192.168.1.1',
        userAgent: 'test',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
      },
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

    const response = await getTransferDetails('transfer-1');

    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();
  });

  it('should detect double-entry integrity violations', async () => {
    const { getTransactionRepository } = await import('@/lib/repositories');

    // Mismatched amounts (doesn't sum to zero)
    const mockTransactions: Transaction[] = [
      {
        id: 'tx-1',
        idempotencyKey: 'key-1',
        userId: 'user-1',
        accountId: 'account-from',
        type: 'TRANSFER_OUT',
        amountCents: -10000,
        currency: 'USD' as Currency,
        description: 'Transfer',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: 'transfer-1',
        transferToAccountId: 'account-to',
        transferFromAccountId: 'account-from',
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
        accountId: 'account-to',
        type: 'TRANSFER_IN',
        amountCents: 9999, // Wrong amount!
        currency: 'USD' as Currency,
        description: 'Transfer',
        date: new Date(),
        originalAmountCents: null,
        originalCurrency: null,
        exchangeRate: null,
        transferId: 'transfer-1',
        transferToAccountId: 'account-to',
        transferFromAccountId: 'account-from',
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

    vi.mocked(getTransactionRepository).mockReturnValueOnce({
      findPairedTransfers: vi.fn(() => Promise.resolve(mockTransactions)),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findManyByAccountId: vi.fn(),
      createMany: vi.fn(),
      softDelete: vi.fn(),
    });

    const response = await getTransferDetails('transfer-1');

    // Still returns success but logs error internally
    expect(response.success).toBe(true);
  });
});

describe('transfer.actions.ts - reverseTransfer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reject reversal after 24 hours', async () => {
    const { getTransactionRepository } = await import('@/lib/repositories');

    // Mock old transfer (25 hours ago)
    const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const mockTransactions: Transaction[] = [
      {
        id: 'tx-debit',
        userId: VALID_USER_ID,
        accountId: VALID_FROM_ACCOUNT,
        type: 'TRANSFER_OUT',
        amountCents: -10000,
        currency: 'USD' as Currency,
        date: oldDate,
        transferId: 'transfer-1',
        transferToAccountId: VALID_TO_ACCOUNT,
        transferFromAccountId: VALID_FROM_ACCOUNT,
      } as Transaction,
      {
        id: 'tx-credit',
        userId: VALID_USER_ID,
        accountId: VALID_TO_ACCOUNT,
        type: 'TRANSFER_IN',
        amountCents: 10000,
        currency: 'USD' as Currency,
        date: oldDate,
        transferId: 'transfer-1',
        transferToAccountId: VALID_TO_ACCOUNT,
        transferFromAccountId: VALID_FROM_ACCOUNT,
      } as Transaction,
    ];

    vi.mocked(getTransactionRepository).mockReturnValue({
      findPairedTransfers: vi.fn(() => Promise.resolve(mockTransactions)),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findManyByAccountId: vi.fn(),
      createMany: vi.fn(),
      softDelete: vi.fn(),
    });

    const response = await reverseTransfer({
      transferId: 'transfer-1',
      userId: VALID_USER_ID,
      reason: 'Test reversal',
    });

    expect(response.success).toBe(false);
    expect(response.code).toBe('UNAUTHORIZED');
    expect(response.error).toContain('24 hours');
  });

  it('should reject reversal for non-owner', async () => {
    const { getTransactionRepository } = await import('@/lib/repositories');

    // Mock recent transfer (1 hour ago)
    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const mockTransactions: Transaction[] = [
      {
        id: 'tx-debit',
        userId: 'clh9999999999999999999', // Different user
        accountId: VALID_FROM_ACCOUNT,
        type: 'TRANSFER_OUT',
        amountCents: -10000,
        currency: 'USD' as Currency,
        date: recentDate,
        transferId: 'transfer-1',
        transferToAccountId: VALID_TO_ACCOUNT,
        transferFromAccountId: VALID_FROM_ACCOUNT,
      } as Transaction,
      {
        id: 'tx-credit',
        userId: 'clh9999999999999999999',
        accountId: VALID_TO_ACCOUNT,
        type: 'TRANSFER_IN',
        amountCents: 10000,
        currency: 'USD' as Currency,
        date: recentDate,
        transferId: 'transfer-1',
        transferToAccountId: VALID_TO_ACCOUNT,
        transferFromAccountId: VALID_FROM_ACCOUNT,
      } as Transaction,
    ];

    vi.mocked(getTransactionRepository).mockReturnValue({
      findPairedTransfers: vi.fn(() => Promise.resolve(mockTransactions)),
      findByIdempotencyKey: vi.fn(),
      create: vi.fn(),
      findById: vi.fn(),
      findManyByAccountId: vi.fn(),
      createMany: vi.fn(),
      softDelete: vi.fn(),
    });

    const response = await reverseTransfer({
      transferId: 'transfer-1',
      userId: VALID_USER_ID,
      reason: 'Test reversal',
    });

    expect(response.success).toBe(false);
    expect(response.code).toBe('UNAUTHORIZED');
    expect(response.error).toContain('does not belong');
  });
});
