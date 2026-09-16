/**
 * Fixed Expenses Page (server component) tests
 *
 * Mocks the server-only data module + child components so the wiring
 * (buckets/expenses props, error messages) and the dictionary-driven
 * heading/metadata are locked without a browser.
 *
 * NOTE: src/app/** is excluded from the coverage report; this file exists to
 * lock page behavior, mirroring the savings page test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import FixedExpensesPage, { generateMetadata } from '@/app/[lang]/(dashboard)/fixed-expenses/page';
import { getFixedExpensesPageData } from '@/app/[lang]/(dashboard)/fixed-expenses/data';
import { FixedExpensesSummaryCards } from '@/components/fixed-expenses/FixedExpensesSummaryCards';
import { FixedExpensesView } from '@/components/fixed-expenses/FixedExpensesView';
import type { FixedExpenseWithPayments } from '@/types/fixed-expense';

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
}));

vi.mock('@/app/[lang]/(dashboard)/fixed-expenses/data', () => ({
  getFixedExpensesPageData: vi.fn(),
}));

vi.mock('@/components/fixed-expenses/FixedExpensesSummaryCards', () => ({
  FixedExpensesSummaryCards: vi.fn(() => <div data-testid="summary-cards" />),
}));

vi.mock('@/components/fixed-expenses/FixedExpensesView', () => ({
  FixedExpensesView: vi.fn(() => <div data-testid="view" />),
}));

const expense = {
  id: 'cexpense0000000000000001',
  userId: 'user-1',
  name: 'Arriendo',
  description: null,
  amountCents: 1500000,
  currency: 'COP',
  frequency: 'MONTHLY',
  dayOfPayment: 1,
  startDate: new Date('2026-01-01'),
  endDate: null,
  color: null,
  icon: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  deletedAt: null,
  createdBy: 'user-1',
  lastModifiedBy: 'user-1',
  ipAddress: null,
  userAgent: null,
  payments: [],
} as FixedExpenseWithPayments;

const summaryBucket = {
  currency: 'COP' as const,
  totalCommittedCents: 1500000,
  totalPaidCents: 0,
  totalPendingCents: 1500000,
  totalOverdueCents: 0,
  activeCount: 1,
};

describe('FixedExpensesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getFixedExpensesPageData as ReturnType<typeof vi.fn>).mockResolvedValue({
      expenses: [expense],
      summaryBuckets: [summaryBucket],
      expensesError: false,
      summaryError: false,
    });
  });

  it('renders the es heading from the dictionary', async () => {
    const element = await FixedExpensesPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    expect(screen.getByRole('heading', { level: 1, name: 'Gastos Fijos' })).toBeInTheDocument();
  });

  it('renders the en heading from the dictionary', async () => {
    const element = await FixedExpensesPage({ params: Promise.resolve({ lang: 'en' }) });
    render(element);

    expect(screen.getByRole('heading', { level: 1, name: 'Fixed Expenses' })).toBeInTheDocument();
  });

  it('passes the per-currency buckets to FixedExpensesSummaryCards', async () => {
    const element = await FixedExpensesPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    const calls = vi.mocked(FixedExpensesSummaryCards).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].buckets).toHaveLength(1);
    expect(calls[0][0].buckets[0].totalCommittedCents).toBe(1500000);
    expect(calls[0][0].error).toBeNull();
  });

  it('passes the fetched expenses and error state to FixedExpensesView', async () => {
    const element = await FixedExpensesPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    const calls = vi.mocked(FixedExpensesView).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].expenses).toHaveLength(1);
    expect(calls[0][0].expenses[0].name).toBe('Arriendo');
    expect(calls[0][0].loadError).toBeNull();
  });

  it('maps a failed expenses read to the loadFailed message', async () => {
    (getFixedExpensesPageData as ReturnType<typeof vi.fn>).mockResolvedValue({
      expenses: [],
      summaryBuckets: [summaryBucket],
      expensesError: true,
      summaryError: false,
    });

    const element = await FixedExpensesPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    const calls = vi.mocked(FixedExpensesView).mock.calls;
    expect(calls[0][0].loadError).toBe('No se pudieron cargar los gastos fijos');
    expect(calls[0][0].expenses).toEqual([]);
  });

  it('reads the page data with the current month/year', async () => {
    const element = await FixedExpensesPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    expect(getFixedExpensesPageData).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
  });

  describe('generateMetadata', () => {
    it('returns the es title, description and og locale', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ lang: 'es' }) });

      expect(meta.title).toBe('Gastos Fijos | FinanceTrackerPro');
      expect(meta.description).toBe(
        'Administra tus gastos fijos, programa los pagos del mes y controla los vencimientos.'
      );
      expect(meta.openGraph?.locale).toBe('es_CO');
      expect(meta.openGraph?.url).toBe('https://financetrackerpro.com/es/fixed-expenses');
    });

    it('returns the en title, description and og locale', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ lang: 'en' }) });

      expect(meta.title).toBe('Fixed Expenses | FinanceTrackerPro');
      expect(meta.description).toBe(
        'Manage your fixed expenses, schedule monthly payments and track due dates.'
      );
      expect(meta.openGraph?.locale).toBe('en_US');
      expect(meta.openGraph?.url).toBe('https://financetrackerpro.com/en/fixed-expenses');
    });
  });
});
