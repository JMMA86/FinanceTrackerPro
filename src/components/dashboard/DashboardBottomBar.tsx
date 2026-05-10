'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mobileNavigationItems } from '@/config/navigation';
import type { Locale } from '@/lib/i18n';

interface DashboardBottomBarProps {
  readonly lang: Locale;
  readonly navigationLabels: Readonly<Record<string, string>>;
}

export function DashboardBottomBar({ lang, navigationLabels }: Readonly<DashboardBottomBarProps>) {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--app-bg-mid) 78%, transparent)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
      }}
    >
      <div className="flex justify-around items-center h-16 px-2">
        {mobileNavigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.endsWith(item.href);

          return (
            <Link
              key={item.href}
              href={`/${lang}${item.href}`}
              className={`
                group relative flex items-center justify-center w-12 h-12 rounded-xl
                transition-all duration-200
                ${isActive ? 'text-white' : 'text-gray-400 hover:text-gray-300'}
              `}
              title={navigationLabels[item.descKey] || item.descKey}
              aria-current={isActive ? 'page' : undefined}
            >
              {/* Active indicator - top bar */}
              {isActive && (
                <span 
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)',
                    boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)',
                  }}
                  aria-hidden="true"
                />
              )}

              {/* Icon with scale animation */}
              <Icon 
                className={`w-6 h-6 transition-all duration-200 ${isActive ? 'text-blue-400 scale-110 drop-shadow-lg' : 'group-hover:scale-105'}`} 
              />

              {/* Active glow background */}
              {isActive && (
                <span 
                  className="absolute inset-0 rounded-xl bg-theme-primary/20"
                  style={{
                    boxShadow: '0 0 15px rgba(59, 130, 246, 0.3)',
                  }}
                  aria-hidden="true"
                />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
