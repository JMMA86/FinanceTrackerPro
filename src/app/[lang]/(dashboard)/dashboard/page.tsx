import { getDictionary, get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { unstable_noStore } from 'next/cache';
import { Suspense } from 'react';
import { DashboardMetrics } from './DashboardMetrics';
import { DashboardSkeleton } from './DashboardSkeleton';

interface DashboardPageProps {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: `Dashboard - FinanceTrackerPro`,
    description: 'Your financial command center. Track expenses, manage budgets, and monitor investments.',
    openGraph: {
      title: 'Dashboard - FinanceTrackerPro',
      description: 'Your financial command center',
      url: `https://financetrackerpro.com/${lang}/dashboard`,
      siteName: 'FinanceTrackerPro',
      locale: lang,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Dashboard - FinanceTrackerPro',
      description: 'Your financial command center',
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function DashboardPage({ params }: Readonly<DashboardPageProps>) {
  // Prevent caching of financial data (Rule 13 - Source of Truth)
  unstable_noStore();

  const { lang } = await params;
  const dashboard = await getDictionary(lang, 'dashboard');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-theme-gradient text-glow">
        {get(dashboard, 'title')}
      </h1>

      {/* PPR with Suspense - Static shell loads instantly, data loads async */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardMetrics lang={lang} />
      </Suspense>
    </div>
  );
}