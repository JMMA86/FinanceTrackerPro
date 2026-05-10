import type { Locale } from '@/lib/i18n';

interface InvestmentsPageProps {
  params: Promise<{ lang: Locale }>;
}

export default async function InvestmentsPage({ params }: Readonly<InvestmentsPageProps>) {
  await params;

  return (
    <div className="space-y-6">
      <div className="app-shell rounded-2xl p-6">
        <p className="text-gray-400">In development...</p>
      </div>
    </div>
  );
}
