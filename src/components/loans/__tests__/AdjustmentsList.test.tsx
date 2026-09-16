/**
 * AdjustmentsList Component Tests
 *
 * Read-only adjustment history: empty state and per-entry optional fields.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdjustmentsList } from '../AdjustmentsList';
import type { LoanAdjustmentSerialized } from '@/types/loans';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      adjustments: 'Ajustes',
      noAdjustments: 'Sin ajustes registrados',
      'adjustmentTypes.EXTRA_DISBURSEMENT': 'Prestar más',
      'adjustmentTypes.EXTRA_PAYMENT': 'Abono extra a capital',
      'adjustmentTypes.RATE_CHANGE': 'Cambio de tasa',
      'adjustmentTypes.RESCHEDULE': 'Reprogramar',
      'adjustmentTypes.CUSTOM_INSTALLMENT': 'Cuota personalizada',
      'adjustmentTypes.INTEREST_ONLY_PERIOD': 'Periodo solo interés',
      adjustmentAmount: 'Monto',
      newRate: 'Nueva tasa (%)',
      newTerm: 'Nuevo plazo',
      installmentNumber: 'Número de cuota',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn(
    (cents: number, currency: string) => `$${(cents / 100).toFixed(2)} ${currency}`
  ),
}));

function makeAdjustment(
  overrides: Partial<LoanAdjustmentSerialized> = {}
): LoanAdjustmentSerialized {
  return {
    id: 'adj-1',
    loanId: 'loan-1',
    type: 'EXTRA_PAYMENT',
    effectiveDate: new Date('2026-03-01'),
    amountCents: 20000,
    newRateValue: null,
    newTermCount: null,
    installmentNumber: null,
    notes: null,
    transactionId: null,
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
  } as LoanAdjustmentSerialized;
}

describe('AdjustmentsList', () => {
  it('muestra el estado vacío', () => {
    render(<AdjustmentsList adjustments={[]} currency="COP" dictionary={{}} locale="es-CO" />);
    expect(screen.getByText('Sin ajustes registrados')).toBeInTheDocument();
  });

  it('renderiza todos los campos opcionales de un ajuste', () => {
    const adjustment = makeAdjustment({
      amountCents: 15000,
      newRateValue: 10,
      newTermCount: 24,
      installmentNumber: 3,
      notes: 'Nota de ajuste',
    });

    render(
      <AdjustmentsList
        adjustments={[adjustment]}
        currency="COP"
        dictionary={{ acc: 'Ajustes' }}
        locale="es-CO"
      />
    );

    expect(screen.getByText('Abono extra a capital')).toBeInTheDocument();
    expect(screen.getByText('$150.00 COP')).toBeInTheDocument();
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
    expect(screen.getByText('Nota de ajuste')).toBeInTheDocument();
  });

  it('omite los campos nulos', () => {
    render(
      <AdjustmentsList
        adjustments={[makeAdjustment({ amountCents: null, type: 'RATE_CHANGE' })]}
        currency="COP"
        dictionary={{}}
        locale="es-CO"
      />
    );
    expect(screen.getByText('Cambio de tasa')).toBeInTheDocument();
    expect(screen.queryByText('Monto:')).not.toBeInTheDocument();
  });
});
