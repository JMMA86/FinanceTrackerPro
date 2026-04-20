/**
 * i18n Utilities Test Suite
 * Tests locale detection and dictionary loading
 */

import { describe, it, expect } from 'vitest';
import {
  getDictionary,
  get,
  isValidLocale,
  getLocaleFromHeader,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
} from '../i18n';

describe('i18n Utilities', () => {
  describe('getDictionary', () => {
    it('loads Spanish auth dictionary', async () => {
      const dict = await getDictionary('es', 'auth');

      expect(dict).toBeDefined();
      expect(dict.login).toBeDefined();
    });

    it('loads English auth dictionary', async () => {
      const dict = await getDictionary('en', 'auth');

      expect(dict).toBeDefined();
      expect(dict.login).toBeDefined();
    });

    it('loads Spanish common dictionary', async () => {
      const dict = await getDictionary('es', 'common');

      expect(dict).toBeDefined();
      expect(dict.buttons).toBeDefined();
    });

    it('fallbacks to default locale for invalid locale', async () => {
      const dict = await getDictionary('invalid' as 'es', 'auth');

      expect(dict).toBeDefined();
      // Should load Spanish (default) auth dictionary
      expect(dict.login).toBeDefined();
    });
  });

  describe('get', () => {
    it('retrieves nested value with dot notation', () => {
      const dict = {
        auth: {
          login: {
            title: 'Inicia Sesión',
          },
        },
      };

      const result = get(dict, 'auth.login.title');

      expect(result).toBe('Inicia Sesión');
    });

    it('returns key itself if path not found', () => {
      const dict = {
        auth: {
          login: {},
        },
      };

      const result = get(dict, 'auth.login.nonexistent');

      expect(result).toBe('auth.login.nonexistent');
    });

    it('handles single-level paths', () => {
      const dict = {
        title: 'Dashboard',
      };

      const result = get(dict, 'title');

      expect(result).toBe('Dashboard');
    });
  });

  describe('isValidLocale', () => {
    it('returns true for supported locales', () => {
      expect(isValidLocale('es')).toBe(true);
      expect(isValidLocale('en')).toBe(true);
    });

    it('returns false for unsupported locales', () => {
      expect(isValidLocale('fr')).toBe(false);
      expect(isValidLocale('de')).toBe(false);
      expect(isValidLocale('')).toBe(false);
    });
  });

  describe('getLocaleFromHeader', () => {
    it('returns default locale for null header', () => {
      const locale = getLocaleFromHeader(null);

      expect(locale).toBe(DEFAULT_LOCALE);
    });

    it('returns default locale for empty header', () => {
      const locale = getLocaleFromHeader('');

      expect(locale).toBe(DEFAULT_LOCALE);
    });

    it('parses simple Accept-Language header', () => {
      const locale = getLocaleFromHeader('en');

      expect(locale).toBe('en');
    });

    it('parses Accept-Language with region', () => {
      const locale = getLocaleFromHeader('es-ES');

      expect(locale).toBe('es');
    });

    it('parses Accept-Language with quality values', () => {
      const locale = getLocaleFromHeader('en-US,en;q=0.9,es;q=0.8');

      expect(locale).toBe('en');
    });

    it('returns highest quality supported locale', () => {
      const locale = getLocaleFromHeader('fr;q=0.9,es;q=0.8,en;q=0.7');

      // fr not supported, so should return es (highest quality supported)
      expect(locale).toBe('es');
    });

    it('returns default locale if no supported language found', () => {
      const locale = getLocaleFromHeader('fr,de,it');

      expect(locale).toBe(DEFAULT_LOCALE);
    });
  });

  describe('constants', () => {
    it('has correct default locale', () => {
      expect(DEFAULT_LOCALE).toBe('es');
    });

    it('has expected supported locales', () => {
      expect(SUPPORTED_LOCALES).toContain('es');
      expect(SUPPORTED_LOCALES).toContain('en');
      expect(SUPPORTED_LOCALES).toHaveLength(2);
    });
  });
});
