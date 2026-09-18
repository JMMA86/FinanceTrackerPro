'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { getSalaryConfiguration, saveSalaryConfiguration } from '@/actions/salary.actions';
import type { SalaryConfigurationData } from '@/actions/salary.actions';
import type { SaveSalaryConfigurationInput } from '@/actions/salary.schema';
import { localeToBCP47 } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { SalaryForm } from '@/components/settings/SalaryForm';
import type { SalaryFormHandle, SalaryFormSubmitResult } from '@/components/settings/SalaryForm';
import { t } from './i18n-helpers';

interface StepSalaryProps {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  titleId: string;
  dictionary: Record<string, unknown>;
  lang: Locale;
  /** Reports whether an ACTIVE salary configuration exists after this step. */
  onConfigured: (configured: boolean) => void;
  /**
   * Imperative handle so the wizard's own "Continue" CTA can save before
   * advancing (the form's built-in button remains available too).
   */
  submitRef?: React.RefObject<SalaryFormHandle | null>;
}

/**
 * Optional onboarding step: salary + bonuses.
 *
 * Reuses `SalaryForm` (same fields/validation as Settings) and persists through
 * `saveSalaryConfiguration`. The step NEVER blocks navigation: the wizard's
 * "Continue" button advances even when nothing was saved.
 */
export function StepSalary({
  headingRef,
  titleId,
  dictionary,
  lang,
  onConfigured,
  submitRef,
}: Readonly<StepSalaryProps>) {
  const [isLoading, setIsLoading] = useState(true);
  const [configuration, setConfiguration] = useState<SalaryConfigurationData | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Prefill from an existing configuration (e.g. resuming the walkthrough).
  useEffect(() => {
    let active = true;

    void (async () => {
      const result = await getSalaryConfiguration({});
      if (!active) return;
      const data = result.success ? result.data : undefined;
      setConfiguration(data?.configuration ?? null);
      setIsLoading(false);
      onConfigured(data?.configured ?? false);
    })();

    return () => {
      active = false;
    };
  }, [onConfigured]);

  async function handleSubmit(
    input: SaveSalaryConfigurationInput
  ): Promise<SalaryFormSubmitResult> {
    const result = await saveSalaryConfiguration(input);

    if (result.success && result.data) {
      setConfiguration(result.data.configuration);
      setIsSaved(true);
      onConfigured(true);
      return { success: true };
    }

    const isSessionError = result.code === 'SESSION_INVALID' || result.code === 'UNAUTHORIZED';
    return {
      success: false,
      error: t(dictionary, isSessionError ? 'errors.sessionInvalid' : 'errors.salarySaveFailed'),
    };
  }

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <h2
          ref={headingRef}
          id={titleId}
          tabIndex={-1}
          className="text-2xl font-bold text-white focus:outline-none sm:text-3xl"
        >
          {t(dictionary, 'steps.salary.title')}
        </h2>
        <p className="text-sm leading-relaxed text-slate-300">
          {t(dictionary, 'steps.salary.subtitle')}
        </p>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t(dictionary, 'steps.salary.optionalNote')}
      </p>

      {isSaved && (
        <div
          role="status"
          aria-live="polite"
          className="animate-scale-in flex flex-col items-start gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5"
        >
          <div className="flex items-center gap-2 text-emerald-300">
            <span className="animate-celebrate-glow flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="animate-check-pop h-5 w-5" aria-hidden="true" />
            </span>
            <p className="text-sm font-semibold">{t(dictionary, 'steps.salary.successTitle')}</p>
          </div>
          <p className="text-sm text-emerald-100">{t(dictionary, 'steps.salary.successMessage')}</p>
          <p className="text-xs text-slate-300">{t(dictionary, 'steps.salary.continueHint')}</p>
        </div>
      )}

      {isLoading ? (
        <p role="status" aria-live="polite" className="text-sm text-slate-400">
          {t(dictionary, 'steps.salary.loading')}
        </p>
      ) : (
        <SalaryForm
          dictionary={dictionary}
          prefix="steps.salary.form"
          locale={localeToBCP47(lang)}
          idPrefix="onboarding-salary"
          initialConfiguration={configuration}
          onSubmit={handleSubmit}
          submitRef={submitRef}
        />
      )}
    </section>
  );
}
