/**
 * Settings Page
 * User preferences including language selection
 */

import SettingsClient from './SettingsClient';
import { getDictionary, get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

interface SettingsPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function SettingsPage({ params }: Readonly<SettingsPageProps>) {
  const { lang } = await params;

  const [settings, common] = await Promise.all([
    getDictionary(lang, 'settings'),
    getDictionary(lang, 'common'),
  ]);

  return (
    <SettingsClient
      lang={lang}
      settings={settings}
      languageLabels={{
        es: get(common, 'language.spanish'),
        en: get(common, 'language.english'),
        de: get(common, 'language.german'),
      }}
    />
  );
}
