import { redirect } from 'next/navigation';
import { getLocaleFromCookie } from '@/lib/i18n-cookies';

export default async function HomePage() {
  const locale = await getLocaleFromCookie();
  redirect(`/${locale}/login`);
}
