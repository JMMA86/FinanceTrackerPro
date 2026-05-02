import { describe, it, expect } from 'vitest';
import { RegisterSchema, LoginSchema } from '../auth';

describe('auth validation schemas', () => {
  describe('RegisterSchema', () => {
    it('should accept valid registration data', () => {
      // Given
      const valid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'SecurePass123',
      };

      // When
      const result = RegisterSchema.safeParse(valid);

      // Then
      expect(result.success).toBe(true);
    });

    it('should normalize email to lowercase', () => {
      // Given
      const input = {
        email: 'TEST@EXAMPLE.COM',
        name: 'Test User',
        password: 'SecurePass123',
      };

      // When
      const result = RegisterSchema.safeParse(input);

      // Then
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should reject invalid email format', () => {
      // Given
      const invalid = {
        email: 'not-an-email',
        name: 'Test User',
        password: 'SecurePass123',
      };

      // When
      const result = RegisterSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
    });

    it('should reject name shorter than 2 characters', () => {
      // Given
      const invalid = {
        email: 'test@example.com',
        name: 'A',
        password: 'SecurePass123',
      };

      // When
      const result = RegisterSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 2 characters');
      }
    });

    it('should reject name longer than 100 characters', () => {
      // Given
      const invalid = {
        email: 'test@example.com',
        name: 'A'.repeat(101),
        password: 'SecurePass123',
      };

      // When
      const result = RegisterSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('too long');
      }
    });

    it('should reject password shorter than 8 characters', () => {
      // Given
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Short1',
      };

      // When
      const result = RegisterSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('at least 8 characters');
      }
    });

    it('should reject password without uppercase letter', () => {
      // Given
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'lowercase123',
      };

      // When
      const result = RegisterSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('uppercase');
      }
    });

    it('should reject password without lowercase letter', () => {
      // Given
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'UPPERCASE123',
      };

      // When
      const result = RegisterSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('lowercase');
      }
    });

    it('should reject password without a number', () => {
      // Given
      const invalid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'NoNumbersHere',
      };

      // When
      const result = RegisterSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('number');
      }
    });

    it('should accept password with special characters', () => {
      // Given
      const valid = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'Secure@Pass123!',
      };

      // When
      const result = RegisterSchema.safeParse(valid);

      // Then
      expect(result.success).toBe(true);
    });
  });

  describe('LoginSchema', () => {
    it('should accept valid login data', () => {
      // Given
      const valid = {
        email: 'test@example.com',
        password: 'any-password',
      };

      // When
      const result = LoginSchema.safeParse(valid);

      // Then
      expect(result.success).toBe(true);
    });

    it('should normalize email to lowercase', () => {
      // Given
      const input = {
        email: 'TEST@EXAMPLE.COM',
        password: 'password',
      };

      // When
      const result = LoginSchema.safeParse(input);

      // Then
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('test@example.com');
      }
    });

    it('should reject invalid email format', () => {
      // Given
      const invalid = {
        email: 'not-an-email',
        password: 'password',
      };

      // When
      const result = LoginSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
    });

    it('should reject empty password', () => {
      // Given
      const invalid = {
        email: 'test@example.com',
        password: '',
      };

      // When
      const result = LoginSchema.safeParse(invalid);

      // Then
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('required');
      }
    });

    it('should accept any non-empty password', () => {
      // Given
      const valid = {
        email: 'test@example.com',
        password: 'x',
      };

      // When
      const result = LoginSchema.safeParse(valid);

      // Then
      expect(result.success).toBe(true);
    });
  });
});
