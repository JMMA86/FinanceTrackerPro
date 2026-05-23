import type { Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { getDictionary, get } from '@/lib/i18n';
import { getAllTransactions } from '@/actions/transaction.actions';
import { getBankAccounts } from '@/actions/account.actions';
import type { TransactionType } from '@prisma/client';
import { TransactionFilters } from '@/components/transactions/TransactionFilters';
import { TransactionTable } from '@/components/transactions/TransactionTable';
import { TransactionPagination } from '@/components/transactions/TransactionPagination';
import { CreateTransactionModal } from '@/components/transactions/CreateTransactionModal';
import { NewTransactionButton } from '@/components/transactions/NewTransactionButton';

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

export default async function TransactionsPage({ params, searchParams }: Readonly<TransactionsPageProps>) {
  const { lang } = await params;
  const sp = await searchParams;

  const [dictionary, accountsRes] = await Promise.all([
    getDictionary(lang, 'transactions'),
    getBankAccounts({} as Record<string, never>),
  ]);

  const accounts = accountsRes.success && accountsRes.data
    ? (accountsRes.data as Array<{ id: string; name: string; currency: string }>)
    : [];
  const locale = LOCALE_MAP[lang] ?? 'es-CO';

  const input = {
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 10,
    search: sp.search || undefined,
    typeFilter: (sp.type as TransactionType) || undefined,
    dateFrom: sp.dateFrom ? new Date(sp.dateFrom) : undefined,
    dateTo: sp.dateTo ? new Date(sp.dateTo) : undefined,
  };

  const transactionsRes = await getAllTransactions(input);
  const pageData = transactionsRes.success && transactionsRes.data
    ? transactionsRes.data
    : null;

  const transactions = pageData?.transactions ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = pageData?.totalPages ?? 0;
  const currentPage = pageData?.page ?? 1;

  return (
    <div className="space-y-6 relative">
      {/* Background effects */}
      <div className="bg-orb" aria-hidden="true" />
      <div className="noise-overlay" aria-hidden="true" />
      <div className="grid-overlay" aria-hidden="true" />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">
          {get(dictionary, 'title')}
        </h1>
        <NewTransactionButton dictionary={dictionary} />
      </div>

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
                {Math.min(currentPage * 10, total)}
                {' '}de{' '}
                {total}
                {' '}transacciones
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

      {/* Create Transaction Modal */}
      <CreateTransactionModal accounts={accounts} dictionary={dictionary} />
    </div>
  );
}
