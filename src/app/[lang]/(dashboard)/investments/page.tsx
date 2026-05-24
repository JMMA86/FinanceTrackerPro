import { Suspense } from 'react';
import type { Metadata } from 'next';
import type { Locale } from '@/lib/i18n';
import { getDictionary } from '@/lib/i18n';
import { getInvestmentAccounts } from '@/actions/investment.actions';
import { InvestmentDashboard } from '@/components/investments/InvestmentDashboard';
import { InvestmentsLoading } from './loading';

interface InvestmentsPageProps {
  params: Promise<{ lang: Locale }>;
}

const LOCALE_MAP: Record<string, string> = {
  es: 'es-CO',
  en: 'en-US',
};

export async function generateMetadata({ params }: Readonly<InvestmentsPageProps>): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'investments');

  const title = `${dict.title as string} | FinanceTrackerPro`;
  const description = lang === 'es'
    ? 'Gestiona tu portafolio de inversiones, compra y vende activos financieros.'
    : 'Manage your investment portfolio, buy and sell financial assets.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://financetrackerpro.com/${lang}/investments`,
      siteName: 'FinanceTrackerPro',
      locale: lang === 'es' ? 'es_CO' : 'en_US',
      type: 'website',
    },
  };
}

export default async function InvestmentsPage({ params }: Readonly<InvestmentsPageProps>) {
  const { lang } = await params;

  const [accountsRes, dictionary] = await Promise.all([
    getInvestmentAccounts({} as Record<string, never>),
    getDictionary(lang, 'investments'),
  ]);

  const accounts = accountsRes.success && accountsRes.data ? accountsRes.data : [];
  const locale = LOCALE_MAP[lang] ?? 'en-US';

  return (
    <div className="space-y-6">
      <Suspense fallback={<InvestmentsLoading />}>
        <InvestmentDashboard
          accounts={accounts as Array<Record<string, unknown>>}
          dictionary={dictionary}
          locale={locale}
        />
      </Suspense>
    </div>
  );
}
