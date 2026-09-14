/**
 * Variable Expenses Page (server component) tests.
 *
 * The page resolves month/year from searchParams, fetches once via the
 * server-only data module and forwards serializable props to the client view.
 * src/app/** is excluded from coverage — these lock the wiring and metadata.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import VariableExpensesPage, {
  generateMetadata,
} from '@/app/[lang]/(dashboard)/variable-expenses/page';
import { getVariableExpensesPageData } from '@/app/[lang]/(dashboard)/variable-expenses/data';
import type {
  VariableExpenseDefinition,
  VariableExpensesOverviewResponse,
} from '@/types/variable-expense';

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
}));

const { viewSpy } = vi.hoisted(() => ({
  viewSpy: { props: null as Record<string, unknown> | null },
}));

vi.mock('@/app/[lang]/(dashboard)/variable-expenses/data', () => ({
  getVariableExpensesPageData: vi.fn(),
}));

vi.mock('@/components/variable-expenses/VariableExpensesView', () => ({
  VariableExpensesView: (props: Record<string, unknown>) => {
    viewSpy.props = props;
    return <div data-testid="variable-expenses-view" />;
  },
}));

const overview: VariableExpensesOverviewResponse = { month: 9, year: 2026, byCurrency: [] };
const definitions: VariableExpenseDefinition[] = [];

describe('VariableExpensesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    viewSpy.props = null;
    vi.mocked(getVariableExpensesPageData).mockResolvedValue({
      overview,
      definitions,
      overviewError: false,
      definitionsError: false,
    });
  });

  it('resolves the month/year from searchParams and forwards the loaded data', async () => {
    const element = await VariableExpensesPage({
      params: Promise.resolve({ lang: 'es' }),
      searchParams: Promise.resolve({ month: '9', year: '2026' }),
    });
    render(element);

    expect(viewSpy.props).not.toBeNull();
    expect(viewSpy.props!.month).toBe(9);
    expect(viewSpy.props!.year).toBe(2026);
    expect(viewSpy.props!.overview).toEqual(overview);
    expect(viewSpy.props!.definitions).toEqual(definitions);
    expect(viewSpy.props!.overviewError).toBeNull();
  });

  it('clamps an out-of-range month into 1-12', async () => {
    const element = await VariableExpensesPage({
      params: Promise.resolve({ lang: 'es' }),
      searchParams: Promise.resolve({ month: '99', year: '1999' }),
    });
    render(element);

    expect(viewSpy.props!.month).toBe(12);
    expect(viewSpy.props!.year).toBe(2000);
  });

  it('falls back to the current period when searchParams are absent', async () => {
    const now = new Date();
    const element = await VariableExpensesPage({
      params: Promise.resolve({ lang: 'es' }),
      searchParams: Promise.resolve({}),
    });
    render(element);

    expect(viewSpy.props!.month).toBe(now.getMonth() + 1);
    expect(viewSpy.props!.year).toBe(now.getFullYear());
  });

  describe('generateMetadata', () => {
    it('returns the es title and og url', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ lang: 'es' }),
        searchParams: Promise.resolve({}),
      });

      expect(meta.title).toBe('Gastos Variables | FinanceTrackerPro');
      expect(meta.openGraph?.locale).toBe('es_CO');
      expect(meta.openGraph?.url).toBe('https://financetrackerpro.com/es/variable-expenses');
    });

    it('returns the en title and og url', async () => {
      const meta = await generateMetadata({
        params: Promise.resolve({ lang: 'en' }),
        searchParams: Promise.resolve({}),
      });

      expect(meta.title).toBe('Variable Expenses | FinanceTrackerPro');
      expect(meta.openGraph?.locale).toBe('en_US');
      expect(meta.openGraph?.url).toBe('https://financetrackerpro.com/en/variable-expenses');
    });
  });
});
