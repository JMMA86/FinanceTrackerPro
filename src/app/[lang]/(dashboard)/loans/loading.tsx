import { getDictionary, get } from '@/lib/i18n';
import { getLocaleFromCookie } from '@/lib/i18n-cookies';
import { LoansSkeleton } from '@/components/loans/LoansSkeleton';

/**
 * Route-level loading boundary for /loans.
 *
 * The pulsing skeleton is purely decorative (`aria-hidden` inside LoansSkeleton);
 * this wrapper exposes a polite live region with translated loading text so
 * screen-reader users get meaningful feedback (WCAG 2.2).
 */
export default async function LoansLoading() {
  const locale = await getLocaleFromCookie();
  const dictionary = await getDictionary(locale, 'loans');

  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">{get(dictionary, 'loading')}</span>
      <LoansSkeleton />
    </div>
  );
}
