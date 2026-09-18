'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Target, Wallet } from 'lucide-react';
import {
  getProjectionSettings,
  getSalaryConfiguration,
  saveProjectionSettings,
  saveSalaryConfiguration,
} from '@/actions/salary.actions';
import type { SalaryConfigurationData } from '@/actions/salary.actions';
import type { SaveSalaryConfigurationInput } from '@/actions/salary.schema';
import { get, localeToBCP47 } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { FormattedNumericInput } from '@/components/ui/FormattedNumericInput';
import { SalaryForm } from './SalaryForm';
import type { SalaryFormSubmitResult } from './SalaryForm';

type LoadState = 'loading' | 'ready' | 'error';

interface Feedback {
  kind: 'success' | 'error';
  message: string;
}

interface SalarySettingsSectionProps {
  readonly dictionary: Record<string, unknown>;
  readonly lang: Locale;
}

/** Maps a Server Action failure to a localized, non-technical message. */
function resolveActionError(
  code: string | undefined,
  dictionary: Record<string, unknown>,
  fallbackKey: string
): string {
  if (code === 'SESSION_INVALID' || code === 'UNAUTHORIZED') {
    return get(dictionary, 'salary.sessionInvalid');
  }
  return get(dictionary, fallbackKey);
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

/**
 * Settings section for the salary/bonus configuration plus the monthly savings
 * target (COP-only by product decision). Loads the persisted target on mount,
 * saves it through the salary Server Action and surfaces success/errors through
 * a live region.
 */
export function SalarySettingsSection({ dictionary, lang }: Readonly<SalarySettingsSectionProps>) {
  const locale = localeToBCP47(lang);
  // Stable translator: wrapping it keeps the `useCallback` save handlers from
  // re-creating on every render (exhaustive-deps).
  const t = useCallback((key: string) => get(dictionary, key), [dictionary]);

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [configuration, setConfiguration] = useState<SalaryConfigurationData | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [salaryFeedback, setSalaryFeedback] = useState<Feedback | null>(null);
  // Persisted value (source for the "not configured" notice) and the editable draft.
  const [targetCents, setTargetCents] = useState(0);
  const [targetDraft, setTargetDraft] = useState(0);
  const [targetFeedback, setTargetFeedback] = useState<Feedback | null>(null);
  const [isSavingTarget, setIsSavingTarget] = useState(false);

  // Initial load (and retries, driven by `reloadKey`). No synchronous setState
  // in the effect body: the request state changes only after the reads resolve
  // (React discourages cascading renders from effects).
  useEffect(() => {
    let active = true;

    void (async () => {
      const [salaryResult, targetResult] = await Promise.all([
        getSalaryConfiguration({}),
        getProjectionSettings({}),
      ]);

      if (!active) return;

      if (
        !salaryResult.success ||
        !targetResult.success ||
        !salaryResult.data ||
        !targetResult.data
      ) {
        setLoadState('error');
        return;
      }

      setConfiguration(salaryResult.data.configuration);
      setTargetCents(targetResult.data.monthlySavingsTargetCents);
      setTargetDraft(targetResult.data.monthlySavingsTargetCents);
      setLoadState('ready');
    })();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const handleRetry = useCallback(() => {
    setLoadState('loading');
    setReloadKey((key) => key + 1);
  }, []);

  const handleSaveSalary = useCallback(
    async (input: SaveSalaryConfigurationInput): Promise<SalaryFormSubmitResult> => {
      setSalaryFeedback(null);

      const result = await saveSalaryConfiguration(input);

      if (result.success && result.data) {
        setConfiguration(result.data.configuration);
        // Re-seed the form with the persisted state (server-assigned bonus ids)
        // so a second save updates the same rows instead of recreating them.
        setFormVersion((version) => version + 1);
        setSalaryFeedback({ kind: 'success', message: t('salary.saved') });
        return { success: true };
      }

      const message = resolveActionError(result.code, dictionary, 'salary.saveError');
      setSalaryFeedback({ kind: 'error', message });
      return { success: false, error: message };
    },
    [dictionary, t]
  );

  const handleSaveTarget = useCallback(async () => {
    setIsSavingTarget(true);
    setTargetFeedback(null);

    const result = await saveProjectionSettings({
      monthlySavingsTargetCents: targetDraft,
      currency: 'COP',
    });

    setIsSavingTarget(false);

    if (result.success && result.data) {
      // Re-seed from the authoritative persisted value (server rounding/validation).
      setTargetCents(result.data.monthlySavingsTargetCents);
      setTargetDraft(result.data.monthlySavingsTargetCents);
      setTargetFeedback({ kind: 'success', message: t('salary.target.saved') });
      return;
    }

    setTargetFeedback({
      kind: 'error',
      message: resolveActionError(result.code, dictionary, 'salary.target.error'),
    });
  }, [targetDraft, dictionary, t]);

  const isTargetUnset = targetCents === 0 && !targetFeedback;

  return (
    <div className="app-shell rounded-2xl p-6">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <Wallet className="h-6 w-6 text-emerald-400" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="mb-1 text-xl font-bold text-white">{t('salary.title')}</h2>
          <p className="mb-4 text-sm text-gray-400">{t('salary.description')}</p>

          {loadState === 'loading' && (
            <div
              role="status"
              aria-live="polite"
              className="animate-pulse space-y-3"
              aria-label={t('salary.loading')}
            >
              <div className="h-10 rounded-xl bg-white/5" />
              <div className="h-10 rounded-xl bg-white/5" />
              <div className="h-24 rounded-xl bg-white/5" />
            </div>
          )}

          {loadState === 'error' && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3"
            >
              <span className="flex items-center gap-2 text-sm text-red-300">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {t('salary.loadError')}
              </span>
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                {t('salary.retry')}
              </button>
            </div>
          )}

          {loadState === 'ready' && (
            <div className="space-y-5">
              {!configuration && (
                <p className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
                  {t('salary.notConfigured')}
                </p>
              )}

              <SalaryForm
                key={`${configuration?.id ?? 'none'}-${formVersion}`}
                dictionary={dictionary}
                prefix="salary.form"
                locale={locale}
                idPrefix="settings-salary"
                initialConfiguration={configuration}
                onSubmit={handleSaveSalary}
              />

              <FeedbackAlert feedback={salaryFeedback} />

              {/* Savings target — monthly, COP-only by product decision. */}
              <div className="border-t border-white/8 pt-5">
                <div className="mb-3 flex items-start gap-3">
                  <div className="rounded-xl bg-indigo-500/10 p-2.5">
                    <Target className="h-5 w-5 text-indigo-300" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white">{t('salary.target.title')}</h3>
                    <p className="text-xs text-slate-400">{t('salary.target.description')}</p>
                  </div>
                </div>

                {isTargetUnset && (
                  <p className="mb-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-slate-300">
                    {t('salary.target.notConfigured')}
                  </p>
                )}

                <div className="max-w-xl">
                  <label htmlFor="settings-savings-target" className={labelCls}>
                    {t('salary.target.amountLabel')}
                  </label>
                  <FormattedNumericInput
                    id="settings-savings-target"
                    value={targetDraft}
                    onChange={setTargetDraft}
                    locale={locale}
                    aria-describedby="settings-savings-target-hint"
                    className={`${inputCls} font-mono tabular-nums`}
                  />
                </div>

                <p id="settings-savings-target-hint" className="mt-2 text-xs text-slate-400">
                  {t('salary.target.hint')}
                </p>

                <button
                  type="button"
                  onClick={() => void handleSaveTarget()}
                  disabled={isSavingTarget}
                  aria-busy={isSavingTarget}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSavingTarget ? t('salary.target.saving') : t('salary.target.save')}
                </button>

                <FeedbackAlert feedback={targetFeedback} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Inline success/error alert; errors are announced assertively. */
function FeedbackAlert({ feedback }: Readonly<{ feedback: Feedback | null }>) {
  if (!feedback) return null;

  if (feedback.kind === 'error') {
    return (
      <p
        role="alert"
        className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
      >
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {feedback.message}
      </p>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300"
    >
      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {feedback.message}
    </p>
  );
}
