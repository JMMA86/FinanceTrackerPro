import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { getDashboardMetrics } from '@/actions/dashboard.actions';
import { DashboardContent } from '@/components/dashboard/DashboardContent';

interface DashboardMetricsProps {
  lang: Locale;
}

export async function DashboardMetrics({ lang }: Readonly<DashboardMetricsProps>) {
  const dashboard = await getDictionary(lang, 'dashboard');
  const metrics = await getDashboardMetrics(lang);

  return <DashboardContent metrics={metrics} lang={lang} dashboard={dashboard} />;
}
