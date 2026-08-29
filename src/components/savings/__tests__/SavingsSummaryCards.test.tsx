/**
 * SavingsSummaryCards Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SavingsSummaryCards } from '../SavingsSummaryCards';

const mockGetSavingsSummary = vi.fn();
const mockCalculateMaxSpendable = vi.fn();

vi.mock('@/actions/savings.actions', () => ({
  getSavingsSummary: (...args: unknown[]) => mockGetSavingsSummary(...args),
  calculateMaxSpendable: (...args: unknown[]) => mockCalculateMaxSpendable(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      totalSaved: 'Total ahorrado',
      totalTargets: 'Total metas',
      overallProgress: 'Progreso general',
      activeGoals: 'metas activas',
      maxSpendable: 'Disponible',
      'errors.loadFailed': 'Error al cargar el resumen',
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

describe('SavingsSummaryCards', () => {
  const defaultDictionary = {};

  const summary = {
    totalSavedCents: 100000,
    totalTargetCents: 200000,
    overallProgressPercentage: 50,
    activeGoalsCount: 2,
    completedGoalsCount: 0,
    monthlyContributedCents: 10000,
  };

  const maxSpendable = {
    totalIncomeCents: 500000,
    totalFixedExpensesCents: 200000,
    totalSavingsCommitmentsCents: 50000,
    totalVariableExpensesCents: 100000,
    maxSpendableCents: 150000,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSavingsSummary.mockResolvedValue({ success: true, data: summary });
    mockCalculateMaxSpendable.mockResolvedValue({ success: true, data: maxSpendable });
  });

  const renderCards = () => <SavingsSummaryCards dictionary={defaultDictionary} locale="es-CO" />;

  it('should show a skeleton while data is loading', () => {
    mockGetSavingsSummary.mockReturnValue(new Promise<never>(() => {}));
    mockCalculateMaxSpendable.mockReturnValue(new Promise<never>(() => {}));

    const { container } = render(renderCards());

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(4);
  });

  it('should call the actions with the current month and year', async () => {
    render(renderCards());

    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    await waitFor(() => {
      expect(screen.getByText('Total ahorrado')).toBeInTheDocument();
    });

    expect(mockGetSavingsSummary).toHaveBeenCalledWith({ month, year });
    expect(mockCalculateMaxSpendable).toHaveBeenCalledWith({ month, year });
  });

  it('should render the four summary cards with values', async () => {
    render(renderCards());

    await waitFor(() => {
      expect(screen.getByText('Total ahorrado')).toBeInTheDocument();
    });

    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Total metas')).toBeInTheDocument();
    expect(screen.getByText('$2000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Progreso general')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('2 metas activas')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
    expect(screen.getByText('$1500.00 COP')).toBeInTheDocument();
  });

  it('should use an emerald progress color when progress >= 50', async () => {
    render(renderCards());

    await waitFor(() => {
      expect(screen.getByText('50.0%')).toBeInTheDocument();
    });

    const progressValue = screen.getByText('50.0%');
    expect(progressValue.className).toContain('text-emerald-400');
  });

  it('should use an amber progress color when progress >= 25 and < 50', async () => {
    mockGetSavingsSummary.mockResolvedValue({
      success: true,
      data: { ...summary, overallProgressPercentage: 30 },
    });

    render(renderCards());

    await waitFor(() => {
      expect(screen.getByText('30.0%')).toBeInTheDocument();
    });

    const progressValue = screen.getByText('30.0%');
    expect(progressValue.className).toContain('text-amber-400');
  });

  it('should use a slate progress color when progress < 25', async () => {
    mockGetSavingsSummary.mockResolvedValue({
      success: true,
      data: { ...summary, overallProgressPercentage: 10 },
    });

    render(renderCards());

    await waitFor(() => {
      expect(screen.getByText('10.0%')).toBeInTheDocument();
    });

    const progressValue = screen.getByText('10.0%');
    expect(progressValue.className).toContain('text-slate-400');
  });

  it('should render max spendable in red when it is negative', async () => {
    mockCalculateMaxSpendable.mockResolvedValue({
      success: true,
      data: { ...maxSpendable, maxSpendableCents: -50000 },
    });

    render(renderCards());

    await waitFor(() => {
      expect(screen.getByText('$-500.00 COP')).toBeInTheDocument();
    });

    const maxValue = screen.getByText('$-500.00 COP');
    expect(maxValue.className).toContain('text-red-400');
  });

  it('should render $0 when max spendable data is missing but summary loads', async () => {
    mockCalculateMaxSpendable.mockResolvedValue({ success: false, error: 'missing' });

    render(renderCards());

    await waitFor(() => {
      expect(screen.getByText('Total ahorrado')).toBeInTheDocument();
    });

    expect(screen.getByText('$0.00 COP')).toBeInTheDocument();
  });

  it('should show the error alert when the summary request fails', async () => {
    mockGetSavingsSummary.mockResolvedValue({ success: false, error: 'summary failed' });

    render(renderCards());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Error al cargar el resumen');
    });
  });

  it('should show the error alert when an action throws', async () => {
    mockGetSavingsSummary.mockRejectedValue(new Error('boom'));

    render(renderCards());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Error al cargar el resumen');
    });
  });
});
