/**
 * sanitizeRedirect Unit Tests
 * Covers open-redirect protection (Fix S1): all fallback branches and the
 * SAFE_REDIRECT_PATTERN safe-path branch.
 */
import { describe, it, expect } from 'vitest';
import { sanitizeRedirect } from '../redirect';

describe('sanitizeRedirect', () => {
  it('returns the language dashboard when path is undefined', () => {
    expect(sanitizeRedirect(undefined, 'es')).toBe('/es/dashboard');
  });

  it('returns the language dashboard when path is null', () => {
    expect(sanitizeRedirect(null as unknown as string, 'es')).toBe('/es/dashboard');
  });

  it('keeps an internal relative path', () => {
    expect(sanitizeRedirect('/es/accounts', 'es')).toBe('/es/accounts');
  });

  it('keeps a plain dashboard path', () => {
    expect(sanitizeRedirect('/dashboard', 'es')).toBe('/dashboard');
  });

  it('falls back to the dashboard for protocol-relative URLs', () => {
    expect(sanitizeRedirect('//evil.com', 'es')).toBe('/es/dashboard');
  });

  it('falls back to the dashboard for absolute URLs with a scheme', () => {
    expect(sanitizeRedirect('https://evil.com', 'es')).toBe('/es/dashboard');
  });

  it('falls back to the dashboard for backslash-prefixed paths', () => {
    expect(sanitizeRedirect('/\\evil.com', 'es')).toBe('/es/dashboard');
  });

  it('falls back to the dashboard for non-slash prefixes like javascript:', () => {
    expect(sanitizeRedirect('javascript:alert(1)', 'es')).toBe('/es/dashboard');
  });

  it('falls back to the dashboard for paths with a query string', () => {
    expect(sanitizeRedirect('/es/accounts?x=1', 'es')).toBe('/es/dashboard');
  });

  it('falls back to the dashboard for paths with a hash fragment', () => {
    expect(sanitizeRedirect('/es/accounts#hash', 'es')).toBe('/es/dashboard');
  });

  it('falls back to the dashboard for an empty path', () => {
    expect(sanitizeRedirect('', 'es')).toBe('/es/dashboard');
  });

  it('interpolates the requested language into the fallback', () => {
    expect(sanitizeRedirect('https://evil.com', 'en')).toBe('/en/dashboard');
    expect(sanitizeRedirect('//evil.com', 'fr')).toBe('/fr/dashboard');
  });
});
