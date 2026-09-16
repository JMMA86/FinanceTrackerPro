/**
 * AddAdjustmentModal Component Tests
 *
 * Adjustment dialog: type-specific fields, client validation and submit payload.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AddAdjustmentModal } from '../AddAdjustmentModal';
import type { LoanWithInstallments } from '@/types/loans';

vi.mock('@/actions/loan.actions', () => ({
  addLoanAdjustment: vi.fn().mockResolvedValue({
    success: true,
    data: { adjustment: { id: 'adj-1' }, wasIdempotent: false },
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      addAdjustment: 'Añadir ajuste',
      close: 'Cerrar',
      adjustmentType: 'Tipo de ajuste',
      adjustmentTypes: 'Tipo',
      effectiveDate: 'Fecha efectiva',
      adjustmentAmount: 'Monto',
      newRate: 'Nueva tasa (%)',
      newTerm: 'Nuevo plazo',
      installmentNumber: 'Número de cuota',
      account: 'Cuenta',
      selectAccount: 'Selecciona una cuenta',
      paymentNotes: 'Notas (opcional)',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      'adjustmentTypes.EXTRA_DISBURSEMENT': 'Prestar más',
      'adjustmentTypes.EXTRA_PAYMENT': 'Abono extra a capital',
      'adjustmentTypes.RATE_CHANGE': 'Cambio de tasa',
      'adjustmentTypes.RESCHEDULE': 'Reprogramar',
      'adjustmentTypes.CUSTOM_INSTALLMENT': 'Cuota personalizada',
      'adjustmentTypes.INTEREST_ONLY_PERIOD': 'Periodo solo interés',
      'errors.adjustmentFailed': 'No se pudo aplicar el ajuste',
      'errors.adjustmentInvalid': 'Revisa los datos del ajuste',
      'errors.validationFailed': 'Revisa los datos del formulario',
    };
    return keyMap[key] ?? key;
  }),
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

import { addLoanAdjustment } from '@/actions/loan.actions';

const CUID = 'clh1234567890abcdefghij';

const loan = {
  id: CUID,
  name: 'Préstamo a Juan',
  currency: 'COP',
  termCount: 12,
} as unknown as LoanWithInstallments;

describe('AddAdjustmentModal', () => {
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

  function renderModal() {
    return render(
      <AddAdjustmentModal
        loan={loan}
        accounts={[]}
        dictionary={{}}
        locale="es-CO"
        isOpen
        onClose={onClose}
      />
    );
  }

  function submitButton(container: HTMLElement) {
    return container.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  async function waitForReady() {
    await waitFor(() => {
      expect((screen.getByLabelText('Fecha efectiva') as HTMLInputElement).value).not.toBe('');
    });
  }

  it('valida el monto requerido para EXTRA_PAYMENT', async () => {
    const { container } = renderModal();
    await waitForReady();

    fireEvent.click(submitButton(container));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Revisa los datos del ajuste')
    );
    expect(addLoanAdjustment).not.toHaveBeenCalled();
  });

  it('envía un EXTRA_PAYMENT con monto', async () => {
    const { container } = renderModal();
    await waitForReady();

    fireEvent.change(screen.getByTestId('numeric-input-adjustment-amount'), {
      target: { value: '5000' },
    });
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(addLoanAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ loanId: CUID, type: 'EXTRA_PAYMENT', amountCents: 5000 })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('cambia a RATE_CHANGE y envía la nueva tasa', async () => {
    const { container } = renderModal();
    await waitForReady();

    fireEvent.change(screen.getByLabelText('Tipo de ajuste'), { target: { value: 'RATE_CHANGE' } });
    fireEvent.change(screen.getByLabelText('Nueva tasa (%)'), { target: { value: '9.5' } });
    fireEvent.click(submitButton(container));

    await waitFor(() =>
      expect(addLoanAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RATE_CHANGE', newRateValue: 9.5 })
      )
    );
  });

  it('muestra el error del servidor', async () => {
    vi.mocked(addLoanAdjustment).mockResolvedValueOnce({
      success: false,
      error: 'No se pudo aplicar el ajuste',
      code: 'LOAN_OVERPAYMENT',
    });

    const { container } = renderModal();
    await waitForReady();
    fireEvent.change(screen.getByTestId('numeric-input-adjustment-amount'), {
      target: { value: '5000' },
    });
    fireEvent.click(submitButton(container));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo aplicar el ajuste')
    );
  });

  it('envía un RESCHEDULE con el nuevo plazo', async () => {
    const { container } = renderModal();
    await waitForReady();

    fireEvent.change(screen.getByLabelText('Tipo de ajuste'), { target: { value: 'RESCHEDULE' } });
    fireEvent.change(screen.getByLabelText('Nuevo plazo'), { target: { value: '24' } });
    fireEvent.click(submitButton(container));

    await waitFor(() =>
      expect(addLoanAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'RESCHEDULE', newTermCount: 24 })
      )
    );
  });

  it('bloquea un RESCHEDULE sin nuevo plazo', async () => {
    const { container } = renderModal();
    await waitForReady();

    fireEvent.change(screen.getByLabelText('Tipo de ajuste'), { target: { value: 'RESCHEDULE' } });
    fireEvent.click(submitButton(container));

    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa los datos del ajuste');
    expect(addLoanAdjustment).not.toHaveBeenCalled();
  });

  it('muestra el mensaje de la excepción cuando la acción lanza', async () => {
    vi.mocked(addLoanAdjustment).mockRejectedValueOnce(new Error('boom'));

    const { container } = renderModal();
    await waitForReady();
    fireEvent.change(screen.getByTestId('numeric-input-adjustment-amount'), {
      target: { value: '5000' },
    });
    fireEvent.click(submitButton(container));

    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });

  it('notifica onClose cuando el diálogo emite el evento nativo de cierre', () => {
    renderModal();

    fireEvent(screen.getByRole('dialog'), new Event('close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('cierra el diálogo al pulsar Cancelar sin aplicar el ajuste', async () => {
    renderModal();
    await waitForReady();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(addLoanAdjustment).not.toHaveBeenCalled();
  });
});
