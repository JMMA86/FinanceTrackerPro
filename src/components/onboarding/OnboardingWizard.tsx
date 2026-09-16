'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, Wallet } from 'lucide-react';
import type { Currency } from '@prisma/client';
import {
  completeOnboarding,
  saveOnboardingStep,
  updateOnboardingPreferences,
} from '@/actions/onboarding.actions';
import { changeLanguageAction } from '@/actions/language.actions';
import { ONBOARDING_STEPS, ONBOARDING_TOTAL_STEPS } from '@/lib/onboarding/steps';
import type { OnboardingStep } from '@/lib/onboarding/steps';
import type { Locale } from '@/lib/i18n';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { AnimatedBackground } from '@/components/auth/AnimatedBackground';
import { OnboardingProgress } from './OnboardingProgress';
import { StepWelcome } from './StepWelcome';
import { StepFirstAccount } from './StepFirstAccount';
import { StepExploreModules } from './StepExploreModules';
import { StepFinish } from './StepFinish';
import type { OnboardingAccountSummary } from './types';
import { t, interpolate } from './i18n-helpers';

const LAST_STEP = ONBOARDING_TOTAL_STEPS - 1;
const STEP_HEADING_ID = 'onboarding-step-heading';
/** Splash lifetime — kept in sync with `.onboarding-splash` in globals.css. */
const SPLASH_DURATION_MS = 1400;

type StepDirection = 'forward' | 'backward';

interface OnboardingWizardProps {
  lang: Locale;
  onboarding: Record<string, unknown>;
  common: Record<string, unknown>;
  /** Persisted step from the server, already clamped by the page. */
  initialStep: number;
  userName: string;
  initialBaseCurrency: Currency;
  initialAccountsCount: number;
}

function clampStep(step: number): number {
  if (!Number.isInteger(step)) return 0;
  return Math.min(Math.max(step, 0), LAST_STEP);
}

/**
 * Primary CTA label: the last step swaps between the idle CTA and the
 * in-flight "finishing" copy, every other step uses the shared "next" label.
 */
