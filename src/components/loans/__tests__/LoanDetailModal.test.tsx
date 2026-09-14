/**
 * LoanDetailModal Component Tests
 *
 * Detail orchestrator: header, nested modal opening and close wiring.
 * Presentational children are stubbed (covered by their own tests).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoanDetailModal } from '../LoanDetailModal';
import type { LoanWithInstallments } from '@/types/loans';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock('../LoanDetailSummary', () => ({ LoanDetailSummary: () => <div data-testid="summary" /> }));
vi.mock('../AmortizationTable', () => ({
  AmortizationTable: ({ onRegisterPayment }: { onRegisterPayment?: (i: unknown) => void }) => (
    <div data-testid="table">
      <button data-testid="table-register-null" onClick={() => onRegisterPayment?.(null)} />
    </div>
  ),
}));
vi.mock('../AdjustmentsList', () => ({ AdjustmentsList: () => <div data-testid="adjustments" /> }));
vi.mock('../RegisterPaymentModal', () => ({
  RegisterPaymentModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="payment-modal">
      <button data-testid="payment-close" onClick={() => onClose?.()} />
    </div>
  ),
}));
vi.mock('../AddAdjustmentModal', () => ({
  AddAdjustmentModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="adjustment-modal">
      <button data-testid="adjustment-close" onClick={() => onClose?.()} />
    </div>
  ),
}));
vi.mock('../EditLoanModal', () => ({
  EditLoanModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="edit-modal">
      <button data-testid="edit-close" onClick={() => onClose?.()} />
    </div>
  ),
}));
vi.mock('../DeleteLoanModal', () => ({
  DeleteLoanModal: ({ onClose, onDeleted }: { onClose?: () => void; onDeleted?: () => void }) => (
    <div data-testid="delete-modal">
      <button data-testid="delete-stub" onClick={() => onDeleted?.()} />
      <button data-testid="delete-close" onClick={() => onClose?.()} />
    </div>
  ),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      close: 'Cerrar',
      'directionShort.RECEIVABLE': 'Por cobrar',
      'directionShort.PAYABLE': 'Por pagar',
      'status.ACTIVE': 'Activo',
      'types.PERSONAL': 'Personal',
      registerPayment: 'Registrar pago/recibo',
      addAdjustment: 'Añadir ajuste',
      adjustments: 'Ajustes',
      edit: 'Editar',
      delete: 'Eliminar',
    };
    return keyMap[key] ?? key;
  }),
}));

function makeLoan(withPayable: boolean): LoanWithInstallments {
  return {
    id: 'loan-1',
    name: 'Préstamo a Juan',
    direction: 'RECEIVABLE',
    status: 'ACTIVE',
    type: 'PERSONAL',
    installments: withPayable
      ? [{ id: 'i1', status: 'PENDING', installmentNumber: 1 }]
      : [{ id: 'i1', status: 'PAID', installmentNumber: 1 }],
    adjustments: [],
  } as unknown as LoanWithInstallments;
}

describe('LoanDetailModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  function renderModal(withPayable = true) {
    return render(
      <LoanDetailModal
        loan={makeLoan(withPayable)}
        accounts={[]}
        dictionary={{}}
        locale="es-CO"
        lang="es"
        isOpen
        onClose={onClose}
      />
    );
  }

  function backdropOf(container: HTMLElement) {
    return container.querySelector('[aria-hidden="true"]') as HTMLElement;
  }

  /** Wait for the entrance animation so mount-time resets cannot race. */
  async function waitForVisible(container: HTMLElement) {
    await waitFor(() => expect(backdropOf(container).style.opacity).toBe('1'));
  }

  it('renderiza el encabezado y las secciones', () => {
    renderModal();

    expect(screen.getByText('Préstamo a Juan')).toBeInTheDocument();
    expect(screen.getByText('Por cobrar')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByTestId('summary')).toBeInTheDocument();
    expect(screen.getByTestId('table')).toBeInTheDocument();
    expect(screen.getByTestId('adjustments')).toBeInTheDocument();
  });

  it('abre el modal de pago cuando hay una cuota pagable', () => {
    renderModal(true);

    const button = screen.getByRole('button', { name: 'Registrar pago/recibo' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(screen.getByTestId('payment-modal')).toBeInTheDocument();
  });

  it('deshabilita el pago cuando no hay cuotas pendientes', () => {
    renderModal(false);
    expect(screen.getByRole('button', { name: 'Registrar pago/recibo' })).toBeDisabled();
  });

  it('abre los modales de ajuste, edición y borrado', () => {
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: 'Añadir ajuste' }));
    expect(screen.getByTestId('adjustment-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar - Préstamo a Juan' }));
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    expect(screen.getByTestId('delete-modal')).toBeInTheDocument();
  });

  it('notifica onClose cuando el diálogo emite el evento nativo de cierre', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    fireEvent(dialog, new Event('close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('ignora el registro de pago cuando no hay cuota pagable', () => {
    renderModal(false);

    fireEvent.click(screen.getByTestId('table-register-null'));

    expect(screen.queryByTestId('payment-modal')).not.toBeInTheDocument();
  });

  it('refresca la ruta al cerrar cada modal anidado', () => {
    renderModal(true);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago/recibo' }));
    fireEvent.click(screen.getByTestId('payment-close'));

    fireEvent.click(screen.getByRole('button', { name: 'Añadir ajuste' }));
    fireEvent.click(screen.getByTestId('adjustment-close'));

    fireEvent.click(screen.getByRole('button', { name: 'Editar - Préstamo a Juan' }));
    fireEvent.click(screen.getByTestId('edit-close'));

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    fireEvent.click(screen.getByTestId('delete-close'));

    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it('cierra el detalle al eliminar sin refrescar la ruta', async () => {
    const { container } = renderModal(true);
    await waitForVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    fireEvent.click(screen.getByTestId('delete-stub'));
    fireEvent.click(screen.getByTestId('delete-close'));

    expect(refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(backdropOf(container).style.opacity).toBe('0'));
  });

  it('oculta el diálogo cuando isOpen cambia a false', async () => {
    const { container, rerender } = renderModal(true);
    await waitForVisible(container);

    rerender(
      <LoanDetailModal
        loan={makeLoan(true)}
        accounts={[]}
        dictionary={{}}
        locale="es-CO"
        lang="es"
        isOpen={false}
        onClose={onClose}
      />
    );

    await waitFor(() => expect(backdropOf(container).style.opacity).toBe('0'));
  });
});
