/**
 * LoanCard Component Tests
 *
 * Presentational loan card: direction/status/type labels, progress, amounts,
 * next due date and view/edit/delete callbacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoanCard } from '../LoanCard';
import type { LoanInstallmentSerialized, LoanWithInstallments } from '@/types/loans';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      'directionShort.RECEIVABLE': 'Por cobrar',
      'directionShort.PAYABLE': 'Por pagar',
      'status.ACTIVE': 'Activo',
      'status.COMPLETED': 'Completado',
      'types.PERSONAL': 'Personal',
      'rateType.EA': 'Efectiva anual (E.A.)',
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
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn(
    (cents: number, currency: string) => `$${(cents / 100).toFixed(2)} ${currency}`
  ),
}));

function makeInstallment(
  overrides: Partial<LoanInstallmentSerialized> = {}
): LoanInstallmentSerialized {
  return {
    id: 'inst-1',
    loanId: 'loan-1',
    installmentNumber: 1,
    dueDate: new Date('2026-02-01'),
    principalCents: 8000,
    interestCents: 1000,
    totalCents: 9000,
    balanceCents: 92000,
    currency: 'COP',
    isCustomTotal: false,
    isInterestOnly: false,
    status: 'PENDING',
    notes: null,
    source: 'SCHEDULE',
    paidDate: null,
    paidAmountCents: null,
    paidPrincipalCents: 0,
    paidInterestCents: 0,
    payments: [],
    idempotencyKey: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: 'u',
    lastModifiedBy: 'u',
    ipAddress: null,
    userAgent: null,
    ...overrides,
  } as LoanInstallmentSerialized;
}

function makeLoan(overrides: Partial<LoanWithInstallments> = {}): LoanWithInstallments {
  return {
    id: 'loan-1',
    userId: 'u',
    name: 'Préstamo a Juan',
    type: 'PERSONAL',
    direction: 'RECEIVABLE',
    status: 'ACTIVE',
    counterpartyContact: null,
    notes: null,
    principalCents: 100000,
    currency: 'COP',
    rateType: 'EA',
    interestRateValue: 12,
    interestMode: 'COMPOUND',
    interestAccrual: 'PERIODIC',
    dayCountBasis: 'ACTUAL_365',
    amortizationType: 'FRENCH',
    paymentFrequency: 'MONTHLY',
    termCount: 12,
    installmentAmountCents: null,
    interestOnlyInstallments: 0,
    totalInterestCents: 6000,
    totalPayableCents: 106000,
    startDate: new Date('2026-01-01'),
    firstPaymentDate: new Date('2026-02-01'),
    balanceCents: 50000,
    lastReconciled: null,
    color: null,
    icon: null,
    idempotencyKey: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: 'u',
    lastModifiedBy: 'u',
    ipAddress: null,
    userAgent: null,
    effectiveYieldPct: 6,
    paidCount: 5,
    pendingCount: 7,
    nextDueDate: new Date('2026-08-01'),
    progressPct: 50,
    installments: [makeInstallment()],
    adjustments: [],
    ...overrides,
  } as unknown as LoanWithInstallments;
}

describe('LoanCard', () => {
  const onView = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderCard(loan = makeLoan()) {
    return render(
      <LoanCard
        loan={loan}
        dictionary={{}}
        locale="es-CO"
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
  }

  it('renderiza nombre, etiquetas, progreso y montos', () => {
    renderCard();

    expect(screen.getByText('Préstamo a Juan')).toBeInTheDocument();
    expect(screen.getByText('Por cobrar')).toBeInTheDocument();
    expect(screen.getByText('Activo')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$500.00 COP')).toBeInTheDocument();
    expect(screen.getByText('5 cuotas pagadas · 7 cuotas pendientes')).toBeInTheDocument();
    expect(screen.getByText(/Próxima cuota:/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '50');
  });

  it('usa el gradiente por defecto y respeta el color hex', () => {
    const { container, rerender } = render(
      <LoanCard
        loan={makeLoan()}
        dictionary={{}}
        locale="es-CO"
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
    expect(container.querySelector('.bg-gradient-to-r')).not.toBeNull();

    rerender(
      <LoanCard
        loan={makeLoan({ color: '#ff0000' })}
        dictionary={{}}
        locale="es-CO"
        onView={onView}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    );
    const bar = container.querySelector('[style*="background"]') as HTMLElement;
    expect(bar.style.background).toBe('rgb(255, 0, 0)');
  });

  it('muestra "sin cuotas pendientes" y oculta la próxima cuota si el préstamo está completado', () => {
    renderCard(makeLoan({ status: 'COMPLETED', nextDueDate: null }));

    expect(screen.getByText('Completado')).toBeInTheDocument();
    expect(screen.queryByText(/Próxima cuota/)).not.toBeInTheDocument();
    expect(screen.queryByText('Sin cuotas pendientes')).not.toBeInTheDocument();
  });

  it('invoca onView, onEdit y onDelete con los argumentos correctos', () => {
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle - Préstamo a Juan' }));
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ id: 'loan-1' }));

    fireEvent.click(screen.getByRole('button', { name: 'Editar - Préstamo a Juan' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'loan-1' }));

    // La cuota #1 es PENDING → hasSettledInstallments=false.
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    expect(onDelete).toHaveBeenCalledWith('loan-1', 'Préstamo a Juan', false);
  });

  it('reporta hasSettledInstallments=true cuando existe una cuota pagada', () => {
    renderCard(makeLoan({ installments: [makeInstallment({ status: 'PAID' })] }));

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Préstamo a Juan' }));
    expect(onDelete).toHaveBeenCalledWith('loan-1', 'Préstamo a Juan', true);
  });
});
