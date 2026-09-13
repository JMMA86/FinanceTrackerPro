/**
 * PayFixedExpenseModal Component Tests
 *
 * Locks account auto-selection/filtering by currency, the friendly no-account
 * notice, the stable idempotency key (Rule 12) and the payFixedExpense payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PayFixedExpenseModal } from '../PayFixedExpenseModal';
import { makeExpense, makePayment, TEST_ACCOUNT_ID, TEST_PAYMENT_ID } from './fixtures';

vi.mock('@/actions/fixed-expense.actions', () => ({
  payFixedExpense: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      pay: 'Pagar',
      cancel: 'Cancelar',
      close: 'Cerrar',
      loading: 'Cargando...',
      dueDate: 'Fecha de vencimiento',
      amount: 'Monto',
      paymentAmount: 'Monto del pago',
      paymentAmountHint: 'Por defecto se usa el monto esperado.',
      sourceAccount: 'Cuenta de origen',
      selectAccount: 'Selecciona una cuenta',
      noAccountsForCurrency: 'No tienes cuentas en esta moneda para realizar el pago.',
      paymentNotes: 'Notas (opcional)',
      paymentDate: 'Fecha de pago',
      confirmPayment: 'Confirmar Pago',
      'errors.alreadyPaid': 'Este pago ya fue registrado anteriormente.',
      'errors.invalidAmount': 'El monto del pago debe ser mayor que cero.',
      'errors.insufficientFunds': 'La cuenta de origen no tiene fondos suficientes.',
      'errors.currencyMismatch': 'La moneda de la cuenta no coincide con la del gasto.',
      'errors.rateLimited': 'Demasiados intentos. Intenta de nuevo más tarde.',
      'errors.sessionInvalid': 'Tu sesión expiró. Inicia sesión de nuevo.',
      'errors.selectAccount': 'Selecciona una cuenta de origen.',
      'errors.payFailed': 'No se pudo registrar el pago',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn(
    (cents: number, currency: string) => `$${(cents / 100).toFixed(2)} ${currency}`
  ),
}));

vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: ({
    id,
    value,
    onChange,
    'aria-invalid': ariaInvalid,
  }: {
    id?: string;
    value: number;
    onChange: (value: number) => void;
    'aria-invalid'?: boolean;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      data-testid={`numeric-input-${id}`}
      aria-invalid={ariaInvalid}
    />
  ),
}));

const COP_ACCOUNT = {
  id: TEST_ACCOUNT_ID,
  name: 'Ahorros COP',
  currency: 'COP',
  balanceCents: 500000,
};
const USD_ACCOUNT = {
  id: 'caccount0000000000000002',
  name: 'Ahorros USD',
  currency: 'USD',
  balanceCents: 100000,
};

const dictionary = {};
const payment = makePayment({ id: TEST_PAYMENT_ID, currency: 'COP', expectedAmountCents: 1500000 });
const expense = makeExpense({ name: 'Arriendo' });

describe('PayFixedExpenseModal', () => {
  const onClose = vi.fn();

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

  async function renderModal() {
    const utils = render(
      <PayFixedExpenseModal
        expense={expense}
        payment={payment}
        dictionary={dictionary}
        locale="es-CO"
        isOpen
        onClose={onClose}
      />
    );
    return utils;
  }

  function submitButton(container: HTMLElement): HTMLButtonElement {
    return container.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  /**
   * The open effect schedules a requestAnimationFrame that flips visibility and
   * clears submitError. Wait for it before interacting, otherwise a late rAF can
   * wipe the error we assert on (same guard as the ContributeModal test).
   */
  async function waitForDialogReady(container: HTMLElement) {
    await waitFor(() => {
      const panel = container.querySelector('div[class*="max-w-lg"]') as HTMLElement | null;
      expect(panel).toBeTruthy();
      expect(panel?.style.opacity).toBe('1');
    });
  }

  it('shows the account selector in loading state until accounts resolve', async () => {
    const { container } = await renderModal();

    const select = screen.getByLabelText('Cuenta de origen') as HTMLSelectElement;
    expect(select).toBeDisabled();
    expect(submitButton(container)).toBeDisabled();

    await waitFor(() => expect(select).not.toBeDisabled());
  });

  it('auto-selects the first account in the payment currency', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [COP_ACCOUNT, USD_ACCOUNT],
    });

    const { container } = await renderModal();
    await screen.findByText(/Ahorros COP/);

    const select = screen.getByLabelText('Cuenta de origen') as HTMLSelectElement;
    expect(select.value).toBe(TEST_ACCOUNT_ID);
    // The USD account is filtered out.
    expect(screen.queryByText(/Ahorros USD/)).not.toBeInTheDocument();
    expect(submitButton(container)).not.toBeDisabled();
  });

  it('shows a friendly notice and keeps submit disabled when there are no accounts in the currency', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [USD_ACCOUNT],
    });

    const { container } = await renderModal();

    await screen.findByText('No tienes cuentas en esta moneda para realizar el pago.');
    expect(
      screen.getByText('No tienes cuentas en esta moneda para realizar el pago.')
    ).toBeInTheDocument();
    expect(submitButton(container)).toBeDisabled();
  });

  it('submits to payFixedExpense with the selected account, amount and idempotency key', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [COP_ACCOUNT],
    });
    const { payFixedExpense } = await import('@/actions/fixed-expense.actions');
    (payFixedExpense as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const { container } = await renderModal();
    await screen.findByText(/Ahorros COP/);
    await waitForDialogReady(container);

    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(payFixedExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: TEST_PAYMENT_ID,
          accountId: TEST_ACCOUNT_ID,
          amountCents: 1500000,
          idempotencyKey: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          ),
        })
      );
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('keeps the idempotency key stable across a failed retry', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [COP_ACCOUNT],
    });
    const { payFixedExpense } = await import('@/actions/fixed-expense.actions');
    (payFixedExpense as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
    });

    const { container } = await renderModal();
    await screen.findByText(/Ahorros COP/);
    await waitForDialogReady(container);

    const keyInput = container.querySelector('input[name="idempotencyKey"]') as HTMLInputElement;
    const firstKey = keyInput.value;
    expect(firstKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    fireEvent.click(submitButton(container));
    await screen.findByRole('alert', {}, { timeout: 3000 });

    expect(keyInput.value).toBe(firstKey);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('allows overriding the payment amount', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [COP_ACCOUNT],
    });
    const { payFixedExpense } = await import('@/actions/fixed-expense.actions');
    (payFixedExpense as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true });

    const { container } = await renderModal();
    await screen.findByText(/Ahorros COP/);
    await waitForDialogReady(container);

    fireEvent.change(screen.getByTestId('numeric-input-pay-fixed-expense-amount'), {
      target: { value: '2000000' },
    });
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(payFixedExpense).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 2000000 })
      );
    });
  });

  it('maps the already-paid backend code to a friendly alert', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [COP_ACCOUNT],
    });
    const { payFixedExpense } = await import('@/actions/fixed-expense.actions');
    (payFixedExpense as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      code: 'FIXED_EXPENSE_ALREADY_PAID',
    });

    const { container } = await renderModal();
    await screen.findByText(/Ahorros COP/);
    await waitForDialogReady(container);

    fireEvent.click(submitButton(container));

    const alert = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alert).toHaveTextContent('Este pago ya fue registrado anteriormente.');
  });

  it('calls onClose when cancel is clicked', async () => {
    await renderModal();

    fireEvent.click(screen.getByText('Cancelar'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
