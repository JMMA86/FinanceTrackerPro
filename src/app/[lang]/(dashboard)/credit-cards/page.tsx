import { redirect } from 'next/navigation';
import type { Locale } from '@/lib/i18n';

interface CreditCardsPageProps {
  params: Promise<{ lang: Locale }>;
}

/**
 * Credit cards now live inside the Accounts page. This route is kept only as a
 * backward-compatible alias that redirects to /accounts.
 */
export default async function CreditCardsPage({ params }: Readonly<CreditCardsPageProps>) {
  const { lang } = await params;
  redirect(`/${lang}/accounts`);
}