function getPrimaryActionLabel(
  isLastStep: boolean,
  isCompleting: boolean,
  onboarding: Record<string, unknown>
): string {
  if (!isLastStep) {
    return t(onboarding, 'buttons.next');
  }
  if (isCompleting) {
    return t(onboarding, 'buttons.finishing');
  }
  return t(onboarding, 'steps.finish.cta');
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void): () => void {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function getReducedMotionSnapshot(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

/**
 * Client orchestrator for the 4-step first-run walkthrough.
 *
 * Responsibilities: own the current step, persist progress (`saveOnboardingStep`),
 * keep the account created in step 1 for the summary, switch the UI language
 * (`changeLanguageAction` + `updateOnboardingPreferences`) and close the flow
 * (`completeOnboarding` + redirect). Each step is a dumb child that reports its
 * outcome back through callbacks.
 *
 * Motion lives in CSS (see the `ONBOARDING WIZARD ANIMATIONS` block in
 * `globals.css`): a decorative splash on first mount, a re-keyed container that
 * slides in the travel direction, and staggered reveals inside each step.
 */
export function OnboardingWizard({
  lang,
  onboarding,
  common,
  initialStep,
  userName,
  initialBaseCurrency,
  initialAccountsCount,
}: Readonly<OnboardingWizardProps>) {
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(() => clampStep(initialStep));
  const [direction, setDirection] = useState<StepDirection>('forward');
  const [baseCurrency] = useState<Currency>(initialBaseCurrency);
  const [selectedLocale, setSelectedLocale] = useState<Locale>(lang);
  const [isSavingLanguage, setIsSavingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [account, setAccount] = useState<OnboardingAccountSummary | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [skipOpen, setSkipOpen] = useState(false);
  const [splashDismissed, setSplashDismissed] = useState(false);

  // Stable idempotency key for the whole session: retries reuse the same UUID.
  const [accountIdempotencyKey] = useState(() => crypto.randomUUID());

  const headingRef = useRef<HTMLHeadingElement>(null);
  const isFirstRender = useRef(true);

  // Reduced-motion preference via an external store (no setState-in-effect).
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot
  );
  const showSplash = !prefersReducedMotion && !splashDismissed;

  // Decorative splash: auto-dismisses. Skipped entirely for reduced-motion users
  // (the CSS also hides it so there is never a first-frame flash).
  useEffect(() => {
    if (prefersReducedMotion) return undefined;

    const timer = window.setTimeout(() => setSplashDismissed(true), SPLASH_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [prefersReducedMotion]);

  // Move focus to the step heading whenever the step changes (WCAG 2.4.3).
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [currentStep]);

  const stepLabels = useMemo(
    () =>
      Object.fromEntries(
        ONBOARDING_STEPS.map((step) => [step, t(onboarding, `stepper.${step}`)])
      ) as Record<OnboardingStep, string>,
    [onboarding]
  );

  const progressLabel = interpolate(t(onboarding, 'progress.stepOf'), {
    current: currentStep + 1,
    total: ONBOARDING_TOTAL_STEPS,
  });

  const announcement = interpolate(t(onboarding, 'progress.announce'), {
    current: currentStep + 1,
    total: ONBOARDING_TOTAL_STEPS,
    title: t(onboarding, `steps.${ONBOARDING_STEPS[currentStep]}.title`),
  });

  const isLastStep = currentStep === LAST_STEP;

  function goToStep(next: number) {
    const clamped = clampStep(next);
    if (clamped === currentStep) return;
    setDirection(clamped > currentStep ? 'forward' : 'backward');
    setCurrentStep(clamped);
    void saveOnboardingStep({ step: clamped });
  }

  /**
   * Switches the UI language: persists the cookie (`changeLanguageAction`), the
   * user preference (`User.language`, used by the server for localized copy) and
   * then re-enters the wizard on the new `/[lang]` route. The current step is
   * persisted first so the reload resumes exactly where the user left off.
   */
  async function handleLanguageChange(nextLocale: Locale) {
    setLanguageError(null);
    setSelectedLocale(nextLocale);
    setIsSavingLanguage(true);

    const language = nextLocale === 'en' ? 'ENGLISH' : 'SPANISH';

    const [preferencesResult, cookieResult] = await Promise.all([
      updateOnboardingPreferences({ language }),
      changeLanguageAction({ locale: nextLocale }),
    ]);

    if (!preferencesResult.success || !cookieResult.success) {
      const failureCode = preferencesResult.code ?? cookieResult.code;
      setIsSavingLanguage(false);
      setSelectedLocale(lang);
      setLanguageError(
        failureCode === 'SESSION_INVALID' || failureCode === 'UNAUTHORIZED'
          ? t(onboarding, 'errors.sessionInvalid')
          : t(onboarding, 'errors.languageUpdateFailed')
      );
      return;
    }

    await saveOnboardingStep({ step: currentStep });

    // No `router.refresh()` here: pushing to a different `/[lang]` route already
    // fetches fresh RSC output, and the `locale` cookie was set by the Server
    // Action. An immediate refresh races the push and cancels the navigation,
    // leaving the previous language rendered.
    router.push(`/${nextLocale}/onboarding`);
  }

  async function finish() {
    setSkipOpen(false);
    setCompleteError(null);
    setIsCompleting(true);

    const result = await completeOnboarding({});

    if (!result.success) {
      setIsCompleting(false);
      setCompleteError(
        result.code === 'SESSION_INVALID' || result.code === 'UNAUTHORIZED'
          ? t(onboarding, 'errors.sessionInvalid')
          : t(onboarding, 'errors.completeFailed')
      );
      return;
    }

    // `completeOnboarding` already runs `revalidatePath('/[lang]/dashboard')`, so
    // the navigation itself picks up fresh data; refreshing here would race the push.
    router.push(`/${lang}/dashboard`);
  }

  function handleBack() {
    if (currentStep === 0 || isCompleting) return;
    goToStep(currentStep - 1);
  }

  function handleNext() {
    if (isCompleting) return;
    if (isLastStep) {
      void finish();
      return;
    }
    goToStep(currentStep + 1);
  }

  function renderStep() {
    switch (ONBOARDING_STEPS[currentStep]) {
      case 'welcome':
        return (
          <StepWelcome
            headingRef={headingRef}
            titleId={STEP_HEADING_ID}
            dictionary={onboarding}
            common={common}
            userName={userName}
            currentLocale={selectedLocale}
            onLanguageChange={handleLanguageChange}
            isSaving={isSavingLanguage}
            error={languageError}
          />
        );
      case 'account':
        return (
          <StepFirstAccount
            headingRef={headingRef}
            titleId={STEP_HEADING_ID}
            dictionary={onboarding}
            baseCurrency={baseCurrency}
            idempotencyKey={accountIdempotencyKey}
            createdAccount={account}
            hasExistingAccounts={initialAccountsCount > 0}
            onCreated={setAccount}
          />
        );
      case 'modules':
        return (
          <StepExploreModules
            headingRef={headingRef}
            titleId={STEP_HEADING_ID}
            dictionary={onboarding}
            common={common}
          />
        );
      case 'finish':
        return (
          <StepFinish
            headingRef={headingRef}
            titleId={STEP_HEADING_ID}
            dictionary={onboarding}
            common={common}
            baseCurrency={baseCurrency}
            account={account}
            lang={selectedLocale}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className="bg-app relative flex min-h-screen flex-col overflow-hidden">
      {/* Decorative animated backdrop (infinite motion stays behind the content) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <AnimatedBackground />
        <div className="animate-float-vertical absolute top-1/4 -left-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div
          className="animate-float-vertical absolute -right-20 bottom-1/4 h-80 w-80 rounded-full bg-indigo-500/15 blur-3xl"
          style={{ animationDelay: '-2.5s' }}
        />
      </div>
      <div className="grid-overlay" aria-hidden="true" />

      <header className="relative z-10 border-b border-white/10 bg-white/5 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-white sm:text-xl">
              {t(onboarding, 'title')}
            </h1>
            <p className="hidden text-xs text-slate-400 sm:block">{t(onboarding, 'subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => setSkipOpen(true)}
            disabled={isCompleting}
            className="btn-secondary shrink-0 transition-transform duration-200 hover:-translate-y-0.5 disabled:opacity-50"
          >
            {t(onboarding, 'buttons.skip')}
          </button>
        </div>
        <div className="mx-auto w-full max-w-4xl px-4 pb-4 sm:px-6">
          <OnboardingProgress
            current={currentStep}
            labels={stepLabels}
            ariaLabel={t(onboarding, 'progress.ariaLabel')}
          />
          <p className="animate-fadeIn mt-2 text-xs font-medium text-slate-400">{progressLabel}</p>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="animate-card-enter rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur-md sm:p-8">
            {/* Re-keyed per step: forward slides in from the right, back from the left. */}
            <div
              key={ONBOARDING_STEPS[currentStep]}
              className={
                direction === 'backward' ? 'step-transition-backward' : 'step-transition-forward'
              }
            >
              {renderStep()}
            </div>
          </div>

          {completeError && (
            <p
              role="alert"
              className="animate-fadeIn mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {completeError}
            </p>
          )}
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/10 bg-white/5 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 0 || isCompleting}
            className="btn-secondary transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t(onboarding, 'buttons.back')}
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={isCompleting}
            aria-busy={isCompleting}
            className="btn-primary group relative min-w-[9rem] overflow-hidden disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLastStep && (
              <span
                aria-hidden="true"
                className="animate-gradient-sweep pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-2">
              {getPrimaryActionLabel(isLastStep, isCompleting, onboarding)}
              {isLastStep && !isCompleting && (
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              )}
            </span>
          </button>
        </div>
      </footer>

      {/* Polite announcement of the current step for screen readers */}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {/* Decorative splash intro — auto-dismisses, never blocks pointer or focus. */}
      {showSplash && (
        <div
          aria-hidden="true"
          className="onboarding-splash pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md"
        >
          <div className="flex flex-col items-center gap-4">
            <div className="splash-mark shadow-theme-glow relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-blue-500/30 to-indigo-600/20">
              <Wallet className="h-9 w-9 text-white" aria-hidden="true" />
              <span className="splash-sweep pointer-events-none absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
            </div>
            <p className="splash-mark text-2xl font-bold tracking-tight text-white">
              {t(onboarding, 'splash.brand')}
            </p>
            <p className="splash-tagline text-sm text-slate-300">
              {t(onboarding, 'splash.tagline')}
            </p>
          </div>
        </div>
      )}

      <ModalDialog
        open={skipOpen}
        titleId="onboarding-skip-title"
        title={t(onboarding, 'skip.title')}
        dictionary={onboarding}
        onClose={() => setSkipOpen(false)}
        variant="confirm"
        maxWidth="max-w-sm"
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20">
          <AlertTriangle className="h-6 w-6 text-amber-400" aria-hidden="true" />
        </div>
        <h2
          id="onboarding-skip-title"
          className="mb-2 text-center text-base font-semibold text-white"
        >
          {t(onboarding, 'skip.title')}
        </h2>
        <p className="mb-5 text-center text-sm leading-relaxed text-slate-300">
          {t(onboarding, 'skip.message')}
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSkipOpen(false)}
            disabled={isCompleting}
            className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm font-semibold text-slate-300 transition-colors duration-200 hover:bg-white/5 disabled:opacity-50"
          >
            {t(onboarding, 'skip.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void finish()}
            disabled={isCompleting}
            className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-amber-500 disabled:opacity-50"
          >
            {isCompleting ? t(onboarding, 'buttons.finishing') : t(onboarding, 'skip.confirm')}
          </button>
        </div>
      </ModalDialog>
    </div>
  );
}
