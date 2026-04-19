/**
 * Auth Layout
 * Minimal wrapper - pages handle their own layout
 */

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication - FinanceTrackerPro',
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
