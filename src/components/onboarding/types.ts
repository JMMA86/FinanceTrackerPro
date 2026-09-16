import type { Currency } from '@prisma/client';

/** Account created during the walkthrough, carried from step 1 to step 2. */
export interface OnboardingAccountSummary {
  id: string;
  name: string;
  currency: Currency;
}
