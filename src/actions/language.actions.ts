/**
 * Language Actions
 * Handles locale switching
 */

'use server';

import 'server-only';
import { setLocaleCookie } from '@/lib/i18n-cookies';
import { safeAction } from '@/lib/utils/action-wrapper';
import { z } from 'zod';
import { SUPPORTED_LOCALES } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

const ChangeLanguageSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES as [Locale, ...Locale[]]),
});

/**
 * Change user's language preference
 */
export const changeLanguageAction = safeAction(async (input: unknown) => {
  const validated = ChangeLanguageSchema.parse(input);

  await setLocaleCookie(validated.locale);

  return { locale: validated.locale };
});
