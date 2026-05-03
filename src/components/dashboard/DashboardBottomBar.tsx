'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mobileNavigationItems } from '@/config/navigation';
import type { Locale } from '@/lib/i18n';

interface DashboardBottomBarProps {
  lang: Locale;
  navigationLabels: Record<string, string>;
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
                flex items-center justify-center w-12 h-12 rounded-xl
                transition-all duration-200
                ${isActive ? 'bg-theme-primary text-white rounded-xl shadow-theme-glow' : 'text-gray-400 hover:text-gray-300'}
              `}
              title={navigationLabels[item.descKey] || item.descKey}
            >
              <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform`} />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
