/**
 * FixedExpenseCard Component Tests
 *
 * The card badge reflects the CURRENT month (paid / overdue / pending) and the
 * actions (pay / edit / delete) dispatch the right callbacks with the payload.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FixedExpenseCard } from '../FixedExpenseCard';
import { makeExpense, makePayment, TEST_PAYMENT_ID } from './fixtures';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      amount: 'Monto',
      nextPayment: 'Próximo pago',
      paid: 'Pagado',
      pending: 'Pendiente',
      overdue: 'Vencido',
      pay: 'Pagar',
      payNow: 'Pagar ahora',
      edit: 'Editar',
      delete: 'Eliminar',
      recentPayments: 'Pagos recientes',
      paymentHistory: 'Historial de pagos',
      noPayments: 'Aún no hay pagos',
      'frequencies.DAILY': 'Diario',
      'frequencies.WEEKLY': 'Semanal',
      'frequencies.BIWEEKLY': 'Quincenal',
      'frequencies.MONTHLY': 'Mensual',
      'frequencies.QUARTERLY': 'Trimestral',
      'frequencies.YEARLY': 'Anual',
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

describe('FixedExpenseCard', () => {
  const onPay = vi.fn();
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const dictionary = {};

  const renderCard = (expense = makeExpense(), handlers = { onPay, onEdit, onDelete }) =>
    render(
      <FixedExpenseCard
        expense={expense}
        dictionary={dictionary}
        locale="es-CO"
        todayStartIso={TODAY_ISO}
        onPay={handlers.onPay}
        onEdit={handlers.onEdit}
        onDelete={handlers.onDelete}
      />
    );

  it('renders the name, amount, frequency and aria-label', () => {
    renderCard();

    expect(screen.getByText('Arriendo')).toBeInTheDocument();
    expect(screen.getByText('$15000.00 COP')).toBeInTheDocument();
    expect(screen.getByText('Mensual')).toBeInTheDocument();
    expect(screen.getByRole('article')).toHaveAttribute('aria-label', 'Arriendo - Mensual');
  });

  it('shows the paid badge when every current-month occurrence is paid', () => {
    renderCard(
      makeExpense({
        payments: [
          makePayment({
            id: 'p-1',
            dueDate: new Date(2026, 8, 15),
            paidDate: new Date(2026, 8, 10),
          }),
        ],
      })
    );

    // "Pagado" shows both as the status badge and as the next-payment fallback.
    expect(screen.getAllByText('Pagado').length).toBeGreaterThanOrEqual(1);
  });

  it('shows the overdue badge when a current-month occurrence is past due and unpaid', () => {
    renderCard(
      makeExpense({
        payments: [makePayment({ id: 'p-1', dueDate: new Date(2026, 8, 5), paidDate: null })],
      })
    );

    expect(screen.getByText('Vencido')).toBeInTheDocument();
  });

  it('shows the pending badge when the current-month occurrence is still in the future', () => {
    renderCard(
      makeExpense({
        payments: [makePayment({ id: 'p-1', dueDate: new Date(2026, 8, 20), paidDate: null })],
      })
    );

    expect(screen.getByText('Pendiente')).toBeInTheDocument();
  });

  it('calls onPay with the soonest unpaid payment', () => {
    const later = makePayment({ id: 'p-later', dueDate: new Date(2026, 8, 25), paidDate: null });
    const sooner = makePayment({ id: 'p-sooner', dueDate: new Date(2026, 8, 20), paidDate: null });
    const paid = makePayment({
      id: 'p-paid',
      dueDate: new Date(2026, 7, 1),
      paidDate: new Date(2026, 7, 1),
    });

    renderCard(makeExpense({ payments: [later, sooner, paid] }));

    fireEvent.click(screen.getByRole('button', { name: 'Pagar - Arriendo' }));
    expect(onPay).toHaveBeenCalledWith(sooner);
  });

  it('disables the pay button and shows "Pagado" when there is no unpaid payment', () => {
    renderCard(
      makeExpense({
        payments: [
          makePayment({
            id: 'p-1',
            dueDate: new Date(2026, 8, 15),
            paidDate: new Date(2026, 8, 10),
          }),
        ],
      })
    );

    const payButton = screen.getByRole('button', { name: 'Pagar - Arriendo' });
    expect(payButton).toBeDisabled();
    expect(screen.queryByText('Próximo pago:')).not.toBeInTheDocument();
  });

  it('calls onEdit and onDelete with the expense', () => {
    const expense = makeExpense();
    renderCard(expense);

    fireEvent.click(screen.getByRole('button', { name: 'Editar - Arriendo' }));
    expect(onEdit).toHaveBeenCalledWith(expense);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar - Arriendo' }));
    expect(onDelete).toHaveBeenCalledWith(expense);
  });

  it('renders a hex color as a solid header bar style', () => {
    const { container } = renderCard(makeExpense({ color: '#ff0000' }));

    const header = Array.from(container.querySelectorAll('div[aria-hidden="true"]')).find(
      (element) => (element as HTMLElement).style.background !== ''
    ) as HTMLElement | undefined;
    expect(header?.style.background).toContain('rgb(255, 0, 0)');
  });

  it('falls back to the amber gradient when no custom color is set', () => {
    const { container } = renderCard(makeExpense({ color: null }));

    expect(container.querySelector('.bg-gradient-to-r')).toBeInTheDocument();
  });

  it('renders a compact recent-payment history limited to 3 settled payments', () => {
    const payments = [1, 2, 3, 4].map((index) =>
      makePayment({
        id: `p-${index}`,
        paidDate: new Date(2026, index, 1),
        paidAmountCents: index * 1000,
      })
    );

    const { container } = renderCard(makeExpense({ payments }));

    expect(screen.getByText('Pagos recientes')).toBeInTheDocument();
    const rows = within(container).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
  });

  it('renders an allow-listed icon without crashing (fallback included)', () => {
    const { container } = renderCard(makeExpense({ icon: 'home' }));
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);
  });

  it('exposes the next due date of the soonest unpaid payment', () => {
    renderCard(
      makeExpense({
        payments: [
          makePayment({ id: TEST_PAYMENT_ID, dueDate: new Date(2026, 8, 20), paidDate: null }),
        ],
      })
    );

    expect(screen.getByText('Próximo pago:')).toBeInTheDocument();
    const date = new Date(2026, 8, 20).toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    expect(screen.getByText(date)).toBeInTheDocument();
  });
});
