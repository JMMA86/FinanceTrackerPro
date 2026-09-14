/**
 * VariableExpensesOverviewCards Component Tests — per-currency totals, never
 * merging bucket currencies.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VariableExpensesOverviewCards } from '../VariableExpensesOverviewCards';
import type { VariableExpensesOverviewBucket } from '@/types/variable-expense';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      overview: 'Resumen',
      totalMonitored: 'Total monitoreado',
      transactionCount: 'Transacciones',
      definitionsCount: 'Definiciones',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
}));

function bucket(currency: 'COP' | 'USD', totalCents: number): VariableExpensesOverviewBucket {
  return {
    currency,
    totalCents,
    transactionCount: 2,
    definitionsCount: 2,
    stats: [],
  };
}

describe('VariableExpensesOverviewCards', () => {
  it('renders the totals per currency bucket', () => {
    render(
      <VariableExpensesOverviewCards
        buckets={[bucket('COP', 15000)]}
        error={null}
        dictionary={{}}
        locale="es-CO"
      />
    );

    expect(screen.getByText('Total monitoreado')).toBeInTheDocument();
    expect(screen.getByText('COP 150.00')).toBeInTheDocument();
    expect(screen.getByText('Transacciones')).toBeInTheDocument();
    // Both the transaction and definition counts are 2.
    expect(screen.getAllByText('2')).toHaveLength(2);
    expect(screen.getByText('Definiciones')).toBeInTheDocument();
  });

  it('heads each bucket with its currency when there is more than one', () => {
    render(
      <VariableExpensesOverviewCards
        buckets={[bucket('COP', 15000), bucket('USD', 700)]}
        error={null}
        dictionary={{}}
        locale="es-CO"
      />
    );

    expect(screen.getByRole('heading', { name: 'COP' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'USD' })).toBeInTheDocument();
    expect(screen.getByText('USD 7.00')).toBeInTheDocument();
  });

  it('renders nothing when there are no buckets', () => {
    const { container } = render(
      <VariableExpensesOverviewCards buckets={[]} error={null} dictionary={{}} locale="es-CO" />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the error state in an alert region', () => {
    render(
      <VariableExpensesOverviewCards
        buckets={[]}
        error="No se pudo cargar"
        dictionary={{}}
        locale="es-CO"
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar');
  });
});
