/**
 * Register Page (Server Component)
 * Loads translations and renders auth client in register mode
 */

import AuthClient from '@/components/auth/AuthClient';
import { getDictionary } from '@/lib/i18n';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import Image from 'next/image';
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
      {/* Logo superior izquierda */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 z-50 flex items-center gap-2 md:gap-3">
        <Image
          src="/icon.png"
          alt="FinanceTrackerPro"
          width={36}
          height={36}
          className="rounded-lg md:rounded-xl md:w-10 md:h-10"
        />
        <span className="text-base md:text-lg font-bold text-white">FinanceTrackerPro</span>
      </div>

      {/* Language selector superior derecha */}
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
