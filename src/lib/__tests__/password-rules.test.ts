/**
 * Password Rules Unit Tests
 * Single source of truth for password strength requirements (F3 + A9).
 */
import { describe, it, expect } from 'vitest';
import { PASSWORD_RULES, MIN_PASSWORD_LENGTH, isPasswordValid } from '../password-rules';

describe('password-rules', () => {
  it('exposes MIN_PASSWORD_LENGTH = 12', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });

  it('exposes the 4 expected rule ids in order', () => {
    expect(PASSWORD_RULES.map((rule) => rule.id)).toEqual([
      'min-length',
      'uppercase',
      'lowercase',
      'number',
    ]);
  });

  describe('PASSWORD_RULES individual tests', () => {
    const rules = Object.fromEntries(PASSWORD_RULES.map((rule) => [rule.id, rule.test]));

    it('min-length requires at least 12 characters', () => {
      expect(rules['min-length']('abcdefghijk')).toBe(false); // 11 chars
      expect(rules['min-length']('abcdefghijkl')).toBe(true); // 12 chars
    });

    it('uppercase requires at least one uppercase letter', () => {
      expect(rules['uppercase']('abcdefghijkl')).toBe(false);
      expect(rules['uppercase']('Abcdefghijkl')).toBe(true);
    });

    it('lowercase requires at least one lowercase letter', () => {
      expect(rules['lowercase']('ABCDEFGHIJKL')).toBe(false);
      expect(rules['lowercase']('aBCDEFGHIJKL')).toBe(true);
    });

    it('number requires at least one digit', () => {
      expect(rules['number']('abcdefghijkl')).toBe(false);
      expect(rules['number']('abcdefghijk1')).toBe(true);
    });
  });

  describe('isPasswordValid', () => {
    it('rejects a password shorter than 12 characters', () => {
      expect(isPasswordValid('Short1')).toBe(false);
    });

    it('accepts a fully compliant password', () => {
      expect(isPasswordValid('Password12345')).toBe(true);
    });

    it('rejects a password without an uppercase letter', () => {
      expect(isPasswordValid('password12345')).toBe(false);
    });

    it('rejects a password without a lowercase letter', () => {
      expect(isPasswordValid('PASSWORD12345')).toBe(false);
    });

    it('rejects a password without a number', () => {
      expect(isPasswordValid('PasswordUpperLower')).toBe(false);
    });

    it('rejects an empty password', () => {
      expect(isPasswordValid('')).toBe(false);
    });
  });
});
