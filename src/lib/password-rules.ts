/**
 * Shared Password Rules (F3 + A9)
 * Single source of truth for password strength requirements.
 * Isomorphic — safe to import in server and client code.
 * Mirrors the server-side validation (min 12 chars).
 */

export type PasswordRuleId = 'min-length' | 'uppercase' | 'lowercase' | 'number';

export interface PasswordRule {
  id: PasswordRuleId;
  test: (password: string) => boolean;
}

export const MIN_PASSWORD_LENGTH = 12;

export const PASSWORD_RULES: PasswordRule[] = [
  { id: 'min-length', test: (p) => p.length >= MIN_PASSWORD_LENGTH },
  { id: 'uppercase', test: (p) => /[A-Z]/.test(p) },
  { id: 'lowercase', test: (p) => /[a-z]/.test(p) },
  { id: 'number', test: (p) => /\d/.test(p) },
];

export function isPasswordValid(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
