/**
 * Register Page (Server Component)
 * Loads translations and renders auth client in register mode
 */

import AuthClient from '@/components/auth/AuthClient';
import AuthPageLayout from '@/components/auth/AuthPageLayout';
import { getDictionary, get } from '@/lib/i18n';
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
    <AuthPageLayout
      lang={lang}
      languageLabels={{
        es: get(common, 'language.spanish'),
        en: get(common, 'language.english'),
      }}
    >
      <AuthClient
        lang={lang}
        auth={auth}
        common={common}
        initialMode="register"
        isRegistered={false}
      />
    </AuthPageLayout>
  );
}
