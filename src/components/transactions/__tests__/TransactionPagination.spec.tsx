/**
 * TransactionPagination Component Tests
 * Tests navigation buttons, disabled states, URL updates, accessibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransactionPagination } from '../TransactionPagination';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = vi.fn();
let mockSearchParamsValue = new URLSearchParams('');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParamsValue,
  usePathname: () => '/en/transactions',
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const labels: Record<string, string> = {
      title: 'Transactions',
      previousPage: 'Previous',
      nextPage: 'Next',
    };
    return labels[key] ?? key;
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TransactionPagination', () => {
  const dictionary = {
    title: 'Transactions',
    previousPage: 'Previous',
    nextPage: 'Next',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render nothing when totalPages <= 1', () => {
    const { container } = render(
      <TransactionPagination currentPage={1} totalPages={1} dictionary={dictionary} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should render prev and next buttons when multiple pages', () => {
    render(<TransactionPagination currentPage={2} totalPages={5} dictionary={dictionary} />);

    const prevButton = screen.getByLabelText('Previous');
    const nextButton = screen.getByLabelText('Next');

    expect(prevButton).toBeInTheDocument();
    expect(nextButton).toBeInTheDocument();
  });

  it('should disable prev button on page 1', () => {
    render(<TransactionPagination currentPage={1} totalPages={5} dictionary={dictionary} />);

    const prevButton = screen.getByLabelText('Previous');
    expect(prevButton).toBeDisabled();
  });

  it('should disable next button on last page', () => {
    render(<TransactionPagination currentPage={5} totalPages={5} dictionary={dictionary} />);

    const nextButton = screen.getByLabelText('Next');
    expect(nextButton).toBeDisabled();
  });

  it('should enable both buttons on middle pages', () => {
    render(<TransactionPagination currentPage={3} totalPages={5} dictionary={dictionary} />);

    const prevButton = screen.getByLabelText('Previous');
    const nextButton = screen.getByLabelText('Next');

    expect(prevButton).not.toBeDisabled();
    expect(nextButton).not.toBeDisabled();
  });

  it('should display current page and total pages', () => {
    render(<TransactionPagination currentPage={3} totalPages={10} dictionary={dictionary} />);

    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('should navigate to previous page when clicking prev', async () => {
    render(<TransactionPagination currentPage={3} totalPages={5} dictionary={dictionary} />);

    const prevButton = screen.getByLabelText('Previous');
    await userEvent.click(prevButton);

    expect(mockPush).toHaveBeenCalledWith('/en/transactions?page=2');
  });

  it('should navigate to next page when clicking next', async () => {
    render(<TransactionPagination currentPage={3} totalPages={5} dictionary={dictionary} />);

    const nextButton = screen.getByLabelText('Next');
    await userEvent.click(nextButton);

    expect(mockPush).toHaveBeenCalledWith('/en/transactions?page=4');
  });

  it('should remove page param when going to page 1', async () => {
    render(<TransactionPagination currentPage={2} totalPages={5} dictionary={dictionary} />);

    const prevButton = screen.getByLabelText('Previous');
    await userEvent.click(prevButton);

    expect(mockPush).toHaveBeenCalledWith('/en/transactions');
  });

  it('should preserve existing search params when navigating', async () => {
    mockSearchParamsValue = new URLSearchParams('search=food&type=INCOME');

    render(<TransactionPagination currentPage={2} totalPages={5} dictionary={dictionary} />);

    const nextButton = screen.getByLabelText('Next');
    await userEvent.click(nextButton);

    expect(mockPush).toHaveBeenCalledWith('/en/transactions?search=food&type=INCOME&page=3');
  });

  it('should be accessible with navigation role and aria-labels', () => {
    render(<TransactionPagination currentPage={2} totalPages={5} dictionary={dictionary} />);

    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveAttribute('aria-label', 'Transactions');

    const prevButton = screen.getByLabelText('Previous');
    const nextButton = screen.getByLabelText('Next');

    expect(prevButton).toHaveAttribute('aria-label', 'Previous');
    expect(nextButton).toHaveAttribute('aria-label', 'Next');
  });
});
