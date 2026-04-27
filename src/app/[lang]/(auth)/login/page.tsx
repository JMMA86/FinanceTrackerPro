/**
 * Login Page (Server Component)
 * Loads translations and renders auth client in login mode
 */

import AuthClient from '@/components/auth/AuthClient';
import AuthPageLayout from '@/components/auth/AuthPageLayout';
import { getDictionary } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

interface LoginPageProps {
  params: Promise<{ lang: Locale }>;
  searchParams: Promise<{ registered?: string; redirect?: string }>;
}

export default async function LoginPage({ params, searchParams }: Readonly<LoginPageProps>) {
  const { lang } = await params;
  const query = await searchParams;

  const [auth, common] = await Promise.all([
    getDictionary(lang, 'auth'),
    getDictionary(lang, 'common'),
  ]);

  return (
    <AuthPageLayout
      lang={lang}
      languageLabels={{
        es: common.language?.spanish as string,
        en: common.language?.english as string,
        de: common.language?.german as string,
      }}
    >
      <AuthClient
        lang={lang}
        auth={auth}
        common={common}
        initialMode="login"
        isRegistered={query.registered === 'true'}
        redirectPath={query.redirect}
      />
    </AuthPageLayout>
  );
}
