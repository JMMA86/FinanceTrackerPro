import { unstable_noStore } from 'next/cache';
import type { Metadata } from 'next';
import type { Locale } from '@/lib/i18n';
import { getDictionary, get, localeToBCP47 } from '@/lib/i18n';
import { PiggyBank } from 'lucide-react';
import { SavingsSummaryCards } from '@/components/savings/SavingsSummaryCards';
import { SavingsGoalsGrid } from '@/components/savings/SavingsGoalsGrid';
import { MaxSpendableCard } from '@/components/savings/MaxSpendableCard';
import { getSavingsPageData } from './data';

interface SavingsPageProps {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Readonly<SavingsPageProps>): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'savings');

  const title = `${dict.title as string} | FinanceTrackerPro`;
  const description = get(dict, 'metaDescription');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://financetrackerpro.com/${lang}/savings`,
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

export default async function SavingsPage({ params }: Readonly<SavingsPageProps>) {
  unstable_noStore();
  const { lang } = await params;

  const dictionary = await getDictionary(lang, 'savings');
  const locale = localeToBCP47(lang);
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // M4 (audit): all financial data is fetched ONCE on the server via a
  // server-only data module (NOT 'use server' actions) and passed down as
  // serializable props. Client components never call read actions; after a
  // mutation they `router.refresh()` so this module re-runs.
  //
  // NOTE: the previous inline <Suspense fallback={<SavingsSkeleton />}> was
  // removed on purpose. All reads above are top-level awaits, so the boundary
  // never suspended and a resolved Suspense boundary around the whole page
  // interfered with router.refresh() RSC reconciliation (payload fresh but the
  // boundary subtree intermittently not patched). Route-level loading.tsx
  // still provides the skeleton during navigation.
  const {
    goals,
    summaryBuckets,
    maxSpendableBuckets,
    goalsError,
    summaryError,
    maxSpendableError,
  } = await getSavingsPageData(month, year);

  const goalsErrorMessage = goalsError ? get(dictionary, 'errors.loadFailed') : null;
  const summaryErrorMessage = summaryError ? get(dictionary, 'errors.loadFailed') : null;
  const maxSpendableErrorMessage = maxSpendableError ? get(dictionary, 'errors.loadFailed') : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400">
          <PiggyBank className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">{dictionary.title as string}</h1>
          <p className="text-sm text-slate-400">{dictionary.subtitle as string}</p>
        </div>
      </div>

      {/* Summary cards — one 4-card row per currency bucket (never mixed) */}
      <SavingsSummaryCards
        buckets={summaryBuckets}
        error={summaryErrorMessage}
        dictionary={dictionary}
        locale={locale}
      />

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goals grid (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <SavingsGoalsGrid
            goals={goals}
            loadError={goalsErrorMessage}
            dictionary={dictionary}
            locale={locale}
          />
        </div>

        {/* Sidebar (1/3 width) — per-currency max spendable breakdown */}
        {(!maxSpendableErrorMessage && maxSpendableBuckets.length > 0) ||
        maxSpendableErrorMessage ? (
          <aside aria-label={get(dictionary, 'maxSpendable')} className="space-y-4">
            <MaxSpendableCard
              buckets={maxSpendableBuckets}
              error={maxSpendableErrorMessage}
              dictionary={dictionary}
              locale={locale}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
