import { getDictionary, get } from '@/lib/i18n';
import { getLocaleFromCookie } from '@/lib/i18n-cookies';
import { SavingsSkeleton } from '@/components/savings/SavingsSkeleton';

/**
 * Route-level loading boundary for /savings.
 *
 * The pulsing skeleton is purely decorative (`aria-hidden` inside
 * SavingsSkeleton); this wrapper exposes a polite live region with translated
 * loading text so screen-reader users get meaningful feedback (WCAG 2.2).
 */
export default async function SavingsLoading() {
  const locale = await getLocaleFromCookie();
  const dictionary = await getDictionary(locale, 'savings');

  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">{get(dictionary, 'loading')}</span>
      <SavingsSkeleton />
    </div>
  );
}
