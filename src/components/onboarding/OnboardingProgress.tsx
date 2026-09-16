'use client';

import { Check } from 'lucide-react';
import { ONBOARDING_STEPS } from '@/lib/onboarding/steps';
import type { OnboardingStep } from '@/lib/onboarding/steps';

interface OnboardingProgressProps {
  /** Zero-based index of the active step. */
  current: number;
  /** Localized label per step. */
  labels: Readonly<Record<OnboardingStep, string>>;
  /** Accessible name for the progress navigation landmark. */
  ariaLabel: string;
}

/**
 * Circle styling for a step. Order matters: the active step wins over the
 * completed one, exactly as the previous nested ternary did.
 */
function getProgressCircleClass(isCurrent: boolean, isDone: boolean): string {
  if (isCurrent) {
    return 'border-blue-400/70 bg-blue-500/25 text-white shadow-[0_0_16px_-2px_rgba(59,130,246,0.8)]';
  }
  if (isDone) {
    return 'border-emerald-400/50 bg-emerald-500/20 text-emerald-300';
  }
  return 'border-white/10 bg-white/5 text-slate-400';
}

/**
 * Track fill styling for a step. Completed wins over active, matching the
 * previous nested ternary order.
 */
function getProgressBarClass(isCurrent: boolean, isDone: boolean): string {
  if (isDone) {
    return 'w-full bg-emerald-400/70';
  }
  if (isCurrent) {
    return 'w-2/3 bg-blue-500/80';
  }
  return 'w-0 bg-transparent';
}

/**
 * Accessible, animated stepper for the onboarding walkthrough.
 *
 * The active item is flagged with `aria-current="step"` (WCAG 1.3.1 / 4.1.2)
 * and completed items expose their state through a check icon that is hidden
 * from assistive tech — the label is always announced from the visible text.
 * Visual progress is a width/color transition plus a one-shot check "pop";
 * all motion is neutralized by the global `prefers-reduced-motion` block.
 */
export function OnboardingProgress({
  current,
  labels,
  ariaLabel,
}: Readonly<OnboardingProgressProps>) {
  return (
    <nav aria-label={ariaLabel}>
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {ONBOARDING_STEPS.map((step, index) => {
          const isCurrent = index === current;
          const isDone = index < current;

          return (
            <li
              key={step}
              aria-current={isCurrent ? 'step' : undefined}
              className="flex min-w-0 flex-1 flex-col gap-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-[background-color,border-color,box-shadow] duration-300 ${getProgressCircleClass(
                    isCurrent,
                    isDone
                  )}`}
                >
                  {isDone ? <Check className="animate-check-pop h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={`hidden truncate text-xs font-medium transition-colors duration-300 md:block ${
                    isCurrent ? 'animate-fadeIn text-white' : 'text-slate-400'
                  }`}
                >
                  {labels[step]}
                </span>
              </div>
              <span
                aria-hidden="true"
                className="relative h-1 w-full overflow-hidden rounded-full bg-white/10"
              >
                <span
                  className={`absolute inset-y-0 left-0 rounded-full transition-[width,background-color] duration-500 ease-out ${getProgressBarClass(
                    isCurrent,
                    isDone
                  )}`}
                />
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
