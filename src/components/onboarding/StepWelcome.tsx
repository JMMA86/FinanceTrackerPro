'use client';

import { Check, Languages } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { t, interpolate } from './i18n-helpers';

interface LanguageOption {
  locale: Locale;
  /** Key under `common.language.*`. */
  labelKey: string;
  flag: string;
}

const LANGUAGE_OPTIONS: readonly LanguageOption[] = [
  { locale: 'es', labelKey: 'spanish', flag: '🇪🇸' },
  { locale: 'en', labelKey: 'english', flag: '🇬🇧' },
];

interface StepWelcomeProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  titleId: string;
  dictionary: Record<string, unknown>;
  /** `common` dictionary — language labels live under `language.*`. */
  common: Record<string, unknown>;
  userName: string;
  currentLocale: Locale;
  /** Persists the choice via `changeLanguageAction` + `updateOnboardingPreferences`. */
  onLanguageChange: (locale: Locale) => void;
  isSaving: boolean;
  error: string | null;
}

/** Step 0 — animated greeting, walkthrough overview and language selection. */
export function StepWelcome({
  headingRef,
  titleId,
  dictionary,
  common,
  userName,
  currentLocale,
  onLanguageChange,
  isSaving,
  error,
}: Readonly<StepWelcomeProps>) {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="text-theme-gradient text-glow animate-text-reveal text-2xl font-bold focus:outline-none sm:text-3xl"
        >
          {t(dictionary, 'steps.welcome.title')}
        </h2>
        <p
          className="animate-scale-in inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-base font-semibold text-theme-primary-light"
          style={{ animationDelay: '120ms' }}
        >
          {interpolate(t(dictionary, 'steps.welcome.greeting'), { name: userName })}
        </p>
        <p
          className="animate-fadeIn text-sm leading-relaxed text-slate-300"
          style={{ animationDelay: '220ms' }}
        >
          {t(dictionary, 'steps.welcome.intro')}
        </p>
      </div>

      <ul className="animate-stagger space-y-2">
        {['bullet1', 'bullet2', 'bullet3'].map((key, index) => (
          <li key={key} className="flex items-center gap-3 text-sm text-slate-200">
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-xs font-semibold text-blue-300"
            >
              {index + 1}
            </span>
            {t(dictionary, `steps.welcome.${key}`)}
          </li>
        ))}
      </ul>

      <fieldset
        className="space-y-3 transition-opacity duration-200"
        disabled={isSaving}
        aria-busy={isSaving}
      >
        <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-200">
          <Languages className="h-4 w-4 text-blue-400" aria-hidden="true" />
          {t(dictionary, 'steps.welcome.languageLabel')}
          {isSaving && (
            <span className="animate-fadeIn text-xs font-normal text-slate-400">
              {t(dictionary, 'steps.welcome.languageSaving')}
            </span>
          )}
        </legend>

        <div className="animate-stagger grid grid-cols-1 gap-3 sm:grid-cols-2">
          {LANGUAGE_OPTIONS.map(({ locale, labelKey, flag }) => {
            const isSelected = currentLocale === locale;
            return (
              <label
                key={locale}
                className={`hover-lift group relative flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 ${
                  isSelected
                    ? 'border-blue-400/70 bg-blue-500/15 shadow-[0_0_30px_-8px_rgba(59,130,246,0.9)]'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                } ${isSaving ? 'cursor-wait opacity-60' : ''}`}
              >
                <input
                  type="radio"
                  name="onboarding-language"
                  value={locale}
                  checked={isSelected}
                  onChange={() => onLanguageChange(locale)}
                  disabled={isSaving}
                  className="peer sr-only"
                />
                <span className="text-2xl" aria-hidden="true">
                  {flag}
                </span>
                <span className="relative z-10 flex-1 text-sm font-semibold text-white">
                  {t(common, `language.${labelKey}`)}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors duration-200 ${
                    isSelected
                      ? 'animate-check-pop bg-blue-500 text-white'
                      : 'bg-white/10 text-transparent'
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-transparent transition-[box-shadow] duration-200 peer-checked:ring-blue-400/70 peer-focus-visible:ring-blue-300 peer-disabled:opacity-60"
                />
              </label>
            );
          })}
        </div>

        <p className="text-xs text-slate-500">{t(dictionary, 'steps.welcome.languageHint')}</p>
      </fieldset>

      {error && (
        <p
          role="alert"
          className="animate-fadeIn rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}
    </section>
  );
}
