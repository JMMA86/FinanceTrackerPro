/**
 * Repository Index Test Suite
 * Tests repository factory functions
 */

import { describe, it, expect } from 'vitest';
import { getAccountRepository, getTransactionRepository } from '../index';
import { PrismaAccountRepository } from '../prisma/PrismaAccountRepository';
import { PrismaTransactionRepository } from '../prisma/PrismaTransactionRepository';

describe('repositories/index.ts', () => {
  describe('getAccountRepository', () => {
    it('should return PrismaAccountRepository instance', () => {
      const repo = getAccountRepository();
      expect(repo).toBeInstanceOf(PrismaAccountRepository);
    });
  });

  describe('getTransactionRepository', () => {
    it('should return PrismaTransactionRepository instance', () => {
      const repo = getTransactionRepository();
      expect(repo).toBeInstanceOf(PrismaTransactionRepository);
    });
  });
});
