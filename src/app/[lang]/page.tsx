import type { Metadata } from 'next';
import { DEFAULT_LOCALE, get, getDictionary, isValidLocale, localeToBCP47 } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { SmoothAnchorScroll } from '@/components/landing/SmoothAnchorScroll';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingStats } from '@/components/landing/LandingStats';
import { LandingFeatures } from '@/components/landing/LandingFeatures';
import { LandingBenefits } from '@/components/landing/LandingBenefits';
import { LandingSteps } from '@/components/landing/LandingSteps';
import { LandingSecurity } from '@/components/landing/LandingSecurity';
import { LandingFaq } from '@/components/landing/LandingFaq';
import { LandingFinalCta } from '@/components/landing/LandingFinalCta';
import { LandingFooter } from '@/components/landing/LandingFooter';
import type {
  LanguageLabels,
  LandingBenefitsContent,
  LandingCtaContent,
  LandingFaqContent,
  LandingFeaturesContent,
  LandingFooterContent,
  LandingHeroContent,
  LandingNav,
  LandingSecurityContent,
  LandingStatsContent,
  LandingStepsContent,
} from '@/components/landing/types';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://financetrackerpro.com';

interface LandingPageProps {
  params: Promise<{ lang: string }>;
}

function resolveLocale(langParam: string): Locale {
  return isValidLocale(langParam) ? langParam : DEFAULT_LOCALE;
}

export async function generateMetadata({ params }: LandingPageProps): Promise<Metadata> {
  const { lang: langParam } = await params;
  const lang = resolveLocale(langParam);
  const landing = await getDictionary(lang, 'landing');

  const title = get(landing, 'meta.title');
  const description = get(landing, 'meta.description');
  const ogLocale = localeToBCP47(lang).replace('-', '_');

  return {
    metadataBase: new URL(BASE_URL),
    title,
    description,
    alternates: {
      canonical: `/${lang}`,
      languages: {
        es: '/es',
        en: '/en',
        'x-default': '/es',
      },
    },
    openGraph: {
      title,
      description,
      url: `/${lang}`,
      siteName: 'FinanceTrackerPro',
      locale: ogLocale,
      type: 'website',
      images: [
        {
          url: '/icon.png',
          width: 295,
          height: 295,
          alt: 'FinanceTrackerPro',
        },
      ],
    },
  };
}

export default async function LandingPage({ params }: Readonly<LandingPageProps>) {
  const { lang: langParam } = await params;
  const lang = resolveLocale(langParam);

  const [landing, common] = await Promise.all([
    getDictionary(lang, 'landing'),
    getDictionary(lang, 'common'),
  ]);

  const languageLabels: LanguageLabels = {
    es: get(common, 'language.spanish'),
    en: get(common, 'language.english'),
  };

  const nav = landing.nav as LandingNav;
  const hero = landing.hero as LandingHeroContent;
  const stats = landing.stats as LandingStatsContent;
  const features = landing.features as LandingFeaturesContent;
  const benefits = landing.benefits as LandingBenefitsContent;
  const steps = landing.steps as LandingStepsContent;
  const security = landing.security as LandingSecurityContent;
  const faq = landing.faq as LandingFaqContent;
  const cta = landing.cta as LandingCtaContent;
  const footer = landing.footer as LandingFooterContent;

  return (
    <div className="min-h-screen bg-app text-slate-100">
      <SmoothAnchorScroll />

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        {get(landing, 'skipToContent')}
      </a>

      <LandingHeader lang={lang} nav={nav} languageLabels={languageLabels} />

      <main id="main-content">
        <LandingHero lang={lang} hero={hero} />
        <LandingStats stats={stats} />
        <LandingFeatures features={features} />
        <LandingBenefits benefits={benefits} />
        <LandingSteps steps={steps} />
        <LandingSecurity security={security} />
        <LandingFaq faq={faq} />
        <LandingFinalCta lang={lang} cta={cta} />
      </main>

      <LandingFooter lang={lang} nav={nav} footer={footer} languageLabels={languageLabels} />
    </div>
  );
}
