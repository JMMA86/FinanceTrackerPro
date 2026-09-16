/**
 * VariableExpenseDetail Component Tests
 *
 * Locks the two data paths: a single definition uses getVariableExpenseDetail
 * (with a trend) while "Todos" uses getVariableExpenseMovements (no trend), plus
 * the month/definition filters and the scrollable movement list.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VariableExpenseDetail } from '../VariableExpenseDetail';
import type {
  VariableExpenseDefinition,
  VariableExpenseDetailResponse,
  VariableExpenseMovementsResponse,
} from '@/types/variable-expense';

vi.mock('@/actions/variable-expense.actions', () => ({
  getVariableExpenseDetail: vi.fn(),
  getVariableExpenseMovements: vi.fn(),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      detail: 'Detalle',
      allDefinitions: 'Todas',
      filterByDefinition: 'Filtrar por definición',
      filterMovements: 'Filtrar movimientos',
      allMovements: 'Todos los movimientos',
      monthMovements: 'Movimientos del mes',
      total: 'Total',
      totalHistory: 'Total histórico',
      count: 'Cantidad',
      average: 'Promedio',
      trend: 'Tendencia',
      lastMonths: 'Últimos meses',
      noData: 'Sin datos',
      loading: 'Cargando...',
      date: 'Fecha',
      amount: 'Monto',
      close: 'Cerrar',
      'errors.loadFailed': 'No se pudo cargar',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
  centsToDecimal: (cents: number) => ({ toNumber: () => cents / 100 }),
}));

const definition: VariableExpenseDefinition = {
  id: 'def-1',
  name: 'Fútbol',
  description: null,
  color: '#14b8a6',
  icon: 'dumbbell',
  categoryId: null,
  category: null,
  expectedTimesPerMonth: 4,
  expectedAmountCents: 5000,
  currency: 'COP',
  isActive: true,
};

const detailResponse: VariableExpenseDetailResponse = {
  definition,
  scope: 'month',
  month: 9,
  year: 2026,
  count: 2,
  totalCents: 15000,
  averageCents: 7500,
  trend: [
    { month: 8, year: 2026, count: 1, totalCents: 5000 },
    { month: 9, year: 2026, count: 2, totalCents: 15000 },
  ],
  transactions: [
    {
      id: 'tx-1',
      description: 'Partido',
      amountCents: 15000,
      currency: 'COP',
      type: 'EXPENSE',
      date: new Date(2026, 8, 10),
      accountId: 'acc-1',
      accountName: 'Cuenta',
      categoryId: null,
      category: null,
      variableExpenseId: 'def-1',
    },
  ],
};

const movementsResponse: VariableExpenseMovementsResponse = {
  scope: 'month',
  variableExpenseId: null,
  count: 1,
  totalCents: 1000,
  averageCents: 1000,
  transactions: [
    {
      id: 'tx-2',
      description: 'Café',
      amountCents: 1000,
      currency: 'COP',
      type: 'EXPENSE',
      date: new Date(2026, 8, 11),
      accountId: 'acc-1',
      accountName: 'Cuenta',
      categoryId: null,
      category: null,
      variableExpenseId: 'def-1',
    },
  ],
};

describe('VariableExpenseDetail', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  function renderDetail() {
    return render(
      <VariableExpenseDetail
        isOpen
        definition={definition}
        definitions={[definition]}
        month={9}
        year={2026}
        dictionary={{}}
        locale="es-CO"
        onClose={onClose}
      />
    );
  }

  it('loads a single definition (with trend) and renders a scrollable list', async () => {
    const { getVariableExpenseDetail } = await import('@/actions/variable-expense.actions');
    (getVariableExpenseDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: detailResponse,
    });

    const { container } = renderDetail();

    await waitFor(() => {
      expect(getVariableExpenseDetail).toHaveBeenCalledWith({
        variableExpenseId: 'def-1',
        month: 9,
        year: 2026,
      });
    });
    // Trend is rendered for a single definition.
    expect(await screen.findByText('Tendencia')).toBeInTheDocument();
    // The chart SVG is decorative; the sr-only table carries the accessible data.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('table.sr-only')).not.toBeNull();
    // Movement list is scrollable.
    expect(container.querySelector('ul.max-h-64')).not.toBeNull();
    // The total also appears in the trend's accessible table.
    expect(screen.getAllByText('COP 150.00').length).toBeGreaterThan(0);
  });

  it('switches to "Todos" using getVariableExpenseMovements and hides the trend', async () => {
    const { getVariableExpenseDetail, getVariableExpenseMovements } =
      await import('@/actions/variable-expense.actions');
    (getVariableExpenseDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: detailResponse,
    });
    (getVariableExpenseMovements as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: movementsResponse,
    });

    renderDetail();
    await screen.findByText('Tendencia');

    fireEvent.change(screen.getByLabelText('Filtrar por definición'), { target: { value: '' } });

    await waitFor(() => {
      expect(getVariableExpenseMovements).toHaveBeenCalledWith({ month: 9, year: 2026 });
    });
    // The "all" endpoint has no trend.
    await waitFor(() => {
      expect(screen.queryByText('Tendencia')).not.toBeInTheDocument();
    });
  });

  it('reloads the full history when the month filter is set to all', async () => {
    const { getVariableExpenseDetail } = await import('@/actions/variable-expense.actions');
    (getVariableExpenseDetail as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: detailResponse,
    });

    renderDetail();
    await screen.findByText('Tendencia');

    fireEvent.change(screen.getByLabelText('Filtrar movimientos'), { target: { value: 'all' } });

    await waitFor(() => {
      expect(getVariableExpenseDetail).toHaveBeenCalledWith({ variableExpenseId: 'def-1' });
    });
  });
});
