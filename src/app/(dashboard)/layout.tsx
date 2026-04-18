import type { Metadata } from 'next';
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar';
import { DashboardBottomBar } from '@/components/dashboard/DashboardBottomBar';

export const metadata: Metadata = {
  title: 'Dashboard | FinanceTrackerPro',
  description: 'Banking-grade financial management system',
};

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-app">
      {/* Desktop: Sidebar Left */}
      <DashboardSidebar />

      {/* Main Content Area */}
      <main className="md:ml-64 min-h-screen pb-20 md:pb-0">
        <div className="container mx-auto max-w-[1920px] px-3 py-4 sm:px-4 md:px-6 md:py-6">
          {children}
        </div>
      </main>

      {/* Mobile: Bottom Bar */}
      <DashboardBottomBar />
    </div>
  );
}
