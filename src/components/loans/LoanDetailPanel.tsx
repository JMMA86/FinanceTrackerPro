'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import type { AccountBrief } from '@/components/transactions/types';
import type { LoanInstallmentSerialized, LoanWithInstallments } from '@/types/loans';
import { LoanDetailContent, hasSettledInstallments } from './LoanDetailContent';
import { RegisterPaymentModal } from './RegisterPaymentModal';
import { AddAdjustmentModal } from './AddAdjustmentModal';
import { EditLoanModal } from './EditLoanModal';
import { DeleteLoanModal } from './DeleteLoanModal';

interface LoanDetailPanelProps {
  loan: LoanWithInstallments;
  locale: string;
  dictionary: Record<string, unknown>;
  accounts: AccountBrief[];
  lang: Locale;
}

/**
 * Client orchestrator for the loan detail route. Owns the modal state and the
 * coalesced `router.refresh()` triggered after each mutation. All data arrives
 * from the server page as props; no business logic lives here.
 */
export function LoanDetailPanel({
  loan,
  locale,
  dictionary,
  accounts,
  lang,
}: Readonly<LoanDetailPanelProps>) {
  const router = useRouter();

  const [paymentInstallment, setPaymentInstallment] = useState<LoanInstallmentSerialized | null>(
    null
  );
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Each modal may call onClose twice per cycle (submit handler + native close
  // event). Coalesce so two overlapping refreshes never race. Reset when a modal
  // opens so genuinely consecutive mutations always refresh.
  const lastRefreshAtRef = useRef(0);
  // Set after a confirmed deletion so the close handler skips refreshing the
  // now-missing detail route while the redirect to the list is in flight.
  const deletedRef = useRef(false);

  const refreshOnce = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1000) return;
    lastRefreshAtRef.current = now;
    router.refresh();
  }, [router]);

  const settledInstallments = hasSettledInstallments(loan);

  const openPayment = useCallback((installment: LoanInstallmentSerialized | null) => {
    if (!installment) return;
    lastRefreshAtRef.current = 0;
    setPaymentInstallment(installment);
  }, []);

  const openAdjustment = useCallback(() => {
    lastRefreshAtRef.current = 0;
    setShowAdjustment(true);
  }, []);

  const openEdit = useCallback(() => {
    lastRefreshAtRef.current = 0;
    setShowEdit(true);
  }, []);

  const openDelete = useCallback(() => {
    lastRefreshAtRef.current = 0;
    deletedRef.current = false;
    setShowDelete(true);
  }, []);

  const handlePaymentClose = useCallback(() => {
    setPaymentInstallment(null);
    refreshOnce();
  }, [refreshOnce]);

  const handleAdjustmentClose = useCallback(() => {
    setShowAdjustment(false);
    refreshOnce();
  }, [refreshOnce]);

  const handleEditClose = useCallback(() => {
    setShowEdit(false);
    refreshOnce();
  }, [refreshOnce]);

  const handleDeleteClose = useCallback(() => {
    setShowDelete(false);
    if (deletedRef.current) return;
    refreshOnce();
  }, [refreshOnce]);

  const handleDeleted = useCallback(() => {
    deletedRef.current = true;
    router.push(`/${lang}/loans`);
  }, [router, lang]);

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/${lang}/loans`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70 rounded-lg px-1 py-0.5"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        {get(dictionary, 'backToList')}
      </Link>

      <LoanDetailContent
        loan={loan}
        dictionary={dictionary}
        locale={locale}
        variant="page"
        onRegisterPayment={openPayment}
        onAddAdjustment={openAdjustment}
        onEdit={openEdit}
        onDelete={openDelete}
      />

      {/* Modals */}
      {paymentInstallment && (
        <RegisterPaymentModal
          loan={loan}
          installment={paymentInstallment}
          accounts={accounts}
          dictionary={dictionary}
          locale={locale}
          isOpen
          onClose={handlePaymentClose}
        />
      )}

      {showAdjustment && (
        <AddAdjustmentModal
          loan={loan}
          accounts={accounts}
          dictionary={dictionary}
          locale={locale}
          isOpen
          onClose={handleAdjustmentClose}
        />
      )}

      {showEdit && (
        <EditLoanModal loan={loan} dictionary={dictionary} isOpen onClose={handleEditClose} />
      )}

      {showDelete && (
        <DeleteLoanModal
          loanId={loan.id}
          loanName={loan.name}
          hasSettledInstallments={settledInstallments}
          dictionary={dictionary}
          isOpen
          onClose={handleDeleteClose}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  );
}
