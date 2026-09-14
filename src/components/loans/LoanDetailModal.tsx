'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/i18n';
import { get } from '@/lib/i18n';
import type { AccountBrief } from '@/components/transactions/types';
import type { LoanInstallmentSerialized, LoanWithInstallments } from '@/types/loans';
import { LoanDetailContent, hasSettledInstallments } from './LoanDetailContent';
import { RegisterPaymentModal } from './RegisterPaymentModal';
import { AddAdjustmentModal } from './AddAdjustmentModal';
import { EditLoanModal } from './EditLoanModal';
import { DeleteLoanModal } from './DeleteLoanModal';
import { LoanDialogShell, type LoanDialogRenderApi } from './LoanDialogShell';

interface LoanDetailModalProps {
  loan: LoanWithInstallments;
  accounts: AccountBrief[];
  dictionary: Record<string, unknown>;
  locale: string;
  lang: Locale;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Large in-place detail modal opened from the loans grid (the "eye" button).
 * Reuses the same presentational block as the deep-link detail route and owns
 * the nested payment/adjustment/edit/delete modals plus the coalesced
 * `router.refresh()` fired after each mutation. Data always arrives as props
 * from the server; no business logic lives here.
 */
export function LoanDetailModal({
  loan,
  accounts,
  dictionary,
  locale,
  lang,
  isOpen,
  onClose,
}: Readonly<LoanDetailModalProps>) {
  const router = useRouter();
  const shellRef = useRef<LoanDialogRenderApi | null>(null);

  const [paymentInstallment, setPaymentInstallment] = useState<LoanInstallmentSerialized | null>(
    null
  );
  const [showAdjustment, setShowAdjustment] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  // Each nested modal may call onClose twice per cycle (submit handler + native
  // close event). Coalesce so two overlapping refreshes never race.
  const lastRefreshAtRef = useRef(0);
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

  return (
    <LoanDialogShell
      isOpen={isOpen}
      onClose={onClose}
      closeLabel={get(dictionary, 'close')}
      titleId="loan-detail-modal-title"
      maxWidthClass="max-w-[96rem]"
      panelClassName="max-h-[92vh] flex flex-col overflow-hidden"
      backdropClassName="bg-black/70"
      lang={lang}
      closeRef={shellRef}
    >
      <LoanDetailContent
        loan={loan}
        dictionary={dictionary}
        locale={locale}
        variant="modal"
        onRegisterPayment={openPayment}
        onAddAdjustment={openAdjustment}
        onEdit={openEdit}
        onDelete={openDelete}
        onClose={() => shellRef.current?.close()}
      />

      {/* Nested modals */}
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
          onDeleted={() => {
            deletedRef.current = true;
            // Close the detail modal; the parent refreshes the grid when it unmounts.
            shellRef.current?.close();
          }}
        />
      )}
    </LoanDialogShell>
  );
}
