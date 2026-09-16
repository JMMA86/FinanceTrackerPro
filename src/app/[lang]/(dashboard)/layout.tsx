import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardBottomBar } from '@/components/dashboard/DashboardBottomBar';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/db';
import { DEFAULT_LOCALE, getDictionary, get, isValidLocale } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'FinanceTrackerPro',
  description: 'Banking-grade financial management system',
};

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

export default async function DashboardLayout({
  children,
  params,
}: Readonly<DashboardLayoutProps>) {
  const { lang: langParam } = await params;
  const lang = isValidLocale(langParam) ? langParam : DEFAULT_LOCALE;

  // First-run gate: users who never completed the walkthrough are sent there.
  // Cheap single-column read; already-onboarded users (seeds/backfill) pass
  // straight through.
  const session = await getSession();
  if (session?.userId) {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { onboardingCompletedAt: true },
    });
    if (user?.onboardingCompletedAt === null) {
      redirect(`/${lang}/onboarding`);
    }
  }

  const common = await getDictionary(lang, 'common');
  const navigation = common.navigation as Record<string, string>;

  return (
    <div className="min-h-screen bg-app">
      {/* Desktop: Sidebar Left */}
      <DashboardSidebar
        lang={lang}
        navigationLabels={navigation}
        logoutLabel={get(common, 'navigation.logout')}
        loggingOutLabel={get(common, 'navigation.loggingOut')}
        expandLabel={get(common, 'navigation.expandSidebar')}
        collapseLabel={get(common, 'navigation.collapseSidebar')}
      />

      {/* Main Content Area */}
      {/* z-0 removed: it created a stacking context that trapped AccountFullDetail below the sidebar */}
      <main className="md:ml-(--sidebar-width) min-h-screen pb-20 md:pb-0 border-l border-white/10 transition-all duration-300">
        <div className="container mx-auto max-w-[1920px] px-3 py-4 sm:px-4 md:px-6 md:py-6">
          {children}
        </div>
      </main>

      {/* Mobile: Bottom Bar */}
      <DashboardBottomBar lang={lang} navigationLabels={navigation} />
    </div>
  );
}
