import { describe, it, expect } from 'vitest';
import { getAccountRepository, getTransactionRepository, getUserRepository } from '../index';
import { PrismaAccountRepository } from '../prisma/PrismaAccountRepository';
import { PrismaTransactionRepository } from '../prisma/PrismaTransactionRepository';
import { PrismaUserRepository } from '../prisma/PrismaUserRepository';

describe('repositories/index.ts', () => {
  describe('getAccountRepository', () => {
    it('should return a PrismaAccountRepository instance', () => {
      // Given / When
      const repo = getAccountRepository();

      // Then
      expect(repo).toBeInstanceOf(PrismaAccountRepository);
    });

    it('should return the same instance on repeated calls (singleton)', () => {
      // Given / When
      const repo1 = getAccountRepository();
      const repo2 = getAccountRepository();

      // Then
      expect(repo1).toBe(repo2);
    });
  });

  describe('getTransactionRepository', () => {
    it('should return a PrismaTransactionRepository instance', () => {
      // Given / When
      const repo = getTransactionRepository();

      // Then
      expect(repo).toBeInstanceOf(PrismaTransactionRepository);
    });

    it('should return the same instance on repeated calls (singleton)', () => {
      // Given / When
      const repo1 = getTransactionRepository();
      const repo2 = getTransactionRepository();

      // Then
      expect(repo1).toBe(repo2);
    });
  });

  describe('getUserRepository', () => {
    it('should return a PrismaUserRepository instance', () => {
      // Given / When
      const repo = getUserRepository();

      // Then
      expect(repo).toBeInstanceOf(PrismaUserRepository);
    });

    it('should return the same instance on repeated calls (singleton)', () => {
      // Given / When
      const repo1 = getUserRepository();
      const repo2 = getUserRepository();

      // Then
      expect(repo1).toBe(repo2);
    });
  });
});
