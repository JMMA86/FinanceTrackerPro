import type { Metadata } from 'next';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardBottomBar } from '@/components/dashboard/DashboardBottomBar';
import { getDictionary, get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'Dashboard | FinanceTrackerPro',
  description: 'Banking-grade financial management system',
};

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}

export default async function DashboardLayout({
  children,
  params,
}: Readonly<DashboardLayoutProps>) {
  const { lang } = await params;
  const common = await getDictionary(lang, 'common');

  return (
    <div className="min-h-screen bg-app">
      {/* Desktop: Sidebar Left */}
      <DashboardSidebar
        lang={lang}
        logoutLabel={get(common, 'navigation.logout')}
        loggingOutLabel={get(common, 'navigation.loggingOut')}
      />

      {/* Main Content Area */}
      <main className="md:ml-64 min-h-screen pb-20 md:pb-0">
        <div className="container mx-auto max-w-[1920px] px-3 py-4 sm:px-4 md:px-6 md:py-6">
          {children}
        </div>
      </main>

      {/* Mobile: Bottom Bar */}
      <DashboardBottomBar lang={lang} />
    </div>
  );
}
