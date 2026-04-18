'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mobileNavigationItems } from '@/config/navigation';

export function DashboardBottomBar() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-xl"
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 24%, transparent)',
        backgroundColor: 'color-mix(in srgb, var(--app-bg-mid) 92%, transparent)',
      }}
    >
      <div className="flex justify-around items-center h-16 px-2">
        {mobileNavigationItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-xl
                transition-all duration-200 min-w-[60px]
                ${isActive ? 'text-theme-primary' : 'text-gray-400 hover:text-gray-300'}
              `}
              title={item.description}
            >
              <Icon className={`w-6 h-6 ${isActive ? 'scale-110' : ''} transition-transform`} />
              <span className="text-[10px] font-medium truncate max-w-full">
                {item.name.split(' ')[0]}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
