import { SUPPORTED_LOCALES } from '@/lib/i18n';
import { ToastViewport } from '@/components/ui/ToastViewport';

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map((lang) => ({ lang }));
}

export default async function LangLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  return (
    <>
      {children}
      {/* Global toast notifications (client) — covers auth + dashboard routes */}
      <ToastViewport />
    </>
  );
}
