'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tags, ArrowLeftRight } from 'lucide-react';
import { NewTransactionButton } from '@/components/transactions/NewTransactionButton';
import { CreateTransactionModal } from '@/components/transactions/CreateTransactionModal';
import { CategoryManagerModal } from '@/components/transactions/CategoryManagerModal';
import { TransferModal } from '@/components/transactions/TransferModal';
import { hasAnyValidPair } from '@/components/transactions/transferRules';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { AccountBrief, CategoryBrief } from '@/components/transactions/types';

interface TransactionHeaderActionsProps {
  dictionary: Record<string, unknown>;
  accounts: AccountBrief[];
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
 * page and their open state has no cross-page meaning.
 */
export function TransactionHeaderActions({
  dictionary,
  accounts,
  categories,
  hasAccounts,
  lang,
  userId,
  locale = 'es-CO',
}: Readonly<TransactionHeaderActionsProps>) {
  const router = useRouter();
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);

  const openCategoryManager = useCallback(() => setIsCategoryManagerOpen(true), []);
  const closeCategoryManager = useCallback(() => setIsCategoryManagerOpen(false), []);
  const handleCategoriesChanged = useCallback(() => {
    router.refresh();
  }, [router]);

  const openTransfer = useCallback(() => setIsTransferOpen(true), []);
  const closeTransfer = useCallback(() => setIsTransferOpen(false), []);

  // A transfer requires at least one valid pair per the pocket contract (the
  // server is the source of truth; this hides the button when no pair exists).
  const canTransfer = hasAnyValidPair(accounts);

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
        accounts={accounts}
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
