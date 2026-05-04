/**
 * Dashboard Metrics Component
 * Server Component for fetching financial data
 * Used with Suspense for Partial Prerendering (PPR)
 */

import { getDictionary, get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getDashboardMetrics } from '@/actions/dashboard.actions';
import { TransactionList } from '@/components/transactions/TransactionList';

interface DashboardMetricsProps {
  lang: Locale;
}

export async function DashboardMetrics({ lang }: Readonly<DashboardMetricsProps>) {
  const dashboard = await getDictionary(lang, 'dashboard');
  const metrics = await getDashboardMetrics(lang);

  return (
    <>
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'totalBalance')}</p>
          <p className="text-2xl font-bold text-white">{metrics.totalBalance.formatted}</p>
          <p className="text-xs text-green-400 mt-2">
            +{((metrics.totalIncome.amount > 0 ? (metrics.totalExpenses.amount / metrics.totalIncome.amount) * 100 : 0)).toFixed(1)}%
          </p>
        </div>

        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'income')}</p>
          <p className="text-2xl font-bold text-white">{metrics.totalIncome.formatted}</p>
          <p className="text-xs text-green-400 mt-2">{get(dashboard, 'thisMonth')}</p>
        </div>

        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'expenses')}</p>
          <p className="text-2xl font-bold text-white">{metrics.totalExpenses.formatted}</p>
          <p className="text-xs text-red-400 mt-2">
            -{((metrics.totalExpenses.amount > 0 && metrics.totalIncome.amount > 0 ? (metrics.totalExpenses.amount / metrics.totalIncome.amount) * 100 : 0)).toFixed(0)}% {get(dashboard, 'vsLastMonth')}
          </p>
        </div>

        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'investments')}</p>
          <p className="text-2xl font-bold text-white">{metrics.investments.formatted}</p>
          <p className="text-xs text-blue-400 mt-2">Diversified</p>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="app-shell rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          {get(dashboard, 'recentTransactions')}
        </h2>
        {metrics.recentTransactions.length > 0 ? (
          <TransactionList transactions={metrics.recentTransactions} />
        ) : (
          <p className="text-gray-400">{get(dashboard, 'connectingDb')}</p>
        )}
      </div>
    </>
  );
}