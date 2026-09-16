/**
 * NewTransactionButton Component Tests
 * Tests button rendering, click handler, and accessibility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NewTransactionButton } from '../NewTransactionButton';

// ---------------------------------------------------------------------------
// Mock Zustand UI Store
// ---------------------------------------------------------------------------

const mockOpenModal = vi.fn();

vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      openModal: mockOpenModal,
      closeModal: vi.fn(),
      addNotification: vi.fn(),
      activeModal: null,
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const labels: Record<string, string> = {
      newTransaction: 'New Transaction',
    };
    return labels[key] ?? key;
  }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('NewTransactionButton', () => {
  const dictionary = {
    newTransaction: 'New Transaction',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the button with correct text', () => {
    render(<NewTransactionButton dictionary={dictionary} />);

    const button = screen.getByRole('button', { name: /New Transaction/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('New Transaction');
  });

  it('should call openModal with create-transaction on click', async () => {
    render(<NewTransactionButton dictionary={dictionary} />);

    const button = screen.getByRole('button', { name: /New Transaction/i });
    await userEvent.click(button);

    expect(mockOpenModal).toHaveBeenCalledWith('create-transaction');
  });

  it('should have proper focus styles (focus-visible)', () => {
    render(<NewTransactionButton dictionary={dictionary} />);

    const button = screen.getByRole('button', { name: /New Transaction/i });
    expect(button).toHaveClass('focus-visible:outline-none');
    expect(button).toHaveClass('focus-visible:ring-2');
    expect(button).toHaveClass('focus-visible:ring-blue-400');
  });

  it('should be a type="button" button', () => {
    render(<NewTransactionButton dictionary={dictionary} />);

    const button = screen.getByRole('button', { name: /New Transaction/i });
    expect(button).toHaveAttribute('type', 'button');
  });

  it('should render as enabled by default', () => {
    render(<NewTransactionButton dictionary={dictionary} />);

    const button = screen.getByRole('button', { name: /New Transaction/i });
    expect(button).toBeEnabled();
  });

  it('should render disabled when disabled prop is true', () => {
    render(<NewTransactionButton dictionary={dictionary} disabled />);

    const button = screen.getByRole('button', { name: /New Transaction/i });
    expect(button).toBeDisabled();
    expect(button).toHaveClass('disabled:opacity-50');
    expect(button).toHaveClass('disabled:cursor-not-allowed');
  });

  it('should not open the create-transaction modal when disabled', async () => {
    render(<NewTransactionButton dictionary={dictionary} disabled />);

    const button = screen.getByRole('button', { name: /New Transaction/i });
    await userEvent.click(button);

    expect(mockOpenModal).not.toHaveBeenCalled();
  });
});
