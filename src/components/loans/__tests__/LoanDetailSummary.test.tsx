/**
 * LoanDetailSummary Component Tests
 *
 * Presentational 8-card metric grid for a single loan.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoanDetailSummary } from '../LoanDetailSummary';
import type { LoanWithInstallments } from '@/types/loans';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      principal: 'Monto principal',
      outstandingBalance: 'Saldo actual',
      rate: 'Tasa',
      'rateType.EA': 'E.A.',
      calculatedInstallment: 'Cuota calculada',
      yield: 'Rendimiento',
      totalInterest: 'Interés total',
      totalPayable: 'Total a pagar',
      progress: 'Progreso',
      summary: 'Resumen',
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
    principalCents: 100000,
    balanceCents: 50000,
    currency: 'COP',
    interestRateValue: 12,
    rateType: 'EA',
    installmentAmountCents: null,
    effectiveYieldPct: 6.5,
    totalInterestCents: 6000,
    totalPayableCents: 106000,
    progressPct: 50,
    installments: [{ totalCents: 9000 }],
    ...overrides,
  } as unknown as LoanWithInstallments;
}

describe('LoanDetailSummary', () => {
  it('renderiza las 8 tarjetas de métricas', () => {
    render(<LoanDetailSummary loan={makeLoan()} dictionary={{}} locale="es-CO" />);

    expect(screen.getByText('Monto principal')).toBeInTheDocument();
    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Saldo actual')).toBeInTheDocument();
    expect(screen.getByText('$500.00 COP')).toBeInTheDocument();
    expect(screen.getByText('12% · E.A.')).toBeInTheDocument();
    // Sin override usa la primera cuota como cuota planificada.
    expect(screen.getByText('$90.00 COP')).toBeInTheDocument();
    expect(screen.getByText('6.50%')).toBeInTheDocument();
    expect(screen.getByText('$60.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$1060.00 COP')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
  });

  it('prefiere installmentAmountCents como cuota planificada', () => {
    render(
      <LoanDetailSummary
        loan={makeLoan({ installmentAmountCents: 9500 })}
        dictionary={{}}
        locale="es-CO"
      />
    );
    expect(screen.getByText('$95.00 COP')).toBeInTheDocument();
  });

  it('usa un guion cuando no hay rendimiento y clampea el progreso a 100', () => {
    render(
      <LoanDetailSummary
        loan={makeLoan({ effectiveYieldPct: null, progressPct: 150 })}
        dictionary={{}}
        locale="es-CO"
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('100.0%')).toBeInTheDocument();
  });
});
