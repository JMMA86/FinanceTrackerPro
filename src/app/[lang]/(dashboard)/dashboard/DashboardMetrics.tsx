import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getDashboardMetrics } from './data';
import { DashboardContent } from '@/components/dashboard/DashboardContent';
import { getBankAccounts } from '@/actions/account.actions';
import { getCreditCards } from '@/actions/credit-card.actions';
import { getCategories } from '@/actions/category.actions';
import { getSession } from '@/lib/auth/session';
import type { AccountBrief, CategoryBrief } from '@/components/transactions/types';
import type { CreditCard } from '@/components/credit-cards/credit-card.types';

interface DashboardMetricsProps {
  lang: Locale;
}

const LOCALE_MAP: Record<Locale, string> = {
  es: 'es-CO',
  en: 'en-US',
};

/**
 * Dashboard data boundary (Server Component).
 *
 * Reads the aggregate metrics from the server-only dashboard data module AND
 * the reference data the quick-action modals need (accounts, credit cards,
 * categories, session). Those references come from the SAME Server Actions the
 * transactions page uses — no logic is reimplemented here.
 */
export async function DashboardMetrics({ lang }: Readonly<DashboardMetricsProps>) {
  const [
    dashboard,
    transactionsDict,
    validationDict,
    creditCardsDict,
    metrics,
    accountsRes,
    cardsRes,
    categoriesRes,
    session,
  ] = await Promise.all([
    getDictionary(lang, 'dashboard'),
    getDictionary(lang, 'transactions'),
    getDictionary(lang, 'validation'),
    getDictionary(lang, 'credit-cards'),
    getDashboardMetrics(lang),
    getBankAccounts({} as Record<string, never>),
    getCreditCards({}),
    getCategories({} as Record<string, never>),
    getSession(),
  ]);

  // The Server Actions already return structurally compatible DTOs (the
  // `AccountBrief` / `CreditCard` / `CategoryBrief` shapes are subsets of the
  // action results), so no `as unknown as` escape hatch is needed.
  const accounts: AccountBrief[] = accountsRes.success && accountsRes.data ? accountsRes.data : [];

  const creditCards: CreditCard[] = cardsRes.success && cardsRes.data ? cardsRes.data : [];

  const categories: CategoryBrief[] =
    categoriesRes.success && categoriesRes.data ? categoriesRes.data : [];

  // The create/transfer/category modals read validation messages from the
  // transactions dictionary; merge them exactly like the transactions page does.
  const transactionsDictionary: Record<string, unknown> = {
    ...transactionsDict,
    validation: validationDict,
  };

  return (
    <DashboardContent
      metrics={metrics}
      lang={lang}
      dashboard={dashboard}
      transactionsDictionary={transactionsDictionary}
      creditCardsDictionary={creditCardsDict}
      accounts={accounts}
      creditCards={creditCards}
      categories={categories}
      userId={session?.userId ?? ''}
      locale={LOCALE_MAP[lang] ?? 'es-CO'}
    />
  );
}
