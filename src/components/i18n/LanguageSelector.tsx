'use client';

/**
 * Language Selector Component
 * Minimal dropdown for switching between supported locales
 */

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { Globe } from 'lucide-react';
import { SUPPORTED_LOCALES } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

interface LanguageSelectorProps {
  currentLocale: Locale;
  labels: {
    es: string;
    en: string;
  };
}

export function LanguageSelector({ currentLocale, labels }: Readonly<LanguageSelectorProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  function handleLanguageChange(newLocale: Locale) {
    // Replace current locale in path with new one
    const currentPathWithoutLocale = pathname.replace(`/${currentLocale}`, '');
    const newPath = `/${newLocale}${currentPathWithoutLocale}`;
    setIsOpen(false);
    router.push(newPath);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold bg-slate-700 text-white hover:bg-slate-800 transition-all rounded-xl shadow-md hover:shadow-lg backdrop-blur-sm border border-slate-600/50"
        title="Select language"
      >
        <Globe className="w-4 h-4" />
        <span className="uppercase">{currentLocale}</span>
        <svg
          className={`w-3 h-3 ml-1 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-44 bg-gray-800 rounded-xl shadow-xl border border-gray-700 z-50 overflow-hidden animate-slideUp">
          {SUPPORTED_LOCALES.map((locale) => (
            <button
              key={locale}
              onClick={() => handleLanguageChange(locale)}
              className={`
                w-full px-4 py-3 text-left text-sm font-medium transition-all
                ${
                  locale === currentLocale
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-gray-300 hover:bg-gray-700'
                }
              `}
            >
              {labels[locale]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
