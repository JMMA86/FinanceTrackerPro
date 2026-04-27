import { LanguageSelector } from '@/components/i18n/LanguageSelector';
import Image from 'next/image';
import type { Locale } from '@/lib/i18n';

interface AuthPageLayoutProps {
  lang: Locale;
  languageLabels: {
    es: string;
    en: string;
    de: string;
  };
  children: React.ReactNode;
}

export default function AuthPageLayout({
  lang,
  languageLabels,
  children,
}: Readonly<AuthPageLayoutProps>) {
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
        <LanguageSelector currentLocale={lang} labels={languageLabels} />
      </div>

      {children}
    </div>
  );
}
