import 'server-only';
import type { Transaction, TransactionType, Currency, PrismaClient } from '@prisma/client';
import type { Decimal } from 'decimal.js';
import type { ITransactionRepository } from '../interfaces/ITransactionRepository';

export class PrismaTransactionRepository implements ITransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Transaction | null> {
    return this.prisma.transaction.findUnique({
      where: { id, isActive: true },
    });
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    return this.prisma.transaction.findUnique({
      where: { idempotencyKey: key },
    });
  }

  async findManyByAccountId(accountId: string): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: {
        accountId,
        isActive: true,
      },
      select: {
        amountCents: true,
        type: true,
      },
    });
  }

  async findPairedTransfers(transferId: string): Promise<Transaction[]> {
    return this.prisma.transaction.findMany({
      where: {
        transferId,
        isActive: true,
      },
      orderBy: { amountCents: 'asc' }, // Debit (negative) first
    });
  }

  async create(data: {
    idempotencyKey: string;
    userId: string;
    accountId: string;
    type: TransactionType;
    amountCents: number;
    currency: Currency;
    description?: string;
    date?: Date;
    originalAmountCents?: number;
    originalCurrency?: Currency;
    exchangeRate?: Decimal;
    transferId?: string;
    transferToAccountId?: string;
    transferFromAccountId?: string;
    categoryId?: string;
    ipAddress?: string;
    userAgent?: string;
    createdBy: string;
  }): Promise<Transaction> {
    return this.prisma.transaction.create({
      data: {
        idempotencyKey: data.idempotencyKey,
        userId: data.userId,
        accountId: data.accountId,
        type: data.type,
        amountCents: data.amountCents,
        currency: data.currency,
        description: data.description,
        date: data.date ?? new Date(),
        originalAmountCents: data.originalAmountCents,
        originalCurrency: data.originalCurrency,
        exchangeRate: data.exchangeRate,
        transferId: data.transferId,
        transferToAccountId: data.transferToAccountId,
        transferFromAccountId: data.transferFromAccountId,
        categoryId: data.categoryId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        createdBy: data.createdBy,
        lastModifiedBy: data.createdBy,
      },
    });
  }

  async createMany(
    transactions: Array<{
      idempotencyKey: string;
      userId: string;
      accountId: string;
      type: TransactionType;
      amountCents: number;
      currency: Currency;
      description?: string;
      date?: Date;
      transferId?: string;
      transferToAccountId?: string;
      transferFromAccountId?: string;
      ipAddress?: string;
      userAgent?: string;
      createdBy: string;
    }>
  ): Promise<Transaction[]> {
    const results: Transaction[] = [];

    for (const data of transactions) {
      const tx = await this.prisma.transaction.create({
        data: {
          ...data,
          date: data.date ?? new Date(),
          lastModifiedBy: data.createdBy,
        },
      });
      results.push(tx);
    }

    return results;
  }

  async softDelete(id: string, deletedBy: string): Promise<Transaction> {
    return this.prisma.transaction.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        lastModifiedBy: deletedBy,
      },
    });
  }
}
