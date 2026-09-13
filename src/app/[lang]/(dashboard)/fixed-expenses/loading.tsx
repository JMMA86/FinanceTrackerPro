import { getDictionary, get } from '@/lib/i18n';
import { getLocaleFromCookie } from '@/lib/i18n-cookies';
import { FixedExpensesSkeleton } from '@/components/fixed-expenses/FixedExpensesSkeleton';

/**
 * Route-level loading boundary for /fixed-expenses.
 *
 * The pulsing skeleton is purely decorative (`aria-hidden` inside
 * FixedExpensesSkeleton); this wrapper exposes a polite live region with
 * translated loading text so screen-reader users get meaningful feedback
 * (WCAG 2.2).
 */
export default async function FixedExpensesLoading() {
  const locale = await getLocaleFromCookie();
  const dictionary = await getDictionary(locale, 'fixed-expenses');

  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">{get(dictionary, 'loading')}</span>
      <FixedExpensesSkeleton />
    </div>
  );
}
