/**
 * MaxSpendableCard Component Tests
 *
 * The component is presentational: per-currency buckets are loaded on the
 * server page and passed via the `buckets` prop. It never calls Server Actions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaxSpendableCard } from '../MaxSpendableCard';
import type { MaxSpendablePerCurrency } from '@/types/savings';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      income: 'Ingresos',
      fixedExpenses: 'Gastos fijos',
      savingsCommitments: 'Ahorro',
      variableExpenses: 'Gastos variables',
      maxSpendable: 'Disponible',
      maxSpendableDesc: 'Calculado automáticamente',
      overdraftWarning: '¡Alerta de sobregiro!',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string, _locale?: string) => {
    const amount = (cents / 100).toFixed(2);
    return `$${amount} ${currency}`;
  }),
}));

describe('MaxSpendableCard', () => {
  const defaultDictionary = {};

  const copBucket: MaxSpendablePerCurrency = {
    currency: 'COP',
    totalIncomeCents: 500000,
    totalFixedExpensesCents: 200000,
    totalSavingsCommitmentsCents: 50000,
    totalVariableExpensesCents: 100000,
    maxSpendableCents: 150000,
  };

  const renderCard = (buckets: MaxSpendablePerCurrency[], error: string | null = null) =>
    render(
      <MaxSpendableCard
        buckets={buckets}
        error={error}
        dictionary={defaultDictionary}
        locale="es-CO"
      />
    );

  it('should render the four breakdown bars with values', () => {
    renderCard([copBucket]);

    expect(screen.getByRole('heading', { name: 'Disponible' })).toBeInTheDocument();
    expect(screen.getByText('Ingresos')).toBeInTheDocument();
    expect(screen.getByText('Gastos fijos')).toBeInTheDocument();
    expect(screen.getByText('Ahorro')).toBeInTheDocument();
    expect(screen.getByText('Gastos variables')).toBeInTheDocument();

    // One value per bar + the final max spendable value
    expect(screen.getByText('$5000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$2000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$500.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$1500.00 COP')).toBeInTheDocument();
  });

  it('should render native progress bars with value and max attributes', () => {
    const { container } = renderCard([copBucket]);

    const progressBars = container.querySelectorAll('progress');
    expect(progressBars).toHaveLength(4);

    // maxIncome = max(500000, 200000+50000+100000+150000, 1) = 500000
    const values = Array.from(progressBars).map((p) => ({
      value: p.getAttribute('value'),
      max: p.getAttribute('max'),
    }));
    expect(values).toEqual([
      { value: '500000', max: '500000' },
      { value: '200000', max: '500000' },
      { value: '50000', max: '500000' },
      { value: '100000', max: '500000' },
    ]);
  });

  it('should render one breakdown block per currency when several currencies exist', () => {
    renderCard([copBucket, { ...copBucket, currency: 'USD', maxSpendableCents: 75000 }]);

    expect(screen.getByText('COP')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('$750.00 USD')).toBeInTheDocument();
  });

  it('should show an overdraft warning when max spendable is negative', () => {
    renderCard([{ ...copBucket, maxSpendableCents: -25000 }]);

    expect(screen.getByRole('alert')).toHaveTextContent('¡Alerta de sobregiro!');
    expect(screen.getByText('$-250.00 COP')).toBeInTheDocument();
  });

  it('should render nothing when there are no buckets and no error', () => {
    const { container } = renderCard([]);

    expect(container.firstChild).toBeNull();
  });

  it('should show the error alert when the server fetch failed', () => {
    renderCard([], 'Error al cargar el desglose');

    expect(screen.getByRole('alert')).toHaveTextContent('Error al cargar el desglose');
  });
});
