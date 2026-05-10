import { describe, it, expect } from 'vitest';
import {
  getDictionary,
  get,
  isValidLocale,
  getLocaleFromHeader,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from '../i18n';

describe('i18n.ts', () => {
  describe('getDictionary', () => {
    it('should load Spanish auth dictionary', async () => {
      // Given / When
      const dict = await getDictionary('es', 'auth');

      // Then
      expect(dict).toBeDefined();
      expect(dict.login).toBeDefined();
    });

    it('should load English auth dictionary', async () => {
      // Given / When
      const dict = await getDictionary('en', 'auth');

      // Then
      expect(dict).toBeDefined();
      expect(dict.login).toBeDefined();
    });

    it('should load Spanish common dictionary', async () => {
      // Given / When
      const dict = await getDictionary('es', 'common');

      // Then
      expect(dict).toBeDefined();
      expect(dict.buttons).toBeDefined();
    });

    it('should fall back to default locale when locale is invalid', async () => {
      // Given / When
      const dict = await getDictionary('invalid' as 'es', 'auth');

      // Then
      expect(dict).toBeDefined();
      expect(dict.login).toBeDefined();
    });

    it('should throw error when loading non-existent namespace for DEFAULT_LOCALE (line 26)', async () => {
      // Given: trying to load non-existent namespace from DEFAULT_LOCALE
      // When / Then: should throw error since fallback to DEFAULT_LOCALE also fails
      await expect(getDictionary('es', 'nonexistent-namespace')).rejects.toThrow();
    });
  });

  describe('get', () => {
    it('should retrieve nested value using dot notation', () => {
      // Given
      const dict = { auth: { login: { title: 'Inicia Sesión' } } };

      // When
      const result = get(dict, 'auth.login.title');

      // Then
      expect(result).toBe('Inicia Sesión');
    });

    it('should return the key itself when path is not found', () => {
      // Given
      const dict = { auth: { login: {} } };

      // When
      const result = get(dict, 'auth.login.nonexistent');

      // Then
      expect(result).toBe('auth.login.nonexistent');
    });

    it('should resolve single-level paths', () => {
      // Given
      const dict = { title: 'Dashboard' };

      // When
      const result = get(dict, 'title');

      // Then
      expect(result).toBe('Dashboard');
    });
  });

  describe('isValidLocale', () => {
    it('should return true for all supported locales', () => {
      // Given / When / Then
      expect(isValidLocale('es')).toBe(true);
      expect(isValidLocale('en')).toBe(true);
    });

    it('should return false for unsupported locales', () => {
      // Given / When / Then
      expect(isValidLocale('fr')).toBe(false);
      expect(isValidLocale('it')).toBe(false);
      expect(isValidLocale('')).toBe(false);
    });
  });

  describe('getLocaleFromHeader', () => {
    it('should return default locale when header is null', () => {
      // Given / When
      const locale = getLocaleFromHeader(null);

      // Then
      expect(locale).toBe(DEFAULT_LOCALE);
    });

    it('should return default locale when header is empty', () => {
      // Given / When
      const locale = getLocaleFromHeader('');

      // Then
      expect(locale).toBe(DEFAULT_LOCALE);
    });

    it('should parse simple language code', () => {
      // Given / When
      const locale = getLocaleFromHeader('en');

      // Then
      expect(locale).toBe('en');
    });

    it('should extract base language from region-qualified code', () => {
      // Given / When
      const locale = getLocaleFromHeader('es-ES');

      // Then
      expect(locale).toBe('es');
    });

    it('should select highest quality supported language', () => {
      // Given / When
      const locale = getLocaleFromHeader('en-US,en;q=0.9,es;q=0.8');

      // Then
      expect(locale).toBe('en');
    });

    it('should skip unsupported languages and pick next best', () => {
      // Given: fr not supported, es is best remaining
      const locale = getLocaleFromHeader('fr;q=0.9,es;q=0.8,en;q=0.7');

      // Then
      expect(locale).toBe('es');
    });

    it('should return default locale when no supported language found', () => {
      // Given / When
      const locale = getLocaleFromHeader('fr,it,pt');

      // Then
      expect(locale).toBe(DEFAULT_LOCALE);
    });
  });

  describe('constants', () => {
    it('should define Spanish as the default locale', () => {
      // Given / When / Then
      expect(DEFAULT_LOCALE).toBe('es');
    });

    it('should support exactly 2 locales', () => {
      // Given / When / Then
      expect(SUPPORTED_LOCALES).toContain('es');
      expect(SUPPORTED_LOCALES).toContain('en');
      expect(SUPPORTED_LOCALES).toHaveLength(2);
    });
  });
});
