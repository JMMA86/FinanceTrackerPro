/**
 * FixedExpensesView Component Tests
 *
 * Client orchestrator: view toggle (cards/calendar), upcoming-payments horizon
 * selector, and the error / empty states. Server data always arrives via props.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { FixedExpensesView } from '../FixedExpensesView';
import { makeExpense, makePayment } from './fixtures';

const { mockRefresh } = vi.hoisted(() => ({ mockRefresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));

vi.mock('@/actions/fixed-expense.actions', () => ({
  createFixedExpense: vi.fn().mockResolvedValue({ success: true }),
  updateFixedExpense: vi.fn().mockResolvedValue({ success: true }),
  deleteFixedExpense: vi.fn().mockResolvedValue({ success: true }),
  payFixedExpense: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      title: 'Gastos Fijos',
      viewCards: 'Tarjetas',
      viewCalendar: 'Calendario',
      addFixedExpense: 'Nuevo Gasto Fijo',
      newFixedExpense: 'Nuevo Gasto Fijo',
      noFixedExpenses: 'No tienes gastos fijos',
      noFixedExpensesDesc: 'Crea tu primer gasto recurrente.',
      upcomingPayments: 'Próximos pagos',
      upcomingRange: 'Rango de próximos pagos',
      rangeWeek: 'Próxima semana',
      rangeMonth: 'Próximo mes',
      rangeQuarter: 'Próximo trimestre',
      noPayments: 'Aún no hay pagos registrados',
      retry: 'Reintentar',
      pay: 'Pagar',
      paid: 'Pagado',
      pending: 'Pendiente',
      overdue: 'Vencido',
      expense: 'gasto',
      expenses: 'gastos',
      calendar: 'Calendario',
      previousMonth: 'Mes anterior',
      nextMonth: 'Mes siguiente',
      viewDayPayments: 'Ver pagos del día',
      paymentsOnDay: 'Pagos del día',
      noPaymentsOnDay: 'No hay pagos programados este día',
      noPaymentsThisMonth: 'No hay pagos programados este mes',
      cancel: 'Cancelar',
      close: 'Cerrar',
      save: 'Guardar',
      delete: 'Eliminar',
      edit: 'Editar',
      loading: 'Cargando...',
      'frequencies.MONTHLY': 'Mensual',
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
const TODAY_DATE = '2026-09-13';
const dictionary = {};

describe('FixedExpensesView', () => {
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

  const renderView = (expenses = [makeExpense()], loadError: string | null = null) =>
    render(
      <FixedExpensesView
        expenses={expenses}
        loadError={loadError}
        dictionary={dictionary}
        locale="es-CO"
        todayStartIso={TODAY_ISO}
        todayDate={TODAY_DATE}
      />
    );

  it('renders the cards view by default', () => {
    renderView();

    expect(screen.getByRole('button', { name: 'Tarjetas' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Calendario' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByText('1 gasto')).toBeInTheDocument();
  });

  it('toggles between cards and calendar views', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));

    expect(screen.getByRole('button', { name: 'Calendario' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('region', { name: 'Calendario' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tarjetas' }));

    expect(screen.getByRole('button', { name: 'Tarjetas' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.queryByRole('region', { name: 'Calendario' })).not.toBeInTheDocument();
  });

  it('filters upcoming payments by the selected horizon', () => {
    const renta = makeExpense({
      id: 'cexpense0000000000000001',
      name: 'Renta',
      payments: [makePayment({ id: 'p-5', dueDate: new Date(2026, 8, 18) })],
    });
    const internet = makeExpense({
      id: 'cexpense0000000000000002',
      name: 'Internet',
      payments: [makePayment({ id: 'p-20', dueDate: new Date(2026, 9, 3) })],
    });
    const seguro = makeExpense({
      id: 'cexpense0000000000000003',
      name: 'Seguro',
      payments: [makePayment({ id: 'p-60', dueDate: new Date(2026, 10, 12) })],
    });

    renderView([renta, internet, seguro]);

    const aside = screen.getByRole('complementary', { name: 'Próximos pagos' });
    // Default horizon: next 30 days → +5d and +20d, not +60d.
    expect(within(aside).getByText('Renta')).toBeInTheDocument();
    expect(within(aside).getByText('Internet')).toBeInTheDocument();
    expect(within(aside).queryByText('Seguro')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(within(aside).getByText('Renta')).toBeInTheDocument();
    expect(within(aside).queryByText('Internet')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próximo trimestre' }));
    expect(within(aside).getByText('Renta')).toBeInTheDocument();
    expect(within(aside).getByText('Internet')).toBeInTheDocument();
    expect(within(aside).getByText('Seguro')).toBeInTheDocument();
  });

  it('renders the empty state when there are no templates', () => {
    renderView([]);

    expect(screen.getByText('No tienes gastos fijos')).toBeInTheDocument();
    expect(screen.getByText('Crea tu primer gasto recurrente.')).toBeInTheDocument();
    // Toolbar + empty-state buttons both offer "Nuevo Gasto Fijo".
    expect(
      screen.getAllByRole('button', { name: 'Nuevo Gasto Fijo' }).length
    ).toBeGreaterThanOrEqual(1);
  });

  it('renders the error state and retries on demand', () => {
    renderView([], 'No se pudieron cargar los gastos fijos');

    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los gastos fijos');

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(mockRefresh).toHaveBeenCalled();
  });
});
