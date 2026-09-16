import { unstable_noStore } from 'next/cache';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { getDictionary, get, localeToBCP47 } from '@/lib/i18n';
import { getBankAccounts } from '@/actions/account.actions';
import type { AccountBrief } from '@/components/transactions/types';
import { LoanDetailPanel } from '@/components/loans/LoanDetailPanel';
import { getLoanDetailPageData } from './data';

interface LoanDetailPageProps {
  params: Promise<{ lang: Locale; loanId: string }>;
}

export async function generateMetadata({
  params,
}: Readonly<LoanDetailPageProps>): Promise<Metadata> {
  const { lang, loanId } = await params;
  const dict = await getDictionary(lang, 'loans');
  const { loan } = await getLoanDetailPageData(loanId);

  const title = `${loan?.name ?? (dict.detail as string)} | FinanceTrackerPro`;
  const description = get(dict, 'metaDescription');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://financetrackerpro.com/${lang}/loans/${loanId}`,
      siteName: 'FinanceTrackerPro',
      locale: lang === 'es' ? 'es_CO' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    // Private financial data: never indexed.
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function LoanDetailPage({ params }: Readonly<LoanDetailPageProps>) {
  unstable_noStore();
  const { lang, loanId } = await params;

  const baseDict = await getDictionary(lang, 'loans');
  const validationDict = await getDictionary(lang, 'validation');
  const dictionary: Record<string, unknown> = { ...baseDict, validation: validationDict };
  const locale = localeToBCP47(lang);

  // All financial data is fetched ONCE on the server via the server-only data
  // module and passed down as serializable props. After a mutation the client
  // panel calls router.refresh() so this module re-runs.
  const [{ loan }, accountsRes] = await Promise.all([
    getLoanDetailPageData(loanId),
    getBankAccounts({} as Record<string, never>),
  ]);

  if (!loan) notFound();

  const accounts: AccountBrief[] =
    accountsRes.success && accountsRes.data ? (accountsRes.data as unknown as AccountBrief[]) : [];

  return (
    <LoanDetailPanel
      loan={loan}
      locale={locale}
      dictionary={dictionary}
      accounts={accounts}
      lang={lang}
    />
  );
}
