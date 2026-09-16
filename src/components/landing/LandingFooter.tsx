import Image from 'next/image';
import Link from 'next/link';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import type { Locale } from '@/lib/i18n';
import type { LanguageLabels, LandingFooterContent, LandingNav } from './types';

interface LandingFooterProps {
  lang: Locale;
  nav: LandingNav;
  footer: LandingFooterContent;
  languageLabels: LanguageLabels;
}

const ANCHORS = ['features', 'benefits', 'security', 'faq'] as const;

export function LandingFooter({ lang, nav, footer, languageLabels }: Readonly<LandingFooterProps>) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-slate-950/70">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="max-w-sm">
            <Link
              href={`/${lang}`}
              aria-label={nav.homeLabel}
              className="inline-flex items-center gap-2 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <Image src="/icon.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
              <span className="text-base font-bold tracking-tight text-white">
                FinanceTrackerPro
              </span>
            </Link>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">{footer.tagline}</p>
          </div>

          <nav aria-label={nav.productNavLabel}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {footer.product}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {ANCHORS.map((anchor) => (
                <li key={anchor}>
                  <Link
                    href={`#${anchor}`}
                    className="inline-flex min-h-6 items-center rounded text-sm text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    {nav[anchor]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label={nav.accountNavLabel}>
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {footer.account}
            </h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  href={`/${lang}/login`}
                  className="inline-flex min-h-6 items-center rounded text-sm text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {nav.login}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/register`}
                  className="inline-flex min-h-6 items-center rounded text-sm text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  {nav.register}
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-400">
            © {year} FinanceTrackerPro. {footer.rights}
          </p>
          <LanguageSelector currentLocale={lang} labels={languageLabels} />
        </div>
      </div>
    </footer>
  );
}
