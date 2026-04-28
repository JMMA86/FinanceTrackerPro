import { getDictionary, get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

interface VariableExpensesPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function VariableExpensesPage({
  params,
}: Readonly<VariableExpensesPageProps>) {
  const { lang } = await params;
  const dashboard = await getDictionary(lang, 'dashboard');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-theme-gradient">
        {get(dashboard, 'variableExpenses')}
      </h1>
      <div className="app-shell rounded-2xl p-6">
        <p className="text-gray-400">{get(dashboard, 'inDevelopment')}</p>
      </div>
    </div>
  );
}
