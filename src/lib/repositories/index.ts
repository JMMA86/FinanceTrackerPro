/**
 * Repository Factory
 * Creates repository instances with Prisma client injection
 */

import { prisma } from '@/lib/db';
import { PrismaAccountRepository } from './prisma/PrismaAccountRepository';
import { PrismaTransactionRepository } from './prisma/PrismaTransactionRepository';
import { PrismaUserRepository } from './prisma/PrismaUserRepository';

// Singleton instances
let accountRepository: PrismaAccountRepository;
let transactionRepository: PrismaTransactionRepository;
let userRepository: PrismaUserRepository;

export function getAccountRepository(): PrismaAccountRepository {
  if (!accountRepository) {
    accountRepository = new PrismaAccountRepository(prisma);
  }
  return accountRepository;
}

export function getTransactionRepository(): PrismaTransactionRepository {
  if (!transactionRepository) {
    transactionRepository = new PrismaTransactionRepository(prisma);
  }
  return transactionRepository;
}

export function getUserRepository(): PrismaUserRepository {
  if (!userRepository) {
    userRepository = new PrismaUserRepository();
  }
  return userRepository;
}

// Export interfaces for DI
export type { IAccountRepository } from './interfaces/IAccountRepository';
export type { ITransactionRepository } from './interfaces/ITransactionRepository';
export type { IUserRepository } from './interfaces/IUserRepository';
