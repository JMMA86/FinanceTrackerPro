/**
 * TransactionFilters Component Tests
 * Tests search, type filter, date filters, clear functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionFilters } from '../TransactionFilters';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();

// We'll use a mutable object that can be replaced in beforeEach
let currentSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => currentSearchParams,
  usePathname: () => '/en/transactions',
}));

// Mock i18n get to actually return dictionary values
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((dict: Record<string, unknown>, key: string) => {
    return (dict as Record<string, string>)[key] ?? key;
  }),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const dictionary = {
  filters: 'Filters',
  description: 'Description',
  type: 'Type',
  dateFrom: 'From',
  dateTo: 'To',
  searchPlaceholder: 'Search transactions...',
  allTypes: 'All Types',
  income: 'Income',
  expense: 'Expense',
  transferIn: 'Transfer In',
  transferOut: 'Transfer Out',
  investment: 'Investment',
  loanPayment: 'Loan Payment',
  creditPayment: 'Credit Payment',
  clearFilters: 'Clear filters',
};

describe('TransactionFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Create fresh SearchParams for each test
    currentSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render search input, type dropdown, and date pickers', () => {
    render(<TransactionFilters dictionary={dictionary} />);

    expect(screen.getByLabelText('Search transactions...')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('should render with search role and aria-label', () => {
    render(<TransactionFilters dictionary={dictionary} />);

    const searchRegion = screen.getByRole('search');
    expect(searchRegion).toBeInTheDocument();
    expect(searchRegion).toHaveAttribute('aria-label', 'Filters');
  });

  it('should update URL params when typing a search query with debounce', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TransactionFilters dictionary={dictionary} />);

    const searchInput = screen.getByLabelText('Search transactions...');
    fireEvent.change(searchInput, { target: { value: 'food' } });

    // Should have local value immediately
    expect(searchInput).toHaveValue('food');

    // After debounce (300ms), should navigate
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(mockPush).toHaveBeenCalledWith('/en/transactions?search=food');
  });

  it('should update URL params when selecting a type', async () => {
    render(<TransactionFilters dictionary={dictionary} />);

    const typeSelect = screen.getByLabelText('Type');
    await userEvent.selectOptions(typeSelect, 'EXPENSE');

    expect(mockPush).toHaveBeenCalledWith('/en/transactions?type=EXPENSE');
  });

  it('should update URL params when selecting a date from', async () => {
    render(<TransactionFilters dictionary={dictionary} />);

    const dateFromInput = screen.getByLabelText('From');
    await userEvent.type(dateFromInput, '2024-06-01');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it('should update URL params when selecting a date to', async () => {
    render(<TransactionFilters dictionary={dictionary} />);

    const dateToInput = screen.getByLabelText('To');
    await userEvent.type(dateToInput, '2024-06-30');

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalled();
    });
  });

  it('should show clear filters button when filters are active', () => {
    currentSearchParams = new URLSearchParams('search=food&type=INCOME');

    render(<TransactionFilters dictionary={dictionary} />);

    expect(screen.getByText('Clear filters')).toBeInTheDocument();
  });

  it('should not show clear filters button when no filters are active', () => {
    render(<TransactionFilters dictionary={dictionary} />);

    expect(screen.queryByText('Clear filters')).not.toBeInTheDocument();
  });

  it('should clear all filters when clear button is clicked', async () => {
    currentSearchParams = new URLSearchParams('search=food&type=EXPENSE');

    render(<TransactionFilters dictionary={dictionary} />);

    const clearButton = screen.getByText('Clear filters');
    await userEvent.click(clearButton);

    expect(mockPush).toHaveBeenCalledWith('/en/transactions');
  });

  it('should show clear search button when search has text', () => {
    currentSearchParams = new URLSearchParams('search=food');

    render(<TransactionFilters dictionary={dictionary} />);

    const clearSearchButton = screen.getByLabelText('Clear search');
    expect(clearSearchButton).toBeInTheDocument();
  });

  it('should hide clear search button when search is empty', () => {
    render(<TransactionFilters dictionary={dictionary} />);

    expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument();
  });

  it('should reset to page 1 when filters change', async () => {
    currentSearchParams = new URLSearchParams('page=3');

    render(<TransactionFilters dictionary={dictionary} />);

    const typeSelect = screen.getByLabelText('Type');
    await userEvent.selectOptions(typeSelect, 'INCOME');

    // Page should be removed from URL (reset to 1)
    expect(mockPush).toHaveBeenCalledWith('/en/transactions?type=INCOME');
  });

  it('should be accessible with proper labels', () => {
    render(<TransactionFilters dictionary={dictionary} />);

    expect(screen.getByLabelText('Search transactions...')).toBeInTheDocument();
    expect(screen.getByLabelText('Type')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });

  it('should debounce search input to avoid excessive navigation', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TransactionFilters dictionary={dictionary} />);

    const searchInput = screen.getByLabelText('Search transactions...');

    // Type quickly with fireEvent (no intermediate debounce triggers)
    fireEvent.change(searchInput, { target: { value: 'abcdef' } });

    // Should not have navigated yet (debounce pending)
    expect(mockPush).not.toHaveBeenCalled();

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // Should have navigated once with final value
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/en/transactions?search=abcdef');
  });

  it('should cancel previous debounce when typing again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<TransactionFilters dictionary={dictionary} />);

    const searchInput = screen.getByLabelText('Search transactions...');

    // First change
    fireEvent.change(searchInput, { target: { value: 'abc' } });

    // Wait partial debounce time
    act(() => {
      vi.advanceTimersByTime(200);
    });

    // Second change before debounce fires
    fireEvent.change(searchInput, { target: { value: 'abcdef' } });

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(350);
    });

    // Should only navigate once with the final combined value
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/en/transactions?search=abcdef');
  });
});
