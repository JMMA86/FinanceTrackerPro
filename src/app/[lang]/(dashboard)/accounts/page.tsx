import type { Locale } from '@/lib/i18n';
import { getDictionary, get } from '@/lib/i18n';
import { getBankAccounts } from '@/actions/account.actions';
import { BankAccountsSection } from '@/components/accounts/BankAccountsSection';
import { CreateAccountModal } from '@/components/accounts/CreateAccountModal';
import { EditAccountModal } from '@/components/accounts/EditAccountModal';
import { DeleteConfirmModal } from '@/components/accounts/DeleteConfirmModal';
import type { AccountCardData } from '@/components/accounts/AccountCard';

interface AccountsPageProps {
  params: Promise<{ lang: Locale }>;
}

const LOCALE_MAP: Record<string, string> = {
  es: 'es-CO',
  en: 'en-US',
};

export default async function AccountsPage({ params }: Readonly<AccountsPageProps>) {
  const { lang } = await params;

  const [accountsRes, dictionary] = await Promise.all([
    getBankAccounts({} as Record<string, never>),
    getDictionary(lang, 'accounts'),
  ]);

  const accounts: AccountCardData[] =
    accountsRes.success && accountsRes.data ? (accountsRes.data as AccountCardData[]) : [];
  const locale = LOCALE_MAP[lang] ?? 'en-US';

  return (
    <div className="space-y-6">
      <BankAccountsSection accounts={accounts} dictionary={dictionary} locale={locale} />
      <CreateAccountModal accounts={accounts} dictionary={dictionary} />
      <EditAccountModal accounts={accounts} dictionary={dictionary} />
      <DeleteConfirmModal dictionary={dictionary} />

      <section className="app-shell rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            {get(dictionary, 'sections.investments') as string}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Próximamente</p>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-white/5 px-2.5 py-1 rounded-full">
          En desarrollo
        </span>
      </section>

      <section className="app-shell rounded-2xl p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white">
            {get(dictionary, 'sections.creditCards') as string}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">Próximamente</p>
        </div>
        <span className="text-xs font-medium text-slate-500 bg-white/5 px-2.5 py-1 rounded-full">
          En desarrollo
        </span>
      </section>
    </div>
  );
}
