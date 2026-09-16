/**
 * LoansGrid Component Tests
 *
 * Orchestrator: empty state, error state, loan list and modal opening.
 * Nested modals are stubbed (covered by their own tests).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoansGrid } from '../LoansGrid';
import type { LoanWithInstallments } from '@/types/loans';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

vi.mock('../CreateLoanModal', () => ({
  CreateLoanModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="create-modal" /> : null,
}));
vi.mock('../EditLoanModal', () => ({
  EditLoanModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="edit-modal" /> : null,
}));
vi.mock('../DeleteLoanModal', () => ({
  DeleteLoanModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="delete-modal" /> : null,
}));
vi.mock('../LoanDetailModal', () => ({
  LoanDetailModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="detail-modal" /> : null,
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      noLoans: 'No tienes préstamos registrados',
      noLoansDesc: 'Registra tu primer préstamo',
      addLoan: 'Nuevo préstamo',
      newLoan: 'Nuevo préstamo',
      retry: 'Reintentar',
      loan: 'préstamo',
      loans: 'préstamos',
      'directionShort.RECEIVABLE': 'Por cobrar',
      'status.ACTIVE': 'Activo',
      'types.PERSONAL': 'Personal',
      progress: 'Progreso',
      paidInstallments: 'cuotas pagadas',
      pendingInstallments: 'cuotas pendientes',
      principal: 'Monto principal',
      balance: 'Saldo',
      nextPayment: 'Próxima cuota',
      noNextPayment: 'Sin cuotas pendientes',
      viewDetail: 'Ver detalle',
      edit: 'Editar',
      delete: 'Eliminar',
      'rateType.EA': 'E.A.',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn(
    (cents: number, currency: string) => `$${(cents / 100).toFixed(2)} ${currency}`
  ),
}));

function makeLoan(overrides: Partial<LoanWithInstallments> = {}): LoanWithInstallments {
  return {
    id: 'loan-1',
    name: 'Préstamo a Juan',
    direction: 'RECEIVABLE',
    status: 'ACTIVE',
    type: 'PERSONAL',
    principalCents: 100000,
    balanceCents: 50000,
    currency: 'COP',
    rateType: 'EA',
    interestRateValue: 12,
    paidCount: 5,
    pendingCount: 7,
    nextDueDate: new Date('2026-08-01'),
    progressPct: 50,
    color: null,
    installments: [],
    adjustments: [],
    ...overrides,
  } as unknown as LoanWithInstallments;
}

describe('LoansGrid', () => {
  const baseProps = {
    accounts: [],
    dictionary: {},
    locale: 'es-CO',
    lang: 'es' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el estado vacío y abre el modal de creación', () => {
    render(<LoansGrid loans={[]} loadError={null} {...baseProps} />);

    expect(screen.getByText('No tienes préstamos registrados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo préstamo/ }));
    expect(screen.getByTestId('create-modal')).toBeInTheDocument();
  });

  it('muestra el error de carga y reintenta', () => {
    render(<LoansGrid loans={[]} loadError="No se pudieron cargar los préstamos" {...baseProps} />);

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los préstamos');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('renderiza las tarjetas y abre detalle/edición/borrado', () => {
    render(<LoansGrid loans={[makeLoan()]} loadError={null} {...baseProps} />);

    expect(screen.getByText('Préstamo a Juan')).toBeInTheDocument();
    expect(screen.getByText('1 préstamo')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle - Préstamo a Juan' }));
    expect(screen.getByTestId('detail-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Editar - Préstamo a Juan' }));
    expect(screen.getByTestId('edit-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    expect(screen.getByTestId('delete-modal')).toBeInTheDocument();
  });

  it('usa el plural correcto con varios préstamos', () => {
    render(
      <LoansGrid
        loans={[makeLoan(), makeLoan({ id: 'loan-2', name: 'Préstamo 2' })]}
        loadError={null}
        {...baseProps}
      />
    );
    expect(screen.getByText('2 préstamos')).toBeInTheDocument();
  });
});
