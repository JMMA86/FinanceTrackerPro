/**
 * Auth Validation Test Suite
 * Tests RegisterSchema and LoginSchema validation rules
 */

import { describe, it, expect } from 'vitest';
import { RegisterSchema, LoginSchema } from '../auth';

describe('Auth Validation Schemas', () => {
  describe('RegisterSchema', () => {
    it('accepts valid registration data', () => {
      const valid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePass123',
      };

      const result = RegisterSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('normalizes email to lowercase', () => {
      const input = {
        email: 'TEST@EXAMPLE.COM',
        name: 'Test User',
        password: 'SecurePass123',
      };

      const result = RegisterSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('rejects invalid email format', () => {
      const invalid = {
        email: 'not-an-email',
        name: 'Test User',
        password: 'SecurePass123',
      };

      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects short name', () => {
      const invalid = {
        email: 'test@example.com',
        name: 'A',
        password: 'SecurePass123',
      };

      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });

    it('rejects long name', () => {
      const invalid = {
        email: 'test@example.com',
        name: 'A'.repeat(101),
        password: 'SecurePass123',
      };

      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('too long');
      }
    });

    it('rejects short password', () => {
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Short1',
      };

      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 8 characters');
      }
    });

    it('rejects password without uppercase', () => {
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'lowercase123',
      };

      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('uppercase');
      }
    });

    it('rejects password without lowercase', () => {
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'UPPERCASE123',
      };

      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('lowercase');
      }
    });

    it('rejects password without number', () => {
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'NoNumbersHere',
      };

      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('number');
      }
    });

    it('accepts password with special characters', () => {
      const valid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Secure@Pass123!',
      };

      const result = RegisterSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });

  describe('LoginSchema', () => {
    it('accepts valid login data', () => {
      const valid = {
        email: 'test@example.com',
        password: 'any-password',
      };

      const result = LoginSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('normalizes email to lowercase', () => {
      const input = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password',
      };

      const result = LoginSchema.safeParse(input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('rejects invalid email format', () => {
      const invalid = {
        email: 'not-an-email',
        password: 'password',
      };

      const result = LoginSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('rejects empty password', () => {
      const invalid = {
        email: 'test@example.com',
        password: '',
      };

      const result = LoginSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('required');
      }
    });

    it('accepts any non-empty password', () => {
      const valid = {
        email: 'test@example.com',
        password: 'x',
      };

      const result = LoginSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });
  });
});
