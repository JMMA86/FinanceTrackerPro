import Link from 'next/link';
import { Landmark } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { getDictionary, get } from '@/lib/i18n';
import { getAllTransactions } from '@/actions/transaction.actions';
import { getBankAccounts } from '@/actions/account.actions';
import { getCategories } from '@/actions/category.actions';
import { getSession } from '@/lib/auth/session';
import type { TransactionType } from '@prisma/client';
import { TransactionFilters } from '@/components/transactions/TransactionFilters';
import { TransactionTable } from '@/components/transactions/TransactionTable';
import { TransactionPagination } from '@/components/transactions/TransactionPagination';
import { TransactionHeaderActions } from '@/components/transactions/TransactionHeaderActions';
import type { AccountBrief, CategoryBrief } from '@/components/transactions/types';

interface TransactionsPageProps {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{
    search?: string;
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    page?: string;
  }>;
}

const LOCALE_MAP: Record<string, string> = {
  es: 'es-CO',
  en: 'en-US',
};

export async function generateMetadata({ params }: TransactionsPageProps): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `Transacciones - FinanceTrackerPro`,
    description: 'Historial de movimientos financieros. Gestiona y consulta tus ingresos y gastos.',
    openGraph: {
      title: 'Transacciones - FinanceTrackerPro',
      description: 'Historial de movimientos financieros',
      url: `https://financetrackerpro.com/${lang}/transactions`,
      siteName: 'FinanceTrackerPro',
      locale: lang,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Transacciones - FinanceTrackerPro',
      description: 'Historial de movimientos financieros',
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function TransactionsPage({
  params,
  searchParams,
}: Readonly<TransactionsPageProps>) {
  const { lang } = await params;
  const sp = await searchParams;

  const [dictionary, accountsRes, categoriesRes, session] = await Promise.all([
    getDictionary(lang, 'transactions'),
    getBankAccounts({} as Record<string, never>),
    getCategories({} as Record<string, never>),
    getSession(),
  ]);

  const accounts: AccountBrief[] =
    accountsRes.success && accountsRes.data ? (accountsRes.data as unknown as AccountBrief[]) : [];

  const categories: CategoryBrief[] =
    categoriesRes.success && categoriesRes.data
      ? (categoriesRes.data as unknown as CategoryBrief[])
      : [];

  const locale = LOCALE_MAP[lang] ?? 'es-CO';

  // B2 (timezone): parse date-only query strings as local midnight so the
  // inclusive `dateTo` range does not shift across UTC boundaries.
  const input = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: sp.search || undefined,
    typeFilter: (sp.type as TransactionType) || undefined,
    dateFrom: sp.dateFrom ? new Date(sp.dateFrom + 'T00:00:00') : undefined,
    dateTo: sp.dateTo ? new Date(sp.dateTo + 'T00:00:00') : undefined,
  };

  const transactionsRes = await getAllTransactions(input);
  const pageData = transactionsRes.success && transactionsRes.data ? transactionsRes.data : null;

  const transactions = pageData?.transactions ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = pageData?.totalPages ?? 0;
  const currentPage = pageData?.page ?? 1;

  const hasNoAccounts = accounts.length === 0;

  return (
    <div className="space-y-6 relative">
      {/* Background effects */}
      <div className="bg-orb" aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">{get(dictionary, 'title')}</h1>
        <TransactionHeaderActions
          dictionary={dictionary}
          accounts={accounts}
          categories={categories}
          hasAccounts={!hasNoAccounts}
          lang={lang}
          userId={session?.userId ?? ''}
          locale={locale}
        />
      </div>

      {/* Empty state without accounts */}
      {hasNoAccounts ? (
        <div className="app-shell rounded-2xl py-16 flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-2xl bg-blue-500/10 text-blue-400">
            <Landmark className="w-8 h-8" aria-hidden="true" />
          </div>
          <div>
            <p className="text-base font-semibold text-white mb-1">
              {get(dictionary, 'noAccountsTitle')}
            </p>
            <p className="text-sm text-slate-400 max-w-sm leading-relaxed">
              {get(dictionary, 'noAccountsDesc')}
            </p>
          </div>
          <Link
            href={`/${lang}/accounts`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            {get(dictionary, 'createAccountCta')}
          </Link>
        </div>
      ) : (
        <>
          {/* Filters */}
          <TransactionFilters dictionary={dictionary} />

          {/* Table / List */}
          <TransactionTable
            transactions={transactions}
            accounts={accounts}
            dictionary={dictionary}
            locale={locale}
          />

          {/* Pagination + summary */}
          {totalPages > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-4">
              <p className="text-sm text-slate-400">
                {total > 0 && (
                  <>
                    {(currentPage - 1) * 10 + 1}
                    &ndash;
                    {Math.min(currentPage * 10, total)} de {total} transacciones
                  </>
                )}
              </p>
              <TransactionPagination
                currentPage={currentPage}
                totalPages={totalPages}
                dictionary={dictionary}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
