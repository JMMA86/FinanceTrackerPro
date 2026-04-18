import 'server-only';
import type { Account, AccountType, Currency, PrismaClient } from '@prisma/client';
import type { IAccountRepository } from '../interfaces/IAccountRepository';

export class PrismaAccountRepository implements IAccountRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Account | null> {
    return this.prisma.account.findUnique({
      where: { id, isActive: true },
    });
  }

  async findManyByUserId(userId: string): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveWithRecentActivity(since: Date): Promise<Account[]> {
    return this.prisma.account.findMany({
      where: {
        isActive: true,
        transactions: {
          some: {
            createdAt: { gte: since },
          },
        },
      },
      select: { id: true } as any, // Cast needed for select typing
    }) as Promise<Account[]>;
  }

  async updateBalance(id: string, balanceCents: number, lastModifiedBy: string): Promise<Account> {
    return this.prisma.account.update({
      where: { id },
      data: {
        balanceCents,
        lastModifiedBy,
        updatedAt: new Date(),
      },
    });
  }

  async updateReconciliation(id: string, lastReconciled: Date): Promise<Account> {
    return this.prisma.account.update({
      where: { id },
      data: {
        lastReconciled,
        updatedAt: new Date(),
      },
    });
  }

  async create(data: {
    userId: string;
    name: string;
    type: AccountType;
    currency: Currency;
    balanceCents?: number;
    interestRateEA?: number;
    creditLimitCents?: number;
    cutoffDay?: number;
    paymentDueDay?: number;
    parentAccountId?: string;
    createdBy: string;
  }): Promise<Account> {
    return this.prisma.account.create({
      data: {
        userId: data.userId,
        name: data.name,
        type: data.type,
        currency: data.currency,
        balanceCents: data.balanceCents ?? 0,
        interestRateEA: data.interestRateEA,
        creditLimitCents: data.creditLimitCents,
        cutoffDay: data.cutoffDay,
        paymentDueDay: data.paymentDueDay,
        parentAccountId: data.parentAccountId,
        createdBy: data.createdBy,
        lastModifiedBy: data.createdBy,
      },
    });
  }

  async softDelete(id: string, deletedBy: string): Promise<Account> {
    return this.prisma.account.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        lastModifiedBy: deletedBy,
      },
    });
  }
}
