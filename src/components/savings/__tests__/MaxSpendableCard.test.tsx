/**
 * MaxSpendableCard Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MaxSpendableCard } from '../MaxSpendableCard';

const mockCalculateMaxSpendable = vi.fn();

vi.mock('@/actions/savings.actions', () => ({
  calculateMaxSpendable: (...args: unknown[]) => mockCalculateMaxSpendable(...args),
}));

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

  const data = {
    totalIncomeCents: 500000,
    totalFixedExpensesCents: 200000,
    totalSavingsCommitmentsCents: 50000,
    totalVariableExpensesCents: 100000,
    maxSpendableCents: 150000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCalculateMaxSpendable.mockResolvedValue({ success: true, data });
  });

  const renderCard = () => (
    <MaxSpendableCard dictionary={defaultDictionary} locale="es-CO" month={8} year={2026} />
  );

  it('should show a skeleton while data is loading', () => {
    mockCalculateMaxSpendable.mockReturnValue(new Promise<never>(() => {}));

    const { container } = render(renderCard());

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(1);
  });

  it('should call calculateMaxSpendable with month and year', async () => {
    render(renderCard());

    await waitFor(() => {
      expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0);
    });

    expect(mockCalculateMaxSpendable).toHaveBeenCalledWith({ month: 8, year: 2026 });
  });

  it('should render the four breakdown bars with values', async () => {
    render(renderCard());

    await waitFor(() => {
      expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0);
    });

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

  it('should render native progress bars with value and max attributes', async () => {
    const { container } = render(renderCard());

    await waitFor(() => {
      expect(screen.getAllByText('Disponible').length).toBeGreaterThan(0);
    });

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

  it('should render the max spendable headline value', async () => {
    render(renderCard());

    await waitFor(() => {
      expect(screen.getByText('$1500.00 COP')).toBeInTheDocument();
    });
  });

  it('should show an overdraft warning when max spendable is negative', async () => {
    mockCalculateMaxSpendable.mockResolvedValue({
      success: true,
      data: { ...data, maxSpendableCents: -25000 },
    });

    render(renderCard());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('¡Alerta de sobregiro!');
    });
    expect(screen.getByText('$-250.00 COP')).toBeInTheDocument();
  });

  it('should render nothing when the action returns an error', async () => {
    mockCalculateMaxSpendable.mockResolvedValue({ success: false, error: 'failed' });

    const { container } = render(renderCard());

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it('should render nothing when the action throws', async () => {
    mockCalculateMaxSpendable.mockRejectedValue(new Error('boom'));

    const { container } = render(renderCard());

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
