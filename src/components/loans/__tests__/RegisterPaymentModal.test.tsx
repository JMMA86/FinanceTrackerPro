/**
 * RegisterPaymentModal Component Tests
 *
 * Payment/receipt dialog: currency-filtered accounts, amount default/override,
 * submit payload and error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterPaymentModal } from '../RegisterPaymentModal';
import type { LoanWithInstallments } from '@/types/loans';

vi.mock('@/actions/loan.actions', () => ({
  registerLoanPayment: vi.fn().mockResolvedValue({
    success: true,
    data: { payment: { id: 'pay-1' }, wasIdempotent: false },
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      registerPayment: 'Registrar pago/recibo',
      close: 'Cerrar',
      'table.installment': 'Cuota',
      paidAmount: 'Pagado',
      remaining: 'Pendiente',
      paymentAmount: 'Monto',
      partialPaymentHint: 'Puedes registrar un abono parcial.',
      account: 'Cuenta',
      selectAccount: 'Selecciona una cuenta',
      paymentDate: 'Fecha de pago',
      paymentNotes: 'Notas (opcional)',
      confirmPayment: 'Confirmar pago',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      'errors.paymentFailed': 'No se pudo registrar el pago',
      'errors.paymentInvalid': 'Revisa los datos del pago',
      'errors.validationFailed': 'Revisa los datos del formulario',
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
  }: {
    id?: string;
    value: number;
    onChange: (value: number) => void;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      data-testid={`numeric-input-${id}`}
    />
  ),
}));

import { registerLoanPayment } from '@/actions/loan.actions';

const CUID = 'clh1234567890abcdefghij';

const loan = {
  id: CUID,
  name: 'Préstamo a Juan',
  currency: 'COP',
  direction: 'PAYABLE',
} as unknown as LoanWithInstallments;

const installment = {
  id: CUID,
  installmentNumber: 3,
  totalCents: 10000,
  paidAmountCents: 2000,
} as unknown as LoanWithInstallments['installments'][number];

const copAccount = {
  id: 'clh0000000000000000000001',
  name: 'Ahorros COP',
  currency: 'COP',
  type: 'SAVINGS',
  parentAccountId: null,
  balanceCents: 500000,
};

const usdAccount = { ...copAccount, id: 'clh0000000000000000000002', currency: 'USD' };

describe('RegisterPaymentModal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  function renderModal(accounts = [copAccount]) {
    return render(
      <RegisterPaymentModal
        loan={loan}
        installment={installment}
        accounts={accounts}
        dictionary={{}}
        locale="es-CO"
        isOpen
        onClose={onClose}
      />
    );
  }

  it('muestra la cuota, el pagado y el pendiente', async () => {
    renderModal();

    expect(await screen.findByText('$100.00 COP')).toBeInTheDocument(); // total
    expect(screen.getByText('$20.00 COP')).toBeInTheDocument(); // pagado
    expect(screen.getByText('$80.00 COP')).toBeInTheDocument(); // pendiente
  });

  it('deshabilita el envío cuando no hay cuentas en la moneda del préstamo', () => {
    const { container } = renderModal([usdAccount]);

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit).toBeDisabled();
  });

  it('usa el remanente por defecto y registra el pago', async () => {
    const { container } = renderModal();

    await waitFor(() =>
      expect(screen.getByTestId('numeric-input-loan-payment-amount')).toHaveValue(8000)
    );

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submit).not.toBeDisabled();

    fireEvent.click(submit);

    await waitFor(() => {
      expect(registerLoanPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          installmentId: CUID,
          accountId: copAccount.id,
          amountCents: 8000,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('permite un abono parcial', async () => {
    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId('numeric-input-loan-payment-amount')).toHaveValue(8000)
    );

    fireEvent.change(screen.getByTestId('numeric-input-loan-payment-amount'), {
      target: { value: '3000' },
    });
    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() =>
      expect(registerLoanPayment).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 3000 })
      )
    );
  });

  it('muestra el error mapeado del servidor', async () => {
    vi.mocked(registerLoanPayment).mockResolvedValueOnce({
      success: false,
      error: 'invalid',
      code: 'PAYMENT_AMOUNT_INVALID',
    });

    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId('numeric-input-loan-payment-amount')).toHaveValue(8000)
    );

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Revisa los datos del pago');
    });
  });

  it('mapea el error de validación devuelto por el servidor', async () => {
    vi.mocked(registerLoanPayment).mockResolvedValueOnce({
      success: false,
      error: 'amountCents: validation.amountPositive',
      code: 'VALIDATION_ERROR',
    });

    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId('numeric-input-loan-payment-amount')).toHaveValue(8000)
    );

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('Amount must be greater than 0');
  });

  it('muestra el mensaje de la excepción cuando la acción lanza', async () => {
    vi.mocked(registerLoanPayment).mockRejectedValueOnce(new Error('falló la red'));

    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId('numeric-input-loan-payment-amount')).toHaveValue(8000)
    );

    fireEvent.click(container.querySelector('button[type="submit"]') as HTMLButtonElement);

    expect(await screen.findByRole('alert')).toHaveTextContent('falló la red');
  });

  it('notifica onClose cuando el diálogo emite el evento nativo de cierre', () => {
    renderModal();

    fireEvent(screen.getByRole('dialog'), new Event('close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('cierra el diálogo al pulsar Cancelar', async () => {
    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByTestId('numeric-input-loan-payment-amount')).toHaveValue(8000)
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => {
      const backdrop = container.querySelector('[aria-hidden="true"]') as HTMLElement;
      expect(backdrop.style.opacity).toBe('0');
    });
    expect(registerLoanPayment).not.toHaveBeenCalled();
  });
});
