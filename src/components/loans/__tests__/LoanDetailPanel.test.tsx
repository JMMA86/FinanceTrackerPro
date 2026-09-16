/**
 * LoanDetailPanel Component Tests
 *
 * Detail route orchestrator: back link, header, nested modal opening and the
 * redirect pushed after a successful delete. Children are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoanDetailPanel } from '../LoanDetailPanel';
import type { LoanWithInstallments } from '@/types/loans';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('../LoanDetailSummary', () => ({ LoanDetailSummary: () => <div data-testid="summary" /> }));
vi.mock('../AmortizationTable', () => ({ AmortizationTable: () => <div data-testid="table" /> }));
vi.mock('../AdjustmentsList', () => ({ AdjustmentsList: () => <div data-testid="adjustments" /> }));
vi.mock('../RegisterPaymentModal', () => ({
  RegisterPaymentModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="payment-modal">
      <button data-testid="payment-close" onClick={() => onClose?.()} />
      <button
        data-testid="payment-close-twice"
        onClick={() => {
          onClose?.();
          onClose?.();
        }}
      />
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
      backToList: 'Volver a préstamos',
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

describe('LoanDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderPanel(withPayable = true) {
    return render(
      <LoanDetailPanel
        loan={makeLoan(withPayable)}
        locale="es-CO"
        dictionary={{}}
        accounts={[]}
        lang="es"
      />
    );
  }

  it('renderiza el enlace de vuelta, el encabezado y las secciones', () => {
    renderPanel();

    expect(screen.getByRole('link', { name: 'Volver a préstamos' })).toHaveAttribute(
      'href',
      '/es/loans'
    );
    expect(screen.getByText('Préstamo a Juan')).toBeInTheDocument();
    expect(screen.getByText('Por cobrar')).toBeInTheDocument();
    expect(screen.getByTestId('summary')).toBeInTheDocument();
    expect(screen.getByTestId('table')).toBeInTheDocument();
    expect(screen.getByTestId('adjustments')).toBeInTheDocument();
  });

  it('abre los modales de pago, ajuste y edición', () => {
    renderPanel(true);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago/recibo' }));
    expect(screen.getByTestId('payment-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Añadir ajuste' }));
    expect(screen.getByTestId('adjustment-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar - Préstamo a Juan' }));
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument();
  });

  it('deshabilita el pago cuando no hay cuotas pendientes', () => {
    renderPanel(false);
    expect(screen.getByRole('button', { name: 'Registrar pago/recibo' })).toBeDisabled();
  });

  it('redirige a la lista tras eliminar el préstamo', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    fireEvent.click(screen.getByTestId('delete-stub'));

    expect(push).toHaveBeenCalledWith('/es/loans');
  });

  it('refresca la ruta al cerrar cada modal anidado', () => {
    renderPanel(true);

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

  it('coalesce los cierres duplicados del mismo modal', () => {
    renderPanel(true);

    fireEvent.click(screen.getByRole('button', { name: 'Registrar pago/recibo' }));
    fireEvent.click(screen.getByTestId('payment-close-twice'));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('no refresca al cerrar el modal de borrado después de eliminar', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    fireEvent.click(screen.getByTestId('delete-stub'));
    fireEvent.click(screen.getByTestId('delete-close'));

    expect(refresh).not.toHaveBeenCalled();
  });
});
