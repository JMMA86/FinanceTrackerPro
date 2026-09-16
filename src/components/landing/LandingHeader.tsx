import Image from 'next/image';
import Link from 'next/link';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import { LandingMobileNav } from './LandingMobileNav';
import type { Locale } from '@/lib/i18n';
import type { LanguageLabels, LandingNav } from './types';

interface LandingHeaderProps {
  lang: Locale;
  nav: LandingNav;
  languageLabels: LanguageLabels;
}

const ANCHORS = ['features', 'benefits', 'security', 'faq'] as const;

export function LandingHeader({ lang, nav, languageLabels }: Readonly<LandingHeaderProps>) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Link
          href={`/${lang}`}
          aria-label={nav.homeLabel}
          className="flex shrink-0 items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <Image
            src="/icon.png"
            alt=""
            width={36}
            height={36}
            priority
            className="h-9 w-9 rounded-lg"
          />
          <span className="hidden text-base font-bold tracking-tight text-white sm:inline">
            FinanceTrackerPro
          </span>
        </Link>

        <nav aria-label={nav.mainNavLabel} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {ANCHORS.map((anchor) => (
              <li key={anchor}>
                <Link
                  href={`#${anchor}`}
                  className="inline-flex min-h-6 items-center rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {nav[anchor]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <div className="hidden sm:block">
            <LanguageSelector currentLocale={lang} labels={languageLabels} />
          </div>

          <Link
            href={`/${lang}/login`}
            className="hidden min-h-6 items-center rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 md:inline-flex"
          >
            {nav.login}
          </Link>

          <Link
            href={`/${lang}/register`}
            className="btn-primary min-h-6 whitespace-nowrap px-4 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            {nav.register}
          </Link>

          <LandingMobileNav lang={lang} nav={nav} />
        </div>
      </div>
    </header>
  );
}
