/**
 * TransactionList Component Tests
 * Sorting (newest first), 8-item cap, income/expense rendering, empty state,
 * memo behavior.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionList } from '../TransactionList';
import type { Currency } from '@prisma/client';

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => `${currency} ${cents}`),
}));

function makeTx(
  id: string,
  description: string | null,
  amount: number,
  date: Date,
  type = 'EXPENSE'
) {
  return { id, description, amount, currency: 'COP' as Currency, type, date };
}

const older = makeTx('t-1', 'Compra', -5000, new Date('2026-01-01'));
const middle = makeTx('t-2', 'Salario', 100000, new Date('2026-02-01'), 'INCOME');
const newer = makeTx('t-3', null, -10000, new Date('2026-03-01'));

describe('TransactionList', () => {
  it('renders the empty message when there are no transactions', () => {
    render(<TransactionList transactions={[]} emptyMessage="Sin movimientos" />);
    expect(screen.getByText('Sin movimientos')).toBeInTheDocument();
  });

  it('sorts transactions newest first', () => {
    render(<TransactionList transactions={[older, newer, middle]} />);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(3);
    // Newest first: t-3 (2026-03-01), then t-2 (2026-02-01), then t-1 (2026-01-01)
    expect(listItems[0]).toHaveTextContent('EXPENSE');
    expect(listItems[1]).toHaveTextContent('Salario');
    expect(listItems[2]).toHaveTextContent('Compra');
  });

  it('caps the rendered list at 8 most recent transactions', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeTx(`t-${i}`, `Tx ${i}`, -100, new Date(2026, 0, i + 1))
    );
    render(<TransactionList transactions={many} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(8);
  });

  it('renders income with a plus sign and expense with a minus sign', () => {
    render(<TransactionList transactions={[middle, older]} />);

    expect(screen.getByText('+COP 100000')).toBeInTheDocument();
    expect(screen.getByText('-COP 5000')).toBeInTheDocument();
  });

  it('falls back to the transaction type when there is no description', () => {
    render(<TransactionList transactions={[newer]} />);
    expect(screen.getByText('EXPENSE')).toBeInTheDocument();
  });

  it('renders a formatted date for each transaction', () => {
    const { container } = render(<TransactionList transactions={[older]} />);
    const dateParagraphs = container.querySelectorAll('p.text-slate-500');
    expect(dateParagraphs).toHaveLength(1);
    expect(dateParagraphs[0].textContent?.trim().length).toBeGreaterThan(0);
  });
});
