/**
 * Internationalization (i18n) Utilities
 * Handles locale detection and dictionary loading
 */

export type Locale = 'es' | 'en' | 'de';

export const DEFAULT_LOCALE: Locale = 'es';
export const SUPPORTED_LOCALES: Locale[] = ['es', 'en', 'de'];

type Dictionary = Record<string, unknown>;

/**
 * Load translation dictionary for a given locale and namespace
 */
export async function getDictionary(locale: Locale, namespace: string): Promise<Dictionary> {
  try {
    const dict = await import(`@/locales/${locale}/${namespace}.json`);
    return dict.default || dict;
  } catch (error) {
    // Fallback to default locale if translation not found
    if (locale !== DEFAULT_LOCALE) {
      const fallback = await import(`@/locales/${DEFAULT_LOCALE}/${namespace}.json`);
      return fallback.default || fallback;
    }
    throw error;
  }
}

/**
 * Get nested value from dictionary using dot notation
 * Example: get(dict, 'auth.login.title')
 */
export function get(obj: Dictionary, path: string): string {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return path; // Return key itself if not found (dev-friendly)
    }
  }

  return typeof result === 'string' ? result : path;
}

/**
 * Validate if a locale is supported
 */
export function isValidLocale(locale: string | undefined): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

/**
 * Get locale from Accept-Language header
 */
export function getLocaleFromHeader(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  // Parse Accept-Language header (e.g., "es-ES,es;q=0.9,en;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, q] = lang.trim().split(';q=');
      return {
        code: code.split('-')[0], // Extract base language (es from es-ES)
        quality: q ? Number.parseFloat(q) : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality);

  // Find first supported language
  for (const { code } of languages) {
    if (isValidLocale(code)) {
      return code;
    }
  }

  return DEFAULT_LOCALE;
}
