/**
 * FixedExpensesSummaryCards Component Tests
 *
 * Presentational: buckets are loaded server-side and passed as props. Currencies
 * are rendered as independent 4-card sections and NEVER merged.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FixedExpensesSummaryCards } from '../FixedExpensesSummaryCards';
import type { FixedExpensesSummaryPerCurrency } from '@/types/fixed-expense';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      totalCommitted: 'Comprometido del Mes',
      paidThisMonth: 'Pagado este Mes',
      pendingThisMonth: 'Pendiente',
      overdueThisMonth: 'Vencido',
      expense: 'gasto',
      expenses: 'gastos',
      summary: 'Resumen',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => {
    return `$${(cents / 100).toFixed(2)} ${currency}`;
  }),
}));

describe('FixedExpensesSummaryCards', () => {
  const dictionary = {};

  const copBucket: FixedExpensesSummaryPerCurrency = {
    currency: 'COP',
    totalCommittedCents: 200000,
    totalPaidCents: 100000,
    totalPendingCents: 50000,
    totalOverdueCents: 30000,
    activeCount: 1,
  };

  const usdBucket: FixedExpensesSummaryPerCurrency = {
    currency: 'USD',
    totalCommittedCents: 40000,
    totalPaidCents: 0,
    totalPendingCents: 30000,
    totalOverdueCents: 0,
    activeCount: 2,
  };

  const renderCards = (buckets: FixedExpensesSummaryPerCurrency[], error: string | null = null) =>
    render(
      <FixedExpensesSummaryCards
        buckets={buckets}
        error={error}
        dictionary={dictionary}
        locale="es-CO"
      />
    );

  it('renders the four summary cards for a single currency bucket', () => {
    renderCards([copBucket]);

    expect(screen.getByText('Comprometido del Mes')).toBeInTheDocument();
    expect(screen.getByText('$2000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Pagado este Mes')).toBeInTheDocument();
    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Pendiente')).toBeInTheDocument();
    expect(screen.getByText('$500.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Vencido')).toBeInTheDocument();
    expect(screen.getByText('$300.00 COP')).toBeInTheDocument();
    expect(screen.getByText('1 gasto')).toBeInTheDocument();
  });

  it('renders one section per currency without mixing amounts', () => {
    renderCards([copBucket, usdBucket]);

    expect(screen.getByText('COP')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('$2000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$400.00 USD')).toBeInTheDocument();
    expect(screen.getByText('$300.00 USD')).toBeInTheDocument();

    const copSection = screen.getByRole('region', { name: 'Resumen COP' });
    expect(within(copSection).queryByText('$400.00 USD')).not.toBeInTheDocument();
    expect(within(copSection).getByText('$2000.00 COP')).toBeInTheDocument();
  });

  it('uses a pluralized count label when activeCount is not 1', () => {
    renderCards([usdBucket]);

    expect(screen.getByText('2 gastos')).toBeInTheDocument();
  });

  it('renders nothing when there are no buckets and no error', () => {
    const { container } = renderCards([]);

    expect(container.firstChild).toBeNull();
  });

  it('shows the error alert when the server fetch failed', () => {
    renderCards([], 'No se pudieron cargar los gastos fijos');

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los gastos fijos');
  });
});
