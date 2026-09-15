import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { AnimatedBackground } from '@/components/auth/AnimatedBackground';
import type { Locale } from '@/lib/i18n';
import type { LandingHeroContent } from './types';

interface LandingHeroProps {
  lang: Locale;
  hero: LandingHeroContent;
}

/** Decorative, deterministic bar heights (percentages) for the preview sparkline. */
const CHART_BARS = [34, 48, 42, 58, 52, 70, 64, 86] as const;

export function LandingHero({ lang, hero }: Readonly<LandingHeroProps>) {
  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <AnimatedBackground />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-10 lg:px-8 lg:py-24">
        <div className="animate-slideUp">
          <p className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-blue-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            {hero.badge}
          </p>

          <h1
            id="hero-title"
            className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            {hero.titleLead}{' '}
            <span className="text-theme-gradient text-glow">{hero.titleHighlight}</span>
          </h1>

          <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            {hero.subtitle}
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href={`/${lang}/register`}
              className="btn-primary min-h-6 w-full px-6 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
            >
              {hero.ctaPrimary}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/${lang}/login`}
              className="btn-secondary min-h-6 w-full px-6 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
            >
              {hero.ctaSecondary}
            </Link>
          </div>

          <div className="mt-11">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              {hero.trustLabel}
            </p>
            <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
              {hero.trust.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <figure className="relative animate-card-enter">
          <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-tr from-blue-600/25 via-indigo-500/10 to-transparent blur-2xl" />

            <div className="relative rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl backdrop-blur-xl animate-float-vertical sm:p-6">
              <div className="mb-6 flex items-center gap-2.5">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                </span>
                <p className="text-sm font-semibold text-slate-200">{hero.preview.title}</p>
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    {hero.preview.balanceLabel}
                  </p>
                  <p className="mt-1 text-3xl font-bold text-white sm:text-4xl">
                    {hero.preview.balanceValue}
                  </p>
                </div>
                <p className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {hero.preview.trend}
                </p>
              </div>

              <div className="mt-7">
                <p className="text-xs font-medium text-slate-400">{hero.preview.chartLabel}</p>
                <div className="mt-3 flex h-20 items-end gap-1.5">
                  {CHART_BARS.map((bar, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-t bg-gradient-to-t from-blue-600/30 to-blue-400/80"
                      style={{ height: `${bar}%` }}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-7 border-t border-white/10 pt-5">
                <p className="text-xs font-medium text-slate-400">{hero.preview.accountsLabel}</p>
                <ul className="mt-4 space-y-3.5">
                  {hero.preview.accounts.map((account) => (
                    <li key={account.name} className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2.5 text-sm text-slate-200">
                        <span className="h-2 w-2 rounded-full bg-blue-400" />
                        {account.name}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-white">{account.value}</span>
                        <span
                          className={`text-xs font-semibold ${
                            account.tone === 'negative' ? 'text-rose-300' : 'text-emerald-300'
                          }`}
                        >
                          {account.delta}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <figcaption className="sr-only">{hero.preview.ariaLabel}</figcaption>
        </figure>
      </div>
    </section>
  );
}
