import { getDictionary, get } from '@/lib/i18n';
import { getLocaleFromCookie } from '@/lib/i18n-cookies';
import { VariableExpensesSkeleton } from '@/components/variable-expenses/VariableExpensesSkeleton';

/**
 * Route-level loading boundary for /variable-expenses.
 *
 * The pulsing skeleton is purely decorative (`aria-hidden` inside
 * VariableExpensesSkeleton); this wrapper exposes a polite live region with
 * translated loading text so screen-reader users get meaningful feedback.
 */
export default async function VariableExpensesLoading() {
  const locale = await getLocaleFromCookie();
  const dictionary = await getDictionary(locale, 'variable-expenses');

  return (
    <div role="status" aria-live="polite" className="space-y-6">
      <span className="sr-only">{get(dictionary, 'loading')}</span>
      <VariableExpensesSkeleton />
    </div>
  );
}
