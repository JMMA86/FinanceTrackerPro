import { unstable_noStore } from 'next/cache';
import type { Metadata } from 'next';
import type { Locale } from '@/lib/i18n';
import { getDictionary, get, localeToBCP47 } from '@/lib/i18n';
import { VariableExpensesView } from '@/components/variable-expenses/VariableExpensesView';
import { getVariableExpensesPageData } from './data';

interface VariableExpensesPageProps {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{ month?: string; year?: string }>;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Month (1-12); falls back to the current month when absent or not an integer. */
function resolveMonth(raw: string | undefined, now: Date): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return now.getMonth() + 1;
  return clamp(parsed, 1, 12);
}

/** Year (2000-2100); falls back to the current year when absent/not an integer. */
function resolveYear(raw: string | undefined, now: Date): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return now.getFullYear();
  return clamp(parsed, MIN_YEAR, MAX_YEAR);
}

export async function generateMetadata({
  params,
}: Readonly<VariableExpensesPageProps>): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'variable-expenses');

  const title = `${dict.title as string} | FinanceTrackerPro`;
  const description = get(dict, 'metaDescription');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://financetrackerpro.com/${lang}/variable-expenses`,
      siteName: 'FinanceTrackerPro',
      locale: lang === 'es' ? 'es_CO' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function VariableExpensesPage({
  params,
  searchParams,
}: Readonly<VariableExpensesPageProps>) {
  unstable_noStore();
  const { lang } = await params;
  const sp = await searchParams;

  const now = new Date();
  const month = resolveMonth(sp.month, now);
  const year = resolveYear(sp.year, now);

  const [dictionary, transactionsDictionary] = await Promise.all([
    getDictionary(lang, 'variable-expenses'),
    getDictionary(lang, 'transactions'),
  ]);
  const locale = localeToBCP47(lang);

  // All data is fetched ONCE on the server via the server-only data module and
  // passed down as serializable props. After a mutation a client component calls
  // router.refresh() so this module re-runs.
  const { overview, definitions, overviewError, definitionsError } =
    await getVariableExpensesPageData(month, year);

  const loadFailed = get(dictionary, 'errors.loadFailed');

  return (
    <div className="space-y-6">
      <VariableExpensesView
        month={month}
        year={year}
        locale={locale}
        dictionary={dictionary}
        transactionsDictionary={transactionsDictionary}
        overview={overview}
        definitions={definitions}
        overviewError={overviewError ? loadFailed : null}
        definitionsError={definitionsError ? loadFailed : null}
      />
    </div>
  );
}
