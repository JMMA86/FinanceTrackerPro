import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { LandingCtaContent } from './types';

interface LandingFinalCtaProps {
  lang: Locale;
  cta: LandingCtaContent;
}

export function LandingFinalCta({ lang, cta }: Readonly<LandingFinalCtaProps>) {
  return (
    <section aria-labelledby="final-cta-title" className="px-4 pb-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-3xl border border-blue-400/20 bg-gradient-to-br from-blue-600/20 via-indigo-600/10 to-transparent p-8 shadow-2xl sm:p-12 lg:p-16">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />

        <div className="relative mx-auto max-w-2xl text-center">
          <h2
            id="final-cta-title"
            className="text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl"
          >
            {cta.title}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-200 sm:text-base">
            {cta.description}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={`/${lang}/register`}
              className="btn-primary min-h-6 w-full px-6 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
            >
              {cta.primary}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/${lang}/login`}
              className="btn-secondary min-h-6 w-full px-6 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:w-auto"
            >
              {cta.secondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
