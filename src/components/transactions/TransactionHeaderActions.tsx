'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Tags, ArrowLeftRight, CreditCard as CreditCardIcon } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { NewTransactionButton } from '@/components/transactions/NewTransactionButton';
import { CreateTransactionModal } from '@/components/transactions/CreateTransactionModal';
import { CategoryManagerModal } from '@/components/transactions/CategoryManagerModal';
import { TransferModal } from '@/components/transactions/TransferModal';
import { PayCreditCardModal } from '@/components/credit-cards/PayCreditCardModal';
import { hasAnyValidPair } from '@/components/transactions/transferRules';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { AccountBrief, CategoryBrief } from '@/components/transactions/types';
import type { CreditCard } from '@/components/credit-cards/credit-card.types';

interface TransactionHeaderActionsProps {
  /** Transactions dictionary (used by create/transfer/category modals). */
  dictionary: Record<string, unknown>;
  /** Credit-cards dictionary (used by the pay-card modal). */
  creditCardsDictionary: Record<string, unknown>;
  accounts: AccountBrief[];
  /** Full credit card data — used for the pay-card modal and mapped to AccountBrief for the transaction selector. */
  creditCards: CreditCard[];
  categories: CategoryBrief[];
  hasAccounts: boolean;
  lang: Locale;
  userId: string;
  locale?: string;
}

/**
 * Client-owned header actions for the transactions page.
 *
 * DECISION (documented): the category manager modal and the transfer modal are
 * controlled with local state here instead of the global Zustand store. This
 * keeps the modals decoupled from the UI store — they are only mounted on this
 * page and their open state has no cross-page meaning. The pay-card modal
 * follows the same local-state pattern.
 */
export function TransactionHeaderActions({
  dictionary,
  creditCardsDictionary,
  accounts,
  creditCards,
  categories,
  hasAccounts,
  lang,
  userId,
  locale = 'es-CO',
}: Readonly<TransactionHeaderActionsProps>) {
  const router = useRouter();
  const addNotification = useUIStore((s) => s.addNotification);
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isPayCardOpen, setIsPayCardOpen] = useState(false);

  const openCategoryManager = useCallback(() => setIsCategoryManagerOpen(true), []);
  const closeCategoryManager = useCallback(() => setIsCategoryManagerOpen(false), []);
  const handleCategoriesChanged = useCallback(() => {
    router.refresh();
  }, [router]);

  const openTransfer = useCallback(() => setIsTransferOpen(true), []);
  const closeTransfer = useCallback(() => setIsTransferOpen(false), []);

  // Guard: opening the pay-card modal only makes sense when at least one card
  // has an outstanding debt. When every card is paid off, inform the user and
  // keep the modal closed.
  const openPayCard = useCallback(() => {
    if (creditCards.length === 0) return;
    if (creditCards.every((c) => c.debtCents <= 0)) {
      addNotification('info', get(dictionary, 'noDebtsToPay'));
      return;
    }
    setIsPayCardOpen(true);
  }, [creditCards, dictionary, addNotification]);

  const closePayCard = useCallback(() => setIsPayCardOpen(false), []);

  // A transfer requires at least one valid pair per the pocket contract (the
  // server is the source of truth; this hides the button when no pair exists).
  const canTransfer = hasAnyValidPair(accounts);

  // Credit cards are offered as EXPENSE accounts in the transaction modal, but
  // NEVER as transfer sources (the server rejects cards there).
  const cardBriefs = useMemo<AccountBrief[]>(
    () =>
      creditCards.map((c) => ({
        id: c.id,
        name: c.name,
        currency: c.currency,
        type: 'CREDIT_CARD',
        parentAccountId: null,
        balanceCents: c.balanceCents, // negative = debt
        creditLimitCents: c.creditLimitCents,
        availableCreditCents: c.availableCreditCents,
      })),
    [creditCards]
  );
  const allAccounts = useMemo(() => [...accounts, ...cardBriefs], [accounts, cardBriefs]);

  // Paying a card requires at least one bank account as the funding source.
  const canPayCard = creditCards.length > 0 && hasAccounts;

  return (
    <>
      <div className="flex items-center gap-2">
        {hasAccounts && <NewTransactionButton dictionary={dictionary} />}
        {canTransfer && (
          <button
            type="button"
            onClick={openTransfer}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'transferButton')}
          </button>
        )}
        {canPayCard && (
          <button
            type="button"
            onClick={openPayCard}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <CreditCardIcon className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'payCardButton')}
          </button>
        )}
        <button
          type="button"
          onClick={openCategoryManager}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/10 text-white text-sm font-semibold hover:bg-white/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <Tags className="w-4 h-4" aria-hidden="true" />
          {get(dictionary, 'manageCategories')}
        </button>
      </div>

      <CreateTransactionModal
        accounts={allAccounts}
        categories={categories}
        dictionary={dictionary}
        lang={lang}
        locale={locale}
        onOpenCategoryManager={openCategoryManager}
      />

      <TransferModal
        open={isTransferOpen}
        accounts={accounts}
        userId={userId}
        dictionary={dictionary}
        locale={locale}
        onClose={closeTransfer}
      />

      <PayCreditCardModal
        open={isPayCardOpen}
        cards={creditCards}
        dictionary={creditCardsDictionary}
        locale={locale}
        onClose={closePayCard}
      />

      <CategoryManagerModal
        open={isCategoryManagerOpen}
        categories={categories}
        dictionary={dictionary}
        onClose={closeCategoryManager}
        onChanged={handleCategoriesChanged}
      />
    </>
  );
}
