'use client';

import { Check, Minus } from 'lucide-react';
import type { Currency } from '@prisma/client';
import type { Locale } from '@/lib/i18n';
import type { OnboardingAccountSummary } from './types';
import { t } from './i18n-helpers';

interface StepFinishProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  titleId: string;
  dictionary: Record<string, unknown>;
  /** `common` dictionary — language labels live under `language.*`. */
  common: Record<string, unknown>;
  baseCurrency: Currency;
  account: OnboardingAccountSummary | null;
  lang: Locale;
  /** Whether an ACTIVE salary configuration exists when the walkthrough ends. */
  salaryConfigured: boolean;
}

interface SummaryRow {
  label: string;
  value: string;
  done: boolean;
}

/** Step 3 — animated summary of what the user configured during the walkthrough. */
export function StepFinish({
  headingRef,
  titleId,
  dictionary,
  common,
  baseCurrency,
  account,
  lang,
  salaryConfigured,
}: Readonly<StepFinishProps>) {
  const no = t(dictionary, 'steps.finish.no');
  const languageLabel = t(common, `language.${lang === 'en' ? 'english' : 'spanish'}`);
  const languageFlag = lang === 'en' ? '🇬🇧' : '🇪🇸';
  // Extracted so the translated currency name is not built by a nested template literal.
  const currencyName = t(dictionary, `currency.${baseCurrency}`);

  const rows: SummaryRow[] = [
    {
      label: t(dictionary, 'steps.finish.language'),
      value: `${languageFlag} ${languageLabel}`,
      done: true,
    },
    {
      label: t(dictionary, 'steps.finish.account'),
      value: account ? account.name : no,
      done: account !== null,
    },
    {
      label: t(dictionary, 'steps.finish.currency'),
      value: `${baseCurrency} · ${currencyName}`,
      done: true,
    },
    {
      label: t(dictionary, 'steps.finish.salary'),
      value: salaryConfigured ? t(dictionary, 'steps.finish.yes') : no,
      done: salaryConfigured,
    },
  ];

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="text-theme-gradient text-glow animate-text-reveal text-2xl font-bold focus:outline-none sm:text-3xl"
        >
          {t(dictionary, 'steps.finish.title')}
        </h2>
        <p
          className="animate-fadeIn text-sm leading-relaxed text-slate-300"
          style={{ animationDelay: '150ms' }}
        >
          {t(dictionary, 'steps.finish.subtitle')}
        </p>
      </div>

      {/* Contained celebration: SVG ring draws itself, check pops, finite glow. */}
      <div className="flex justify-center">
        <div className="animate-celebrate-glow relative flex h-20 w-20 items-center justify-center rounded-full">
          <svg viewBox="0 0 64 64" className="h-20 w-20 -rotate-90" aria-hidden="true">
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="rgba(16, 185, 129, 0.25)"
              strokeWidth="4"
            />
            <circle
              cx="32"
              cy="32"
              r="26"
              fill="none"
              stroke="rgb(52, 211, 153)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="164"
              className="animate-ring-draw"
            />
          </svg>
          <Check
            className="animate-check-pop absolute h-8 w-8 text-emerald-300"
            aria-hidden="true"
          />
        </div>
      </div>

      <div className="animate-card-enter rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t(dictionary, 'steps.finish.summaryTitle')}
        </h3>
        <dl className="animate-stagger space-y-3">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0"
            >
              <dt className="text-sm text-slate-300">{row.label}</dt>
              <dd className="flex items-center gap-2 text-sm font-semibold text-white">
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    row.done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/10 text-slate-400'
                  }`}
                >
                  {row.done ? (
                    <Check className="animate-check-pop h-3 w-3" />
                  ) : (
                    <Minus className="h-3 w-3" />
                  )}
                </span>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
