import { getDictionary, get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

interface DashboardPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function DashboardPage({ params }: Readonly<DashboardPageProps>) {
  const { lang } = await params;
  const dashboard = await getDictionary(lang, 'dashboard');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-theme-gradient text-glow">
        {get(dashboard, 'title')}
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric Cards */}
        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'totalBalance')}</p>
          <p className="text-2xl font-bold text-white">$2,850,000</p>
          <p className="text-xs text-green-400 mt-2">+12.5%</p>
        </div>

        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'income')}</p>
          <p className="text-2xl font-bold text-white">$5,000,000</p>
          <p className="text-xs text-green-400 mt-2">{get(dashboard, 'thisMonth')}</p>
        </div>

        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'expenses')}</p>
          <p className="text-2xl font-bold text-white">$2,150,000</p>
          <p className="text-xs text-red-400 mt-2">-43% {get(dashboard, 'vsLastMonth')}</p>
        </div>

        <div className="app-shell rounded-2xl p-6 hover:border-white/20 hover:shadow-[0_20px_55px_-24px_rgba(47,124,246,0.35)] transition-all duration-300">
          <p className="text-sm text-gray-400 mb-1">{get(dashboard, 'investments')}</p>
          <p className="text-2xl font-bold text-white">$1,500 USD</p>
          <p className="text-xs text-blue-400 mt-2">Binance</p>
        </div>
      </div>

      {/* Placeholder for charts/transactions */}
      <div className="app-shell rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          {get(dashboard, 'recentTransactions')}
        </h2>
        <p className="text-gray-400">{get(dashboard, 'connectingDb')}</p>
      </div>
    </div>
  );
}
