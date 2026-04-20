/**
 * Register Page (Server Component)
 * Loads translations and renders auth client in register mode
 */

import AuthClient from '@/components/auth/AuthClient';
import { getDictionary } from '@/lib/i18n';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import type { Locale } from '@/lib/i18n';

interface RegisterPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function RegisterPage({ params }: Readonly<RegisterPageProps>) {
  const { lang } = await params;

  const [auth, common] = await Promise.all([
    getDictionary(lang, 'auth'),
    getDictionary(lang, 'common'),
  ]);

  return (
    <div className="min-h-screen relative">
      <div className="absolute top-4 right-4 z-50">
        <LanguageSelector
          currentLocale={lang}
          labels={{
            es: common.language?.spanish as string,
            en: common.language?.english as string,
            de: common.language?.german as string,
          }}
        />
      </div>
      <AuthClient lang={lang} auth={auth} common={common} initialMode="register" />
    </div>
  );
}
