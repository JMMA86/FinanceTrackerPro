'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { navigationItems } from '@/config/navigation';

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 md:z-50">
      {/* Sidebar Container */}
      <div
        className="flex flex-col flex-1 border-r backdrop-blur-xl"
        style={{
          borderColor: 'color-mix(in srgb, var(--theme-accent) 24%, transparent)',
          backgroundColor: 'color-mix(in srgb, var(--app-bg-mid) 88%, transparent)',
        }}
      >
        {/* Logo / Brand */}
        <div
          className="flex items-center h-16 px-6 border-b"
          style={{
            borderColor: 'color-mix(in srgb, var(--theme-accent) 18%, transparent)',
          }}
        >
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl text-lg shadow-lg"
            style={{
              background:
                'linear-gradient(135deg, var(--theme-primary), var(--theme-primary-light))',
            }}
          >
            <span className="font-bold text-white">FT</span>
          </div>
          <span className="ml-3 text-lg font-bold text-theme-gradient">FinanceTracker</span>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-hide">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl
                  transition-all duration-200
                  ${
                    isActive
                      ? 'bg-theme-primary text-white shadow-theme-glow'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }
                `}
                title={item.description}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div
          className="p-3 border-t"
          style={{
            borderColor: 'color-mix(in srgb, var(--theme-accent) 18%, transparent)',
          }}
        >
          <button
            className="
              flex items-center gap-3 w-full px-4 py-3 text-sm font-medium
              text-red-400 hover:text-red-300 hover:bg-red-500/10
              rounded-xl transition-all duration-200
            "
          >
            <LogOut className="w-5 h-5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
