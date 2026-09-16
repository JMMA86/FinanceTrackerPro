import type { Locale } from '@/lib/i18n';
import { getDictionary } from '@/lib/i18n';
import { getBankAccounts } from '@/actions/account.actions';
import { getCreditCards } from '@/actions/credit-card.actions';
import { BankAccountsSection } from '@/components/accounts/BankAccountsSection';
import { CreateAccountModal } from '@/components/accounts/CreateAccountModal';
import { EditAccountModal } from '@/components/accounts/EditAccountModal';
import { DeleteConfirmModal } from '@/components/accounts/DeleteConfirmModal';
import { CreditCardsSection } from '@/components/credit-cards/CreditCardsSection';
import type { AccountCardData } from '@/components/accounts/AccountCard';
import type { CreditCard } from '@/components/credit-cards/credit-card.types';

interface AccountsPageProps {
  params: Promise<{ lang: Locale }>;
}

const LOCALE_MAP: Record<string, string> = {
  es: 'es-CO',
  en: 'en-US',
};

export default async function AccountsPage({ params }: Readonly<AccountsPageProps>) {
  const { lang } = await params;

  const [accountsRes, cardsRes, accountsDict, creditCardsDict] = await Promise.all([
    getBankAccounts({} as Record<string, never>),
    getCreditCards({}),
    getDictionary(lang, 'accounts'),
    getDictionary(lang, 'credit-cards'),
  ]);

  const accounts: AccountCardData[] =
    accountsRes.success && accountsRes.data ? (accountsRes.data as AccountCardData[]) : [];
  const cards: CreditCard[] =
    cardsRes.success && cardsRes.data ? (cardsRes.data as CreditCard[]) : [];
  const locale = LOCALE_MAP[lang] ?? 'en-US';

  return (
    <div className="space-y-6">
      <BankAccountsSection accounts={accounts} dictionary={accountsDict} locale={locale} />
      <CreateAccountModal accounts={accounts} dictionary={accountsDict} />
      <EditAccountModal accounts={accounts} dictionary={accountsDict} />
      <DeleteConfirmModal dictionary={accountsDict} />

      <CreditCardsSection cards={cards} dictionary={creditCardsDict} locale={locale} />
    </div>
  );
}
