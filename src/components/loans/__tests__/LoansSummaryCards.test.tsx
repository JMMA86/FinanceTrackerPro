/**
 * LoansSummaryCards Component Tests
 *
 * Presentational per-currency summary: one 5-card row per currency bucket,
 * currencies never merged, error/empty states.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LoansSummaryCards } from '../LoansSummaryCards';
import type { LoanSummaryPerCurrency } from '@/types/loans';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      totalReceivable: 'Por cobrar',
      'directionShort.PAYABLE': 'Por pagar',
      totalPrincipal: 'Capital total',
      totalInterest: 'Interés total',
      monthlyDue: 'Cuota del mes',
      activeLoans: 'Préstamos activos',
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

describe('LoansSummaryCards', () => {
  const dictionary = {};

  const copBucket: LoanSummaryPerCurrency = {
    currency: 'COP',
    totalPrincipalCents: 1000000,
    totalInterestCents: 200000,
    totalReceivableCents: 500000,
    totalPayableCents: 300000,
    monthlyDueCents: 100000,
    activeCount: 2,
  };

  const usdBucket: LoanSummaryPerCurrency = {
    currency: 'USD',
    totalPrincipalCents: 50000,
    totalInterestCents: 5000,
    totalReceivableCents: 0,
    totalPayableCents: 25000,
    monthlyDueCents: 5000,
    activeCount: 1,
  };

  const renderCards = (buckets: LoanSummaryPerCurrency[], error: string | null = null) =>
    render(
      <LoansSummaryCards buckets={buckets} error={error} dictionary={dictionary} locale="es-CO" />
    );

  it('renderiza las 5 tarjetas para un bucket de una sola moneda', () => {
    renderCards([copBucket]);

    expect(screen.getByText('Por cobrar')).toBeInTheDocument();
    expect(screen.getByText('$5000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Por pagar')).toBeInTheDocument();
    expect(screen.getByText('$3000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Capital total')).toBeInTheDocument();
    expect(screen.getByText('$10000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Interés total')).toBeInTheDocument();
    expect(screen.getByText('$2000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Cuota del mes')).toBeInTheDocument();
    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('2 Préstamos activos')).toBeInTheDocument();
  });

  it('renderiza una sección por moneda sin mezclar montos', () => {
    renderCards([copBucket, usdBucket]);

    expect(screen.getByText('COP')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();

    const copSection = screen.getByRole('region', { name: 'Resumen COP' });
    expect(within(copSection).getByText('$5000.00 COP')).toBeInTheDocument();
    expect(within(copSection).queryByText('$250.00 USD')).not.toBeInTheDocument();
  });

  it('no renderiza nada sin buckets ni error', () => {
    const { container } = renderCards([]);
    expect(container.firstChild).toBeNull();
  });

  it('muestra la alerta de error', () => {
    renderCards([], 'No se pudieron cargar los préstamos');
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los préstamos');
  });
});
