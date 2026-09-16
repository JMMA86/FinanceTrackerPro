/**
 * Locale Cookie Management
 * Handles locale persistence via cookies
 */

'use server';

import { cookies } from 'next/headers';
import type { Locale } from './i18n';
import { DEFAULT_LOCALE, isValidLocale } from './i18n';

const LOCALE_COOKIE_NAME = 'locale';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/**
 * Get locale from cookie
 */
export async function getLocaleFromCookie(): Promise<Locale> {
  const cookieStore = await cookies();
  const locale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;

  if (locale && isValidLocale(locale)) {
    return locale;
  }

  return DEFAULT_LOCALE;
}

/**
 * Set locale cookie
 */
export async function setLocaleCookie(locale: Locale): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, {
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  });
}
