'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ChevronLeft, ChevronRight } from 'lucide-react';
import { navigationItems } from '@/config/navigation';
import { logoutAction } from '@/actions/auth.actions';
import { useState, useEffect, useLayoutEffect } from 'react';
import type { Locale } from '@/lib/i18n';

interface DashboardSidebarProps {
  readonly lang: Locale;
  readonly navigationLabels: Readonly<Record<string, string>>;
  readonly logoutLabel: string;
  readonly loggingOutLabel: string;
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
  // Always start expanded so server and client first renders match (no hydration error).
  // useLayoutEffect syncs the CSS var from localStorage before the browser paints (zero flash).
  // React state syncs on the next frame via rAF to satisfy react-hooks/set-state-in-effect.
  const [collapsed, setCollapsed] = useState(false);

  useLayoutEffect(() => {
    const stored = localStorage.getItem('sidebar_collapsed') === 'true';
    // Update CSS var synchronously — this drives layout, preventing flash
    document.documentElement.style.setProperty(
      '--sidebar-width',
      stored ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded,
    );
    if (stored) {
      // setState inside a callback satisfies react-hooks/set-state-in-effect
      const id = requestAnimationFrame(() => setCollapsed(true));
      return () => cancelAnimationFrame(id);
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded,
    );
  }, [collapsed]);

  function toggleSidebar() {
    const newCollapsed = !collapsed;
    setCollapsed(newCollapsed);
    localStorage.setItem('sidebar_collapsed', String(newCollapsed));
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logoutAction(lang);
    router.push(`/${lang}/login`);
  }

  // Use CSS var for layout-critical dimensions so the CSS var (set synchronously)
  // drives the visual layout while React state catches up on the next frame.
  const cssWidth = 'var(--sidebar-width, 17rem)';

  return (
    <>
      {/* Toggle Button — outside aside's stacking context so it stays above overlays */}
      <button
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        className="hidden md:flex fixed top-20 w-6 h-6 bg-gray-700 hover:bg-gray-600 rounded-full items-center justify-center transition-all duration-300 border border-white/10 z-[70] cursor-pointer hover:scale-110 active:scale-95"
        style={{ left: `calc(${cssWidth} - 0.75rem)` }}
      >
        <span className="block transition-transform duration-300">
          {collapsed ? (
            <ChevronRight className="w-4 h-4 text-gray-300" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-gray-300" />
          )}
        </span>
      </button>

      <aside
        className={`hidden md:flex md:flex-col md:fixed md:inset-y-0 md:z-[55] transition-all duration-300`}
        style={{ width: cssWidth }}
      >
        <div
          className="flex flex-col flex-1 border-r backdrop-blur-md"
          style={{
            backgroundColor: 'rgba(12, 30, 68, 0.4)',
            borderColor: 'rgba(255, 255, 255, 0.10)',
          }}
        >
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

          <nav className="flex-1 px-3 py-2 overflow-y-auto scrollbar-hide">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.endsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={`/${lang}${item.href}`}
                  aria-current={isActive ? 'page' : undefined}
                  className={`
                  group relative flex items-center gap-3 px-4 py-3.5 rounded-xl
                  transition-all duration-200
                  ${isActive
                      ? 'bg-theme-primary/20 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }
                `}
                  title={navigationLabels[item.descKey] || item.descKey}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                      style={{
                        background: 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 50%, #2563eb 100%)',
                        boxShadow: '0 0 12px rgba(59, 130, 246, 0.6)',
                      }}
                      aria-hidden="true"
                    />
                  )}

                  <span className={`relative flex-shrink-0 transition-transform duration-200 ${isActive ? 'scale-105' : 'group-hover:-translate-y-0.5'}`}>
                    <Icon
                      className={`w-5 h-5 transition-all duration-200 ${isActive ? 'text-blue-400 drop-shadow-lg' : 'text-gray-400 group-hover:text-white'}`}
                    />
                    <span className="absolute -top-1 -right-1 w-1.5 h-1 rounded-full bg-blue-400/0 group-hover:bg-blue-400 group-hover:animate-ping transition-all duration-200" />
                  </span>

                  <span
                    className={`text-sm font-medium whitespace-nowrap transition-all duration-200 ${collapsed ? 'opacity-0 max-w-0' : 'opacity-100 max-w-full'}`}
                  >
                    {navigationLabels[item.nameKey] || item.nameKey}
                  </span>

                  {isActive && (
                    <span
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{
                        boxShadow: '0 0 20px rgba(59, 130, 246, 0.3), inset 0 0 20px rgba(59, 130, 246, 0.1)',
                      }}
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </nav>

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
    </>
  );
}
