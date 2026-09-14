'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, HandCoins } from 'lucide-react';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { LoanWithInstallments } from '@/types/loans';
import type { AccountBrief } from '@/components/transactions/types';
import { LoanCard } from './LoanCard';
import { CreateLoanModal } from './CreateLoanModal';
import { EditLoanModal } from './EditLoanModal';
import { DeleteLoanModal } from './DeleteLoanModal';
import { LoanDetailModal } from './LoanDetailModal';

interface DeletingLoanState {
  id: string;
  name: string;
  hasSettledInstallments: boolean;
}

interface LoansGridProps {
  /** Loans + schedule loaded on the server page. */
  loans: LoanWithInstallments[];
  /** Bank accounts available for the optional initial disbursement/receipt. */
  accounts: AccountBrief[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  loadError: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
  lang: Locale;
}

export function LoansGrid({
  loans,
  accounts,
  loadError,
  dictionary,
  locale,
  lang,
}: Readonly<LoansGridProps>) {
  const router = useRouter();

  // Modal states (UI only). Initial data always comes from server props; after
  // any mutation the page is re-rendered server-side via router.refresh().
  const [showCreate, setShowCreate] = useState(false);
  const [viewingLoan, setViewingLoan] = useState<LoanWithInstallments | null>(null);
  const [editingLoan, setEditingLoan] = useState<LoanWithInstallments | null>(null);
  const [deletingLoan, setDeletingLoan] = useState<DeletingLoanState | null>(null);

  // Each modal calls onClose() twice per close cycle: once directly from its
  // submit handler after a successful mutation and once via the native
  // <dialog> 'close' event ~240ms later (fade-out). Both fire router.refresh(),
  // so two overlapping refreshes race and can intermittently leave stale
  // server-rendered DOM after a mutation. Coalesce the duplicate; the guard is
  // reset whenever a modal opens so genuinely consecutive mutations always
  // refresh.
  const lastRefreshAtRef = useRef(0);

  const refreshOnce = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1000) return;
    lastRefreshAtRef.current = now;
    router.refresh();
  }, [router]);

  const openCreate = useCallback(() => {
    lastRefreshAtRef.current = 0;
    setShowCreate(true);
  }, []);

  const handleEdit = useCallback((loan: LoanWithInstallments) => {
    lastRefreshAtRef.current = 0;
    setEditingLoan(loan);
  }, []);

  const handleView = useCallback((loan: LoanWithInstallments) => {
    lastRefreshAtRef.current = 0;
    setViewingLoan(loan);
  }, []);

  const handleDelete = useCallback(
    (loanId: string, loanName: string, hasSettledInstallments: boolean) => {
      lastRefreshAtRef.current = 0;
      setDeletingLoan({ id: loanId, name: loanName, hasSettledInstallments });
    },
    []
  );

  const handleCreateClose = useCallback(() => {
    setShowCreate(false);
    refreshOnce();
  }, [refreshOnce]);

  const handleEditClose = useCallback(() => {
    setEditingLoan(null);
    refreshOnce();
  }, [refreshOnce]);

  const handleViewClose = useCallback(() => {
    setViewingLoan(null);
    refreshOnce();
  }, [refreshOnce]);

  const handleDeleteClose = useCallback(() => {
    setDeletingLoan(null);
    refreshOnce();
  }, [refreshOnce]);

  if (loadError) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-6 text-center">
        <p className="text-sm text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={refreshOnce}
          className="mt-3 px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-300 hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
        >
          {get(dictionary, 'retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      {loans.length === 0 ? (
        <div className="app-shell rounded-2xl py-16 flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-2xl bg-violet-500/10 text-violet-400">
            <HandCoins className="w-8 h-8" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white mb-1">{get(dictionary, 'noLoans')}</p>
            <p className="text-xs text-slate-400 max-w-sm">{get(dictionary, 'noLoansDesc')}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'addLoan')}
          </button>
        </div>
      ) : (
        <>
          {/* Header with add button */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {loans.length}{' '}
              {loans.length === 1 ? get(dictionary, 'loan') : get(dictionary, 'loans')}
            </h2>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {get(dictionary, 'newLoan')}
            </button>
          </div>

          {/* Loans grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {loans.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                dictionary={dictionary}
                locale={locale}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      <CreateLoanModal
        dictionary={dictionary}
        locale={locale}
        isOpen={showCreate}
        onClose={handleCreateClose}
        accounts={accounts}
      />

      {editingLoan && (
        <EditLoanModal
          loan={editingLoan}
          dictionary={dictionary}
          isOpen
          onClose={handleEditClose}
        />
      )}

      {viewingLoan && (
        <LoanDetailModal
          loan={viewingLoan}
          accounts={accounts}
          dictionary={dictionary}
          locale={locale}
          lang={lang}
          isOpen
          onClose={handleViewClose}
        />
      )}

      {deletingLoan && (
        <DeleteLoanModal
          loanId={deletingLoan.id}
          loanName={deletingLoan.name}
          hasSettledInstallments={deletingLoan.hasSettledInstallments}
          dictionary={dictionary}
          isOpen
          onClose={handleDeleteClose}
        />
      )}
    </>
  );
}
