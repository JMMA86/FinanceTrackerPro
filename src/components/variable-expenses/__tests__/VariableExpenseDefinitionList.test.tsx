/**
 * VariableExpenseDefinitionList Component Tests
 *
 * Locks the expected-vs-actual summary math: the real amount is compared
 * against `expectedTotalCents` (expectedAmountCents × expectedTimesPerMonth),
 * NEVER against the per-unit amount. Falls back to `c/u` only when the backend
 * cannot compute the monthly total.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VariableExpenseDefinitionList } from '../VariableExpenseDefinitionList';
import type {
  VariableExpenseDefinition,
  VariableExpenseMonthStat,
  VariableExpensesOverviewBucket,
} from '@/types/variable-expense';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      definitions: 'Definiciones',
      expected: 'Esperado',
      actual: 'Real',
      of: 'de',
      times: 'veces',
      perUnit: 'c/u',
      vsLastMonth: 'vs mes anterior',
      detail: 'Detalle',
      editDefinition: 'Editar definición',
      deleteDefinition: 'Eliminar definición',
      register: 'Registrar',
      noDefinitions: 'Sin definiciones',
      noDefinitionsDesc: 'Crea tu primera definición',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
}));

const definition: VariableExpenseDefinition = {
  id: 'def-1',
  name: 'Fútbol',
  description: 'Partidos del barrio',
  color: '#14b8a6',
  icon: 'dumbbell',
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Deporte', color: '#22c55e' },
  expectedTimesPerMonth: 4,
  expectedAmountCents: 5000,
  currency: 'COP',
  isActive: true,
};

function stat(overrides: Partial<VariableExpenseMonthStat> = {}): VariableExpenseMonthStat {
  return {
    variableExpenseId: 'def-1',
    name: 'Fútbol',
    color: '#14b8a6',
    icon: 'dumbbell',
    currency: 'COP',
    expectedTimesPerMonth: 4,
    expectedAmountCents: 5000,
    expectedTotalCents: 20000,
    count: 2,
    totalCents: 15000,
    averageCents: 7500,
    prevCount: 1,
    prevTotalCents: 8000,
    deltaCountPct: 100,
    deltaAmountPct: 25,
    ...overrides,
  };
}

function bucket(stats: VariableExpenseMonthStat[]): VariableExpensesOverviewBucket {
  return {
    currency: 'COP',
    totalCents: stats.reduce((sum, item) => sum + item.totalCents, 0),
    transactionCount: stats.reduce((sum, item) => sum + item.count, 0),
    definitionsCount: stats.length,
    stats,
  };
}

function renderList(
  props: Partial<React.ComponentProps<typeof VariableExpenseDefinitionList>> = {}
) {
  return render(
    <VariableExpenseDefinitionList
      definitions={[definition]}
      buckets={[bucket([stat()])]}
      error={null}
      dictionary={{}}
      locale="es-CO"
      onRegister={vi.fn()}
      onOpenDetail={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      {...props}
    />
  );
}

describe('VariableExpenseDefinitionList', () => {
  it('compares the real total against the expected MONTHLY total (not the per-unit amount)', () => {
    renderList();

    // expectedTotalCents = 5000 × 4 = 20000 → "COP 150.00 de COP 200.00".
    // The "de COP 200.00" denominator is the MONTHLY total, not the per-unit COP 50.00.
    expect(screen.getByText('2 de 4 veces · COP 150.00 de COP 200.00')).toBeInTheDocument();
  });

  it('falls back to the per-unit amount when expectedTotalCents is missing', () => {
    renderList({
      definitions: [{ ...definition, expectedTimesPerMonth: null }],
      buckets: [bucket([stat({ expectedTotalCents: null, expectedTimesPerMonth: null })])],
    });

    expect(screen.getByText('2 veces · COP 150.00 (COP 50.00 c/u)')).toBeInTheDocument();
  });

  it('renders definitions with zero occurrences using the expected monthly total', () => {
    renderList({
      buckets: [bucket([stat({ count: 0, totalCents: 0, averageCents: 0 })])],
    });

    expect(screen.getByText('0 de 4 veces · COP 0.00 de COP 200.00')).toBeInTheDocument();
  });

  it('shows the configured category and the month-over-month delta', () => {
    renderList();

    expect(screen.getByText('Deporte')).toBeInTheDocument();
    expect(screen.getByText(/\+25\.0%/)).toBeInTheDocument();
    expect(screen.getByText(/vs mes anterior/)).toBeInTheDocument();
  });

  it('renders the empty state when there are no definitions', () => {
    renderList({ definitions: [], buckets: [] });

    expect(screen.getByText('Sin definiciones')).toBeInTheDocument();
    expect(screen.getByText('Crea tu primera definición')).toBeInTheDocument();
  });

  it('renders the error state in an alert region', () => {
    renderList({ error: 'No se pudo cargar' });

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar');
  });
});
