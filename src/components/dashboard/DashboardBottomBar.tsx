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
      className="md:hidden fixed bottom-0 left-0 right-0 z-[65] border-t backdrop-blur-xl"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--app-bg-mid) 78%, transparent)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="flex justify-around items-center h-16 px-1">
        {mobileNavigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname.endsWith(item.href);
          const label = navigationLabels[item.nameKey] || item.nameKey;

          return (
            <Link
              key={item.href}
              href={`/${lang}${item.href}`}
              className={`
                group relative flex flex-col items-center justify-center gap-1
                w-14 h-full rounded-xl
                transition-all duration-200
                ${isActive ? 'text-white' : 'text-gray-500 hover:text-gray-300'}
              `}
              title={navigationLabels[item.descKey] || item.descKey}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full"
                  style={{
                    background: 'linear-gradient(90deg, transparent, #60a5fa, transparent)',
                    boxShadow: '0 0 8px rgba(59, 130, 246, 0.6)',
                  }}
                  aria-hidden="true"
                />
              )}

              {isActive && (
                <span
                  className="absolute inset-1 rounded-xl bg-blue-500/10"
                  aria-hidden="true"
                />
              )}

              <Icon
                className={`relative z-10 w-5 h-5 transition-all duration-200 ${isActive ? 'text-blue-400' : 'group-hover:text-gray-200'}`}
              />
              <span
                className={`relative z-10 text-[10px] font-medium leading-none transition-colors duration-200 ${isActive ? 'text-blue-300' : 'text-gray-500 group-hover:text-gray-300'}`}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
