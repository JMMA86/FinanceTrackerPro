import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOnboardingState } from '@/actions/onboarding.actions';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { DEFAULT_LOCALE, getDictionary, get, isValidLocale } from '@/lib/i18n';

interface OnboardingPageProps {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: OnboardingPageProps): Promise<Metadata> {
  const { lang: langParam } = await params;
  const lang = isValidLocale(langParam) ? langParam : DEFAULT_LOCALE;
  const onboarding = await getDictionary(lang, 'onboarding');
  const title = get(onboarding, 'meta.title');
  const description = get(onboarding, 'meta.description');

  return {
    title: `${title} | FinanceTrackerPro`,
    description,
    // Private, per-user flow — never index.
    robots: { index: false, follow: false },
  };
}

/**
 * First-run onboarding page (Server Component).
 *
 * Guards: unauthenticated users are bounced to login, already-onboarded users
 * go straight to the dashboard. The walkthrough itself is a client component
 * driven by the persisted `step`.
 */
export default async function OnboardingPage({ params }: Readonly<OnboardingPageProps>) {
  const { lang: langParam } = await params;
  const lang = isValidLocale(langParam) ? langParam : DEFAULT_LOCALE;

  const stateResult = await getOnboardingState({});

  if (!stateResult.success || !stateResult.data) {
    redirect(`/${lang}/login`);
  }

  if (stateResult.data.completed) {
    redirect(`/${lang}/dashboard`);
  }

  const [onboarding, common] = await Promise.all([
    getDictionary(lang, 'onboarding'),
    getDictionary(lang, 'common'),
  ]);

  return (
    <OnboardingWizard
      lang={lang}
      onboarding={onboarding}
      common={common}
      initialStep={stateResult.data.step}
      userName={stateResult.data.name}
      initialBaseCurrency={stateResult.data.baseCurrency}
      initialAccountsCount={stateResult.data.accountsCount}
    />
  );
}
