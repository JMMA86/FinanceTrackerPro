/**
 * FixedExpensesCalendar Component Tests
 *
 * Locks month navigation within the loaded window, the accessible day buttons,
 * the per-day mini dialog and the "Pagar" hand-off.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FixedExpensesCalendar } from '../FixedExpensesCalendar';
import { makeExpense, makePayment } from './fixtures';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      calendar: 'Calendario',
      previousMonth: 'Mes anterior',
      nextMonth: 'Mes siguiente',
      noPaymentsThisMonth: 'No hay pagos programados este mes',
      paymentsOnDay: 'Pagos del día',
      noPaymentsOnDay: 'No hay pagos programados este día',
      viewDayPayments: 'Ver pagos del día',
      pay: 'Pagar',
      paid: 'Pagado',
      overdue: 'Vencido',
      pending: 'Pendiente',
      close: 'Cerrar',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn(
    (cents: number, currency: string) => `$${(cents / 100).toFixed(2)} ${currency}`
  ),
}));

const TODAY_ISO = new Date(2026, 8, 13).toISOString();
const dictionary = {};

function monthLabel(year: number, monthIndex: number): string {
  return new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' }).format(
    new Date(year, monthIndex, 1)
  );
}

function dayLabel(year: number, monthIndex: number, day: number): string {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, day));
}

describe('FixedExpensesCalendar', () => {
  const onPay = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
  });

  const expenses = [
    makeExpense({
      id: 'cexpense0000000000000001',
      name: 'Arriendo',
      payments: [
        makePayment({ id: 'p-sep', dueDate: new Date(2026, 8, 15), expectedAmountCents: 1500000 }),
        makePayment({ id: 'p-oct', dueDate: new Date(2026, 9, 5), expectedAmountCents: 1600000 }),
      ],
    }),
  ];

  const renderCalendar = (data = expenses) =>
    render(
      <FixedExpensesCalendar
        expenses={data}
        dictionary={dictionary}
        locale="es-CO"
        todayStartIso={TODAY_ISO}
        onPay={onPay}
      />
    );

  it('labels days with payments accessibly', () => {
    renderCalendar();

    const dayButton = screen.getByRole('button', {
      name: `Ver pagos del día: ${dayLabel(2026, 8, 15)} (1)`,
    });
    expect(dayButton).toBeInTheDocument();
  });

  it('starts on the current month and disables "previous" at the lower bound', () => {
    renderCalendar();

    expect(
      screen.getByRole('heading', { level: 3, name: monthLabel(2026, 8) })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).not.toBeDisabled();
  });

  it('navigates to the next month when it holds occurrences', () => {
    renderCalendar();

    fireEvent.click(screen.getByRole('button', { name: 'Mes siguiente' }));

    expect(
      screen.getByRole('heading', { level: 3, name: monthLabel(2026, 9) })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mes anterior' })).not.toBeDisabled();
  });

  it('opens a mini dialog listing the day payments and pays through onPay', () => {
    renderCalendar();

    fireEvent.click(
      screen.getByRole('button', {
        name: `Ver pagos del día: ${dayLabel(2026, 8, 15)} (1)`,
      })
    );

    expect(screen.getByText('Pagos del día')).toBeInTheDocument();
    // The expense name appears in the day cell dot AND in the dialog row.
    expect(screen.getAllByText('Arriendo').length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Pagar' }));

    expect(onPay).toHaveBeenCalledTimes(1);
    expect(onPay).toHaveBeenCalledWith(expenses[0], expenses[0].payments[0]);
  });

  it('shows the empty message when there are no materialized payments', () => {
    renderCalendar([]);

    expect(screen.getByText('No hay pagos programados este mes')).toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
