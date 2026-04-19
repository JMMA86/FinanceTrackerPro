/**
 * Repository Index Test Suite
 * Tests repository factory functions and singleton pattern
 */

import { describe, it, expect } from 'vitest';
import { getAccountRepository, getTransactionRepository, getUserRepository } from '../index';
import { PrismaAccountRepository } from '../prisma/PrismaAccountRepository';
import { PrismaTransactionRepository } from '../prisma/PrismaTransactionRepository';
import { PrismaUserRepository } from '../prisma/PrismaUserRepository';

describe('repositories/index.ts', () => {
  describe('getAccountRepository', () => {
    it('should return PrismaAccountRepository instance', () => {
      const repo = getAccountRepository();
      expect(repo).toBeInstanceOf(PrismaAccountRepository);
    });

    it('should return same instance on multiple calls (singleton)', () => {
      const repo1 = getAccountRepository();
      const repo2 = getAccountRepository();
      expect(repo1).toBe(repo2);
    });
  });

  describe('getTransactionRepository', () => {
    it('should return PrismaTransactionRepository instance', () => {
      const repo = getTransactionRepository();
      expect(repo).toBeInstanceOf(PrismaTransactionRepository);
    });

    it('should return same instance on multiple calls (singleton)', () => {
      const repo1 = getTransactionRepository();
      const repo2 = getTransactionRepository();
      expect(repo1).toBe(repo2);
    });
  });

  describe('getUserRepository', () => {
    it('should return PrismaUserRepository instance', () => {
      const repo = getUserRepository();
      expect(repo).toBeInstanceOf(PrismaUserRepository);
    });

    it('should return same instance on multiple calls (singleton)', () => {
      const repo1 = getUserRepository();
      const repo2 = getUserRepository();
      expect(repo1).toBe(repo2);
    });
  });
});
