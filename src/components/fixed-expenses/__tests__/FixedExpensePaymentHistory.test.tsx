/**
 * FixedExpensePaymentHistory Component Tests
 *
 * Locks the two rendering modes:
 * - compact (limit): ONLY settled payments (paidDate != null), sorted by the
 *   paid date desc, showing that paid date, capped at `limit`.
 * - full (no limit): every payment sorted by due date desc, showing the due date.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { FixedExpensePaymentHistory } from '../FixedExpensePaymentHistory';
import { makePayment } from './fixtures';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      recentPayments: 'Pagos recientes',
      paymentHistory: 'Historial de pagos',
      noPayments: 'Aún no hay pagos registrados',
      paid: 'Pagado',
      overdue: 'Vencido',
      pending: 'Pendiente',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => {
    return `$${(cents / 100).toFixed(2)} ${currency}`;
  }),
}));

const TODAY_ISO = new Date(2026, 8, 13).toISOString();

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

describe('FixedExpensePaymentHistory', () => {
  const dictionary = {};

  describe('compact mode (limit provided)', () => {
    it('renders only settled payments sorted by paidDate desc and shows the paid date', () => {
      const older = makePayment({
        id: 'p-older',
        paidDate: new Date(2026, 7, 5),
        expectedAmountCents: 22200,
        paidAmountCents: 21600,
      });
      const newer = makePayment({
        id: 'p-newer',
        paidDate: new Date(2026, 8, 10),
        expectedAmountCents: 11100,
        paidAmountCents: 11100,
      });
      const pending = makePayment({
        id: 'p-pending',
        dueDate: new Date(2026, 8, 20),
        paidDate: null,
      });

      render(
        <FixedExpensePaymentHistory
          payments={[older, newer, pending]}
          dictionary={dictionary}
          locale="es-CO"
          todayStartIso={TODAY_ISO}
          limit={3}
        />
      );

      const rows = screen.getAllByRole('listitem');
      expect(rows).toHaveLength(2); // pending excluded
      expect(within(rows[0]).getByText('$111.00 COP')).toBeInTheDocument();
      expect(within(rows[1]).getByText('$216.00 COP')).toBeInTheDocument();
      // The shown date is the PAID date, not the due date.
      expect(within(rows[0]).getByText(formatDate(new Date(2026, 8, 10)))).toBeInTheDocument();
      expect(screen.getByText('Pagos recientes')).toBeInTheDocument();
    });

    it('caps the rendered rows at `limit` (most recent first)', () => {
      const payments = [1, 2, 3, 4].map((index) =>
        makePayment({
          id: `p-${index}`,
          paidDate: new Date(2026, index, 1),
          expectedAmountCents: index * 10000,
        })
      );

      render(
        <FixedExpensePaymentHistory
          payments={payments}
          dictionary={dictionary}
          locale="es-CO"
          todayStartIso={TODAY_ISO}
          limit={3}
        />
      );

      expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('renders nothing when no payment has been settled', () => {
      const { container } = render(
        <FixedExpensePaymentHistory
          payments={[makePayment({ id: 'p-1', paidDate: null })]}
          dictionary={dictionary}
          locale="es-CO"
          todayStartIso={TODAY_ISO}
          limit={3}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('full mode (no limit)', () => {
    it('renders every payment sorted by dueDate desc and shows the due date', () => {
      const january = makePayment({
        id: 'p-jan',
        dueDate: new Date(2026, 0, 10),
        paidDate: new Date(2026, 0, 10),
        expectedAmountCents: 10000,
      });
      const february = makePayment({
        id: 'p-feb',
        dueDate: new Date(2026, 1, 10),
        paidDate: null,
        expectedAmountCents: 20000,
      });

      render(
        <FixedExpensePaymentHistory
          payments={[january, february]}
          dictionary={dictionary}
          locale="es-CO"
          todayStartIso={TODAY_ISO}
        />
      );

      const rows = screen.getAllByRole('listitem');
      expect(rows).toHaveLength(2);
      // Feb (most recent due date) first. It is unpaid and already past the
      // reference "today" (Sep 2026) → overdue.
      expect(within(rows[0]).getByText('$200.00 COP')).toBeInTheDocument();
      expect(within(rows[0]).getByText('Vencido')).toBeInTheDocument();
      expect(within(rows[1]).getByText('$100.00 COP')).toBeInTheDocument();
      expect(within(rows[1]).getByText('Pagado')).toBeInTheDocument();
      expect(within(rows[1]).getByText(formatDate(new Date(2026, 0, 10)))).toBeInTheDocument();
      expect(screen.getByText('Historial de pagos')).toBeInTheDocument();
    });

    it('shows the empty message when there are no payments', () => {
      render(
        <FixedExpensePaymentHistory
          payments={[]}
          dictionary={dictionary}
          locale="es-CO"
          todayStartIso={TODAY_ISO}
        />
      );

      expect(screen.getByText('Aún no hay pagos registrados')).toBeInTheDocument();
      expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });
  });
});
