import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import '../globals.css';
import { SUPPORTED_LOCALES, type Locale } from '@/lib/i18n';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FinanceTrackerPro',
  description: 'Banking-grade financial management system',
};

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: Locale }>;
}>) {
  const { lang } = await params;

  return (
    <html lang={lang} className={poppins.variable}>
      <body className={`${poppins.className} antialiased`}>{children}</body>
    </html>
  );
}
