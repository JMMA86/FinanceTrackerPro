import { unstable_noStore } from 'next/cache';
import type { Metadata } from 'next';
import type { Locale } from '@/lib/i18n';
import { getDictionary, get, localeToBCP47 } from '@/lib/i18n';
import { ReceiptText } from 'lucide-react';
import { FixedExpensesSummaryCards } from '@/components/fixed-expenses/FixedExpensesSummaryCards';
import { FixedExpensesView } from '@/components/fixed-expenses/FixedExpensesView';
import { getFixedExpensesPageData } from './data';

interface FixedExpensesPageProps {
  params: Promise<{ lang: Locale }>;
}

/** Format a Date as the local `YYYY-MM-DD` value used by date inputs. */
function toLocalDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function generateMetadata({
  params,
}: Readonly<FixedExpensesPageProps>): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'fixed-expenses');

  const title = `${dict.title as string} | FinanceTrackerPro`;
  const description = get(dict, 'metaDescription');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://financetrackerpro.com/${lang}/fixed-expenses`,
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

export default async function FixedExpensesPage({ params }: Readonly<FixedExpensesPageProps>) {
  unstable_noStore();
  const { lang } = await params;

  const dictionary = await getDictionary(lang, 'fixed-expenses');
  const locale = localeToBCP47(lang);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { expenses, summaryBuckets, expensesError, summaryError } = await getFixedExpensesPageData(
    month,
    year
  );

  const expensesErrorMessage = expensesError ? get(dictionary, 'errors.loadFailed') : null;
  const summaryErrorMessage = summaryError ? get(dictionary, 'errors.loadFailed') : null;

  // Pass a stable "today" (server-computed) so statuses (overdue/pending) and
  // the create-form default render identically on the server and after
  // hydration (no client/server timezone mismatch).
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStartIso = todayStart.toISOString();
  const todayDate = toLocalDateInputValue(now);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
          <ReceiptText className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">{dictionary.title as string}</h1>
          <p className="text-sm text-slate-400">{dictionary.subtitle as string}</p>
        </div>
      </div>

      {/* Summary cards — one 4-card row per currency bucket (never mixed) */}
      <FixedExpensesSummaryCards
        buckets={summaryBuckets}
        error={summaryErrorMessage}
        dictionary={dictionary}
        locale={locale}
      />

      {/* View + sidebar */}
      <FixedExpensesView
        expenses={expenses}
        loadError={expensesErrorMessage}
        dictionary={dictionary}
        locale={locale}
        todayStartIso={todayStartIso}
        todayDate={todayDate}
      />
    </div>
  );
}
