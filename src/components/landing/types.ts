/**
 * Landing page view models.
 *
 * These types describe the shape of the `landing` i18n namespace. They are used
 * to safely narrow the untyped dictionary returned by `getDictionary()` without
 * resorting to `any` (project rule: strict TypeScript, no `any`).
 */

export interface LandingNav {
  features: string;
  benefits: string;
  security: string;
  faq: string;
  login: string;
  register: string;
  openMenu: string;
  closeMenu: string;
  mainNavLabel: string;
  productNavLabel: string;
  accountNavLabel: string;
  homeLabel: string;
}

export interface LandingPreviewAccount {
  name: string;
  value: string;
  delta: string;
  tone: string;
}

export interface LandingHeroPreview {
  ariaLabel: string;
  title: string;
  balanceLabel: string;
  balanceValue: string;
  trend: string;
  chartLabel: string;
  accountsLabel: string;
  accounts: LandingPreviewAccount[];
}

export interface LandingHeroContent {
  badge: string;
  titleLead: string;
  titleHighlight: string;
  subtitle: string;
  ctaPrimary: string;
  ctaSecondary: string;
  trustLabel: string;
  trust: string[];
  preview: LandingHeroPreview;
}

export interface LandingStatItem {
  value: string;
  label: string;
}

export interface LandingStatsContent {
  title: string;
  items: LandingStatItem[];
}

export interface LandingFeatureItem {
  icon: string;
  title: string;
  description: string;
}

export interface LandingSectionContent {
  eyebrow: string;
  title: string;
  subtitle: string;
}

export interface LandingFeaturesContent extends LandingSectionContent {
  items: LandingFeatureItem[];
}

export interface LandingBenefitItem {
  icon: string;
  title: string;
  description: string;
}

export interface LandingBenefitsContent extends LandingSectionContent {
  items: LandingBenefitItem[];
}

export interface LandingStepItem {
  title: string;
  description: string;
}

export interface LandingStepsContent extends LandingSectionContent {
  items: LandingStepItem[];
}

export interface LandingControlItem {
  icon: string;
  title: string;
  description: string;
}

export interface LandingSecurityContent {
  eyebrow: string;
  title: string;
  description: string;
  controls: LandingControlItem[];
  note: string;
}

export interface LandingFaqItem {
  question: string;
  answer: string;
}

export interface LandingFaqContent extends LandingSectionContent {
  items: LandingFaqItem[];
}

export interface LandingCtaContent {
  title: string;
  description: string;
  primary: string;
  secondary: string;
}

export interface LandingFooterContent {
  tagline: string;
  product: string;
  account: string;
  rights: string;
}

export interface LandingMetaContent {
  title: string;
  description: string;
}

export interface LanguageLabels {
  es: string;
  en: string;
}
