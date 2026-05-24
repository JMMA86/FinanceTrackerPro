import { Suspense } from 'react';
import { unstable_noStore } from 'next/cache';
import type { Metadata } from 'next';
import type { Locale } from '@/lib/i18n';
import { getDictionary } from '@/lib/i18n';
import { PiggyBank } from 'lucide-react';
import { SavingsSummaryCards } from '@/components/savings/SavingsSummaryCards';
import { SavingsGoalsGrid } from '@/components/savings/SavingsGoalsGrid';
import { MaxSpendableCard } from '@/components/savings/MaxSpendableCard';

interface SavingsPageProps {
  params: Promise<{ lang: Locale }>;
}

const LOCALE_MAP: Record<string, string> = {
  es: 'es-CO',
  en: 'en-US',
};

function SummaryCardsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="app-shell rounded-2xl p-5 animate-pulse">
          <div className="h-4 w-20 bg-white/5 rounded mb-3" />
          <div className="h-7 w-28 bg-white/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function GoalsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="app-shell rounded-2xl p-5 animate-pulse space-y-4">
          <div className="h-1.5 bg-white/5 rounded-full" />
          <div className="h-5 w-32 bg-white/5 rounded" />
          <div className="h-2.5 bg-white/5 rounded-full" />
          <div className="grid grid-cols-2 gap-3">
            <div className="h-8 bg-white/5 rounded" />
            <div className="h-8 bg-white/5 rounded" />
          </div>
          <div className="h-4 w-24 bg-white/5 rounded" />
        </div>
      ))}
    </div>
  );
}

function MaxSpendableSkeleton() {
  return (
    <div className="app-shell rounded-2xl p-5 animate-pulse">
      <div className="h-4 w-36 bg-white/5 rounded mb-4" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-8 bg-white/5 rounded" />
        ))}
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: Readonly<SavingsPageProps>): Promise<Metadata> {
  const { lang } = await params;
  const dict = await getDictionary(lang, 'savings');

  const title = `${dict.title as string} | FinanceTrackerPro`;
  const description = lang === 'es'
    ? 'Define metas de ahorro y sigue tu progreso financiero.'
    : 'Set savings goals and track your financial progress.';

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
  };
}

export default async function SavingsPage({ params }: Readonly<SavingsPageProps>) {
  unstable_noStore();
  const { lang } = await params;

  const dictionary = await getDictionary(lang, 'savings');
  const locale = LOCALE_MAP[lang] ?? 'es-CO';
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

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

      {/* Summary cards */}
      <Suspense fallback={<SummaryCardsSkeleton />}>
        <SavingsSummaryCards dictionary={dictionary} locale={locale} />
      </Suspense>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goals grid (2/3 width) */}
        <div className="lg:col-span-2 space-y-4">
          <Suspense fallback={<GoalsGridSkeleton />}>
            <SavingsGoalsGrid dictionary={dictionary} locale={locale} />
          </Suspense>
        </div>

        {/* Sidebar (1/3 width) */}
        <div className="space-y-4">
          <Suspense fallback={<MaxSpendableSkeleton />}>
            <MaxSpendableCard
              dictionary={dictionary}
              locale={locale}
              month={month}
              year={year}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
