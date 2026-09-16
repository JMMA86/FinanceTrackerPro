/**
 * AmortizationTable Component Tests
 *
 * Accessible schedule: rows, badges, overdue/due-soon highlights, payment
 * history expansion and the register-payment callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AmortizationTable } from '../AmortizationTable';
import type {
  LoanInstallmentPaymentSerialized,
  LoanInstallmentSerialized,
  LoanWithInstallments,
} from '@/types/loans';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      amortizationTable: 'Tabla de amortización',
      'table.number': '#',
      'table.date': 'Fecha',
      'table.installment': 'Cuota',
      'table.interest': 'Interés',
      'table.principal': 'Capital',
      'table.balance': 'Saldo',
      'table.status': 'Estado',
      actions: 'Acciones',
      interestOnlyBadge: 'Solo interés',
      customBadge: 'Personalizada',
      paidAmount: 'Pagado',
      'installmentStatus.PENDING': 'Pendiente',
      'installmentStatus.PAID': 'Pagada',
      'installmentStatus.PARTIAL': 'Parcial',
      'installmentStatus.OVERDUE': 'Vencida',
      'installmentStatus.WAIVED': 'Condonada',
      overdue: 'Atrasada',
      dueSoon: 'Próxima a vencer',
      paidOn: 'Pagada el',
      paymentHistory: 'Historial de pagos',
      registerPayment: 'Registrar pago/recibo',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn(
    (cents: number, currency: string) => `$${(cents / 100).toFixed(2)} ${currency}`
  ),
}));

function makePayment(
  overrides: Partial<LoanInstallmentPaymentSerialized> = {}
): LoanInstallmentPaymentSerialized {
  return {
    id: 'pay-1',
    installmentId: 'inst-1',
    transactionId: null,
    amountCents: 5000,
    principalCents: 4000,
    interestCents: 1000,
    currency: 'COP',
    paidAt: new Date('2026-02-05'),
    notes: 'Abono parcial',
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
  } as LoanInstallmentPaymentSerialized;
}

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

function makeLoan(installments: LoanInstallmentSerialized[]): LoanWithInstallments {
  return {
    id: 'loan-1',
    name: 'Préstamo a Juan',
    currency: 'COP',
    installments,
  } as unknown as LoanWithInstallments;
}

describe('AmortizationTable', () => {
  const onRegisterPayment = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza una fila por cuota con su estado y montos', () => {
    render(
      <AmortizationTable
        loan={makeLoan([
          makeInstallment({
            id: 'i1',
            installmentNumber: 1,
            status: 'PAID',
            paidDate: new Date('2026-02-03'),
          }),
          makeInstallment({ id: 'i2', installmentNumber: 2, status: 'PENDING' }),
        ])}
        dictionary={{}}
        locale="es-CO"
        onRegisterPayment={onRegisterPayment}
      />
    );

    expect(screen.getByText('Tabla de amortización')).toBeInTheDocument();
    expect(screen.getByText('Pagada')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText(/Pagada el/)).toBeInTheDocument();
    // Total de cada cuota.
    expect(screen.getAllByText('$90.00 COP').length).toBeGreaterThan(0);
  });

  it('muestra las insignias de interés-only y custom', () => {
    render(
      <AmortizationTable
        loan={makeLoan([
          makeInstallment({ id: 'i1', installmentNumber: 1, isInterestOnly: true }),
          makeInstallment({ id: 'i2', installmentNumber: 2, isCustomTotal: true }),
        ])}
        dictionary={{}}
        locale="es-CO"
        onRegisterPayment={onRegisterPayment}
      />
    );

    expect(screen.getByText('Solo interés')).toBeInTheDocument();
    expect(screen.getByText('Personalizada')).toBeInTheDocument();
  });

  it('llama a onRegisterPayment al pulsar el botón de una cuota pagable', () => {
    render(
      <AmortizationTable
        loan={makeLoan([makeInstallment({ status: 'PENDING' })])}
        dictionary={{}}
        locale="es-CO"
        onRegisterPayment={onRegisterPayment}
      />
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Registrar pago/recibo - Préstamo a Juan #1' })
    );
    expect(onRegisterPayment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'inst-1', installmentNumber: 1 })
    );
  });

  it('expande el historial de pagos de una cuota PAID', () => {
    render(
      <AmortizationTable
        loan={makeLoan([
          makeInstallment({
            status: 'PAID',
            payments: [makePayment()],
          }),
        ])}
        dictionary={{}}
        locale="es-CO"
        onRegisterPayment={onRegisterPayment}
      />
    );

    const historyButton = screen.getByRole('button', {
      name: 'Historial de pagos - Préstamo a Juan #1',
    });
    expect(historyButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(historyButton);

    expect(historyButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Abono parcial')).toBeInTheDocument();
    expect(screen.getByText('Historial de pagos')).toBeInTheDocument();
  });

  it('resalta las cuotas vencidas y próximas a vencer', async () => {
    const dueSoon = new Date();
    dueSoon.setDate(dueSoon.getDate() + 3);
    dueSoon.setHours(12, 0, 0, 0);

    render(
      <AmortizationTable
        loan={makeLoan([
          makeInstallment({ id: 'i1', installmentNumber: 1, status: 'OVERDUE' }),
          makeInstallment({ id: 'i2', installmentNumber: 2, status: 'PENDING', dueDate: dueSoon }),
        ])}
        dictionary={{}}
        locale="es-CO"
        onRegisterPayment={onRegisterPayment}
      />
    );

    expect(await screen.findByText('Próxima a vencer')).toBeInTheDocument();
    expect(screen.getByText('Atrasada')).toBeInTheDocument();
  });
});
