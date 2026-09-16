import { getDictionary, get } from '@/lib/i18n';
import { getLocaleFromCookie } from '@/lib/i18n-cookies';
import { LoanDetailSkeleton } from '@/components/loans/LoanDetailSkeleton';

/**
 * Route-level loading boundary for /loans/[loanId].
 *
 * The pulsing skeleton is purely decorative (`aria-hidden` inside
 * LoanDetailSkeleton); this wrapper exposes a polite live region with
 * translated loading text so screen-reader users get meaningful feedback.
 */
export default async function LoanDetailLoading() {
  const locale = await getLocaleFromCookie();
  const dictionary = await getDictionary(locale, 'loans');

  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">{get(dictionary, 'loading')}</span>
      <LoanDetailSkeleton />
    </div>
  );
}
