'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Tags } from 'lucide-react';
import { NewTransactionButton } from '@/components/transactions/NewTransactionButton';
import { CreateTransactionModal } from '@/components/transactions/CreateTransactionModal';
import { CategoryManagerModal } from '@/components/transactions/CategoryManagerModal';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { AccountBrief, CategoryBrief } from '@/components/transactions/types';

interface TransactionHeaderActionsProps {
  dictionary: Record<string, unknown>;
  accounts: AccountBrief[];
  categories: CategoryBrief[];
  hasAccounts: boolean;
  lang: Locale;
}

/**
 * Client-owned header actions for the transactions page.
 *
 * DECISION (documented): the category manager modal is controlled with local
 * state here instead of the global Zustand store. This keeps the modal
 * decoupled from the UI store — it is only mounted on this page and its open
 * state has no cross-page meaning.
 */
export function TransactionHeaderActions({
  dictionary,
  accounts,
  categories,
  hasAccounts,
  lang,
}: Readonly<TransactionHeaderActionsProps>) {
  const router = useRouter();
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);

  const openCategoryManager = useCallback(() => setIsCategoryManagerOpen(true), []);
  const closeCategoryManager = useCallback(() => setIsCategoryManagerOpen(false), []);
  const handleCategoriesChanged = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <>
      <div className="flex items-center gap-2">
        {hasAccounts && <NewTransactionButton dictionary={dictionary} />}
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
        onOpenCategoryManager={openCategoryManager}
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
