/**
 * SavingsSummaryCards Component Tests
 *
 * The component is presentational: summary buckets are loaded on the server
 * page and passed via `buckets` prop. It never calls Server Actions.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SavingsSummaryCards } from '../SavingsSummaryCards';
import type { SavingsSummaryPerCurrency } from '@/types/savings';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      totalSaved: 'Total ahorrado',
      totalTargets: 'Total metas',
      overallProgress: 'Progreso general',
      activeGoal: 'meta activa',
      activeGoals: 'metas activas',
      thisMonth: 'Este mes',
      summary: 'Resumen',
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

  const copBucket: SavingsSummaryPerCurrency = {
    currency: 'COP',
    totalSavedCents: 100000,
    totalTargetCents: 200000,
    overallProgressPercentage: 50,
    activeGoalsCount: 2,
    completedGoalsCount: 0,
    monthlyContributedCents: 10000,
  };

  const usdBucket: SavingsSummaryPerCurrency = {
    ...copBucket,
    currency: 'USD',
    totalSavedCents: 50000,
    totalTargetCents: 100000,
    overallProgressPercentage: 30,
    monthlyContributedCents: 5000,
  };

  const renderCards = (buckets: SavingsSummaryPerCurrency[], error: string | null = null) =>
    render(
      <SavingsSummaryCards
        buckets={buckets}
        error={error}
        dictionary={defaultDictionary}
        locale="es-CO"
      />
    );

  it('should render the four summary cards for a single currency bucket', () => {
    renderCards([copBucket]);

    expect(screen.getByText('Total ahorrado')).toBeInTheDocument();
    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Total metas')).toBeInTheDocument();
    expect(screen.getByText('$2000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Progreso general')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByText('2 metas activas')).toBeInTheDocument();
    expect(screen.getByText('Este mes')).toBeInTheDocument();
    expect(screen.getByText('$100.00 COP')).toBeInTheDocument();
  });

  it('should render one row per currency bucket when several currencies exist', () => {
    renderCards([copBucket, usdBucket]);

    expect(screen.getByText('COP')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('$1000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('$500.00 USD')).toBeInTheDocument();
  });

  it('should use an emerald progress color when progress >= 50', () => {
    renderCards([copBucket]);

    const progressValue = screen.getByText('50.0%');
    expect(progressValue.className).toContain('text-emerald-400');
  });

  it('should use a slate progress color when progress < 25', () => {
    renderCards([{ ...copBucket, overallProgressPercentage: 10 }]);

    const progressValue = screen.getByText('10.0%');
    expect(progressValue.className).toContain('text-slate-400');
  });

  it('should render nothing when there are no buckets and no error', () => {
    const { container } = renderCards([]);

    expect(container.firstChild).toBeNull();
  });

  it('should show the error alert when the server fetch failed', () => {
    renderCards([], 'Error al cargar el resumen');

    expect(screen.getByRole('alert')).toHaveTextContent('Error al cargar el resumen');
  });
});
