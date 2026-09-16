/**
 * Savings Page (server component) tests
 *
 * The page is server-side: it reads goals/summary/max-spendable once through
 * the server-only data module and passes serializable props down. We mock the
 * data module + child components so we can assert wiring (buckets/goals props)
 * and the real dictionary-driven heading/metadata without a browser.
 *
 * NOTE: src/app/** is excluded from the coverage report, so this file does not
 * affect the global threshold — it exists to lock page behavior.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SavingsPage, { generateMetadata } from '@/app/[lang]/(dashboard)/savings/page';
import { getSavingsPageData } from '@/app/[lang]/(dashboard)/savings/data';
import { SavingsSummaryCards } from '@/components/savings/SavingsSummaryCards';
import { SavingsGoalsGrid } from '@/components/savings/SavingsGoalsGrid';
import { MaxSpendableCard } from '@/components/savings/MaxSpendableCard';
import type { SavingsGoalWithProgress } from '@/types/savings';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('next/cache', () => ({
  unstable_noStore: vi.fn(),
}));

vi.mock('@/app/[lang]/(dashboard)/savings/data', () => ({
  getSavingsPageData: vi.fn(),
}));

vi.mock('@/components/savings/SavingsSummaryCards', () => ({
  SavingsSummaryCards: vi.fn(() => <div data-testid="summary-cards" />),
}));

vi.mock('@/components/savings/SavingsGoalsGrid', () => ({
  SavingsGoalsGrid: vi.fn(() => <div data-testid="goals-grid" />),
}));

vi.mock('@/components/savings/MaxSpendableCard', () => ({
  MaxSpendableCard: vi.fn(() => <div data-testid="max-spendable-card" />),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const goal: SavingsGoalWithProgress = {
  id: 'clh1234567890abcdefghij',
  userId: 'user-1',
  name: 'Vacaciones 2026',
  description: 'Ahorro para viaje',
  type: 'ANNUAL',
  targetAmountCents: 200000,
  currency: 'COP',
  currentAmountCents: 50000,
  deadline: null,
  monthlyContributionCents: 25000,
  linkedAccountId: null,
  linkedAccount: null,
  status: 'ACTIVE',
  priority: 0,
  color: null,
  icon: null,
  idempotencyKey: null,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
  createdBy: 'user-1',
  lastModifiedBy: 'user-1',
  ipAddress: null,
  userAgent: null,
  progressPercentage: 25,
  projectedCompletion: null,
  contributions: [],
};

const summaryBucket = {
  currency: 'COP',
  totalSavedCents: 50000,
  totalTargetCents: 200000,
  overallProgressPercentage: 25,
  activeGoalsCount: 1,
  completedGoalsCount: 0,
  monthlyContributedCents: 25000,
};

const maxSpendableBucket = {
  currency: 'USD',
  totalIncomeCents: 500,
  totalFixedExpensesCents: 0,
  totalSavingsCommitmentsCents: 0,
  totalVariableExpensesCents: 0,
  maxSpendableCents: 500,
};

describe('SavingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getSavingsPageData as ReturnType<typeof vi.fn>).mockResolvedValue({
      goals: [goal],
      summaryBuckets: [summaryBucket],
      maxSpendableBuckets: [maxSpendableBucket],
      goalsError: false,
      summaryError: false,
      maxSpendableError: false,
    });
  });

  it('renders the es heading from the dictionary', async () => {
    const element = await SavingsPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    expect(screen.getByRole('heading', { level: 1, name: 'Ahorros' })).toBeInTheDocument();
  });

  it('renders the en heading from the dictionary', async () => {
    const element = await SavingsPage({ params: Promise.resolve({ lang: 'en' }) });
    render(element);

    expect(screen.getByRole('heading', { level: 1, name: 'Savings' })).toBeInTheDocument();
  });

  it('passes the fetched goals to SavingsGoalsGrid', async () => {
    const element = await SavingsPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    const calls = vi.mocked(SavingsGoalsGrid).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].goals).toHaveLength(1);
    expect(calls[0][0].goals[0].name).toBe('Vacaciones 2026');
    expect(calls[0][0].goals[0].currency).toBe('COP');
  });

  it('passes the per-currency summary buckets to SavingsSummaryCards', async () => {
    const element = await SavingsPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    const calls = vi.mocked(SavingsSummaryCards).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].buckets).toHaveLength(1);
    expect(calls[0][0].buckets[0].currency).toBe('COP');
    expect(calls[0][0].buckets[0].totalSavedCents).toBe(50000);
  });

  it('passes the per-currency max spendable buckets to MaxSpendableCard', async () => {
    const element = await SavingsPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    const calls = vi.mocked(MaxSpendableCard).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0][0].buckets).toHaveLength(1);
    expect(calls[0][0].buckets[0].currency).toBe('USD');
  });

  it('reads the page data with the current month/year', async () => {
    const element = await SavingsPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    expect(getSavingsPageData).toHaveBeenCalledWith(expect.any(Number), expect.any(Number));
  });

  it('falls back to an empty goals grid when the goals read fails', async () => {
    (getSavingsPageData as ReturnType<typeof vi.fn>).mockResolvedValue({
      goals: [],
      summaryBuckets: [summaryBucket],
      maxSpendableBuckets: [maxSpendableBucket],
      goalsError: true,
      summaryError: false,
      maxSpendableError: false,
    });

    const element = await SavingsPage({ params: Promise.resolve({ lang: 'es' }) });
    render(element);

    const calls = vi.mocked(SavingsGoalsGrid).mock.calls;
    expect(calls[0][0].goals).toEqual([]);
    expect(calls[0][0].loadError).toBe('No se pudieron cargar los ahorros');
  });

  describe('generateMetadata', () => {
    it('returns the es title, description and og locale', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ lang: 'es' }) });

      expect(meta.title).toBe('Ahorros | FinanceTrackerPro');
      expect(meta.description).toBe('Define metas de ahorro y sigue tu progreso financiero.');
      expect(meta.openGraph?.locale).toBe('es_CO');
      expect(meta.openGraph?.url).toBe('https://financetrackerpro.com/es/savings');
    });

    it('returns the en title, description and og locale', async () => {
      const meta = await generateMetadata({ params: Promise.resolve({ lang: 'en' }) });

      expect(meta.title).toBe('Savings | FinanceTrackerPro');
      expect(meta.description).toBe('Set savings goals and track your financial progress.');
      expect(meta.openGraph?.locale).toBe('en_US');
      expect(meta.openGraph?.url).toBe('https://financetrackerpro.com/en/savings');
    });
  });
});
