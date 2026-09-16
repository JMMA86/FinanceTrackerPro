import type { Locale } from '@/lib/i18n';
import type { Metadata } from 'next';
import { unstable_noStore } from 'next/cache';
import { Suspense } from 'react';
import { getDictionary, get } from '@/lib/i18n';
import { DashboardMetrics } from './DashboardMetrics';
import { DashboardSkeleton } from './DashboardSkeleton';

interface DashboardPageProps {
  params: Promise<{ lang: Locale }>;
}

export async function generateMetadata({ params }: DashboardPageProps): Promise<Metadata> {
  const { lang } = await params;
  const dashboard = await getDictionary(lang, 'dashboard');
  const title = `${get(dashboard, 'title')} - FinanceTrackerPro`;
  const description = get(dashboard, 'metaDescription');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://financetrackerpro.com/${lang}/dashboard`,
      siteName: 'FinanceTrackerPro',
      locale: lang,
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

export default async function DashboardPage({ params }: Readonly<DashboardPageProps>) {
  // Prevent caching of financial data (Rule 13 - Source of Truth)
  unstable_noStore();

  const { lang } = await params;

  return (
    <div className="space-y-6 relative">
      {/* Floating orb background */}
      <div className="bg-orb" aria-hidden="true" />
      {/* Noise texture overlay */}
      <div className="noise-overlay" aria-hidden="true" />
      {/* Grid overlay */}
      <div className="grid-overlay" aria-hidden="true" />

      {/* PPR with Suspense - Static shell loads instantly, data loads async */}
      <Suspense fallback={<DashboardSkeleton />}>
        <div className="animate-stagger">
          <DashboardMetrics lang={lang} />
        </div>
      </Suspense>
    </div>
  );
}
