/**
 * Onboarding walkthrough steps (shared contract).
 *
 * This module is intentionally framework-agnostic: it has NO `server-only`
 * import so both Server Actions (`src/actions/onboarding.actions.ts`) and the
 * client walkthrough UI can import the exact same step list and length.
 */

export const ONBOARDING_STEPS = ['welcome', 'account', 'salary', 'modules', 'finish'] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_TOTAL_STEPS = ONBOARDING_STEPS.length;
