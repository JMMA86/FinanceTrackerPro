'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { navigationItems } from '@/config/navigation';
import { logoutAction } from '@/actions/auth.actions';
import { useState, useEffect } from 'react';
import type { Locale } from '@/lib/i18n';

interface DashboardSidebarProps {
  lang: Locale;
  navigationLabels: Record<string, string>;
  logoutLabel: string;
  loggingOutLabel: string;
}

const SIDEBAR_WIDTH = {
  expanded: '17rem',
  collapsed: '4.7rem',
};

export function DashboardSidebar({
  lang,
  navigationLabels,
  logoutLabel,
  loggingOutLabel,
}: Readonly<DashboardSidebarProps>) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (globalThis.window === undefined) return false;
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  const width = collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', width);
  }, [width]);

  function toggleSidebar() {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar_collapsed', String(newCollapsed));
    router.push(pathname, { scroll: false });
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logoutAction(lang);
    router.push(`/${lang}/login`);
  }

  return (
    <aside
      className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:z-50 transition-all duration-300`}
      style={{ width }}
    >
      {/* Sidebar Container */}
      <div
        className="flex flex-col flex-1 border-r backdrop-blur-md"
        style={{
          backgroundColor: 'rgba(12, 30, 68, 0.4)',
          borderColor: 'rgba(255, 255, 255, 0.10)',
        }}
      >
        {/* Logo / Brand */}
        <div
          className="flex items-center h-16"
          style={{
            boxShadow: 'inset 0 -1px 0 rgba(66, 132, 255, 0.20)',
          }}
        >
          <div className="flex items-center gap-3 px-4 w-full">
            <div className="relative w-10 h-10 flex-shrink-0">
              <Image
                src="/icon.png"
                alt="FinanceTrackerPro"
                className="object-contain"
                width={36}
                height={36}
              />
            </div>
            <span
              className={`text-lg font-bold text-theme-gradient whitespace-nowrap transition-all duration-200 ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}
            >
              FinanceTracker<span className="text-theme-primary">Pro</span>
            </span>
          </div>
        </div>

        {/* Toggle Button */}
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className="absolute top-20 -right-3 w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded-full flex items-center justify-center transition-all duration-200 border border-white/10 z-10 cursor-pointer"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-300" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-300" />
          )}
        </button>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 overflow-y-auto scrollbar-hide">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.endsWith(item.href);

            return (
              <Link
                key={item.href}
                href={`/${lang}${item.href}`}
                aria-current={isActive ? 'page' : undefined}
                className={`
                  flex items-center gap-3 px-4 py-4 rounded-xl
                  transition-all duration-200
                  ${
                    isActive
                      ? 'bg-theme-primary text-white shadow-theme-glow'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }
                `}
                title={navigationLabels[item.descKey] || item.descKey}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span
                  className={`text-sm font-medium whitespace-nowrap transition-all duration-200 ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}
                >
                  {navigationLabels[item.nameKey] || item.nameKey}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div
          className="px-3 py-4 border-t"
          style={{
            borderColor: 'rgba(255, 255, 255, 0.10)',
          }}
        >
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="
              flex items-center gap-3 px-4 w-full py-3 text-sm font-medium
              text-red-400 hover:text-red-300 hover:bg-red-500/10
              rounded-xl transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          >
            <LogOut className="w-5 h-5" />
            <span
              className={`transition-all duration-200 ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}
            >
              {loggingOut ? loggingOutLabel : logoutLabel}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
