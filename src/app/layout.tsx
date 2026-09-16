import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import { getLocaleFromCookie } from '@/lib/i18n-cookies';
import './globals.css';

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocaleFromCookie();

  return (
    <html lang={locale} suppressHydrationWarning className={poppins.variable}>
      <body className={`${poppins.className} antialiased`}>{children}</body>
    </html>
  );
}
