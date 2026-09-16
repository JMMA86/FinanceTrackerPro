import { unstable_noStore } from 'next/cache';
import type { Metadata } from 'next';
import { HandCoins } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { getDictionary, get, localeToBCP47 } from '@/lib/i18n';
import { getBankAccounts } from '@/actions/account.actions';
import type { AccountBrief } from '@/components/transactions/types';
import { LoansSummaryCards } from '@/components/loans/LoansSummaryCards';
import { LoansGrid } from '@/components/loans/LoansGrid';
import { getLoansPageData } from './data';

interface LoansPageProps {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: Readonly<LoansPageProps>): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'loans');

  const title = `${dict.title as string} | FinanceTrackerPro`;
  const description = get(dict, 'metaDescription');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://financetrackerpro.com/${lang}/loans`,
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

export default async function LoansPage({ params }: Readonly<LoansPageProps>) {
  unstable_noStore();
  const { lang } = await params;

  const baseDict = await getDictionary(lang, 'loans');
  const validationDict = await getDictionary(lang, 'validation');
  const dictionary: Record<string, unknown> = { ...baseDict, validation: validationDict };
  const locale = localeToBCP47(lang);

  // M4 (audit) pattern: all financial data is fetched ONCE on the server via a
  // server-only data module (NOT 'use server' actions) and passed down as
  // serializable props. Client components never call read actions; after a
  // mutation they `router.refresh()` so the data module re-runs.
  const [{ loans, summaryBuckets, loansError, summaryError }, accountsRes] = await Promise.all([
    getLoansPageData(),
    getBankAccounts({} as Record<string, never>),
  ]);

  const accounts: AccountBrief[] =
    accountsRes.success && accountsRes.data ? (accountsRes.data as unknown as AccountBrief[]) : [];

  const loansErrorMessage = loansError ? get(dictionary, 'errors.loadFailed') : null;
  const summaryErrorMessage = summaryError ? get(dictionary, 'errors.loadFailed') : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-violet-500/15 text-violet-400">
          <HandCoins className="w-5 h-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-white">{dictionary.title as string}</h1>
          <p className="text-sm text-slate-400">{dictionary.subtitle as string}</p>
        </div>
      </div>

      {/* Summary cards — one row per currency bucket (never mixed) */}
      <LoansSummaryCards
        buckets={summaryBuckets}
        error={summaryErrorMessage}
        dictionary={dictionary}
        locale={locale}
      />

      {/* Loans grid */}
      <LoansGrid
        loans={loans}
        accounts={accounts}
        loadError={loansErrorMessage}
        dictionary={dictionary}
        locale={locale}
        lang={lang}
      />
    </div>
  );
}
