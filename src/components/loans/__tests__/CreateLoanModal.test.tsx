/**
 * CreateLoanModal Component Tests
 *
 * Creation form: disabled-until-valid, balance guard, TERM/INSTALLMENT toggle,
 * live preview and submit/error handling.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { CreateLoanModal } from '../CreateLoanModal';

vi.mock('@/actions/loan.actions', () => ({
  createLoan: vi.fn().mockResolvedValue({
    success: true,
    data: { loan: { id: 'loan-1' }, wasIdempotent: false },
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

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      createLoan: 'Crear préstamo',
      close: 'Cerrar',
      'direction.label': 'Dirección',
      'direction.RECEIVABLE': 'Por cobrar',
      'direction.PAYABLE': 'Por pagar',
      name: 'Nombre del préstamo',
      namePlaceholder: 'Ej: Préstamo a Juan',
      type: 'Tipo',
      'types.PERSONAL': 'Personal',
      'types.MORTGAGE': 'Hipotecario',
      'types.AUTO': 'Vehicular',
      'types.STUDENT': 'Estudiantil',
      'types.BUSINESS': 'Empresarial',
      currency: 'Moneda',
      principal: 'Monto principal',
      interestRate: 'Tasa de interés (%)',
      'rateType.label': 'Tipo de tasa',
      'rateType.EA': 'Efectiva anual',
      'rateType.NAMV': 'Nominal mes vencido',
      'rateType.PERIODIC': 'Periódica',
      'rateType.DAILY': 'Diaria',
      'interestMode.label': 'Modalidad de interés',
      'interestMode.COMPOUND': 'Compuesto',
      'interestMode.SIMPLE': 'Simple',
      'interestAccrual.label': 'Causación',
      'interestAccrual.PERIODIC': 'Por período',
      'interestAccrual.DAILY': 'Diaria',
      'dayCountBasis.label': 'Base de días',
      'dayCountBasis.ACTUAL_365': 'Actual/365',
      'dayCountBasis.ACTUAL_360': 'Actual/360',
      'dayCountBasis.THIRTY_360': '30/360',
      'scheduleMode.label': 'Modo',
      'scheduleMode.TERM': 'Por cuotas',
      'scheduleMode.INSTALLMENT': 'Por cuota',
      'scheduleMode.termHint': 'Indica las cuotas',
      'scheduleMode.installmentHint': 'Indica la cuota',
      'amortizationType.label': 'Amortización',
      'amortizationType.FRENCH': 'Francesa',
      'amortizationType.GERMAN': 'Alemana',
      'amortizationType.AMERICAN': 'Americana',
      'amortizationType.CUSTOM': 'Personalizada',
      paymentFrequency: 'Frecuencia',
      'frequency.WEEKLY': 'Semanal',
      'frequency.BIWEEKLY': 'Quincenal',
      'frequency.MONTHLY': 'Mensual',
      term: 'Número de cuotas',
      termHint: 'Cantidad de cuotas',
      installmentAmount: 'Valor de la cuota',
      installmentAmountHint: 'Se calcula el número de cuotas',
      interestOnlyInstallments: 'Cuotas solo interés',
      interestOnlyHint: 'Primeras cuotas solo interés',
      startDate: 'Fecha de inicio',
      firstPaymentDate: 'Fecha del primer pago',
      account: 'Cuenta',
      selectAccount: 'Selecciona una cuenta',
      accountHint: 'Opcional',
      notes: 'Notas (opcional)',
      color: 'Color',
      customColor: 'Color personalizado',
      'colorNames.violet': 'Violeta',
      preview: 'Vista previa',
      calculatedInstallment: 'Cuota calculada',
      calculatedYield: 'Rendimiento',
      totalInterest: 'Interés total',
      totalPayable: 'Total a pagar',
      calculatedTermCount: 'Número de cuotas calculado',
      previewFullSchedule: 'Cronograma completo',
      noPreview: 'Completa los datos para ver la vista previa',
      'table.number': '#',
      'table.date': 'Fecha',
      'table.installment': 'Cuota',
      'table.interest': 'Interés',
      'table.principal': 'Capital',
      'table.balance': 'Saldo',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      dailyOnlyHint: 'Solo con causación diaria',
      installmentTooLow: 'La cuota no cubre los intereses',
      'validation.principalExceedsBalance': 'El monto supera el saldo disponible',
      'validation.installmentExceedsTotal': 'La cuota supera el total',
      'validation.nameRequired': 'El nombre es obligatorio',
      'validation.installmentRequired': 'Indica la cuota',
      'errors.createFailed': 'No se pudo crear el préstamo',
      'errors.validationFailed': 'Revisa los datos del formulario',
    };
    return keyMap[key] ?? key;
  }),
}));

import { createLoan } from '@/actions/loan.actions';

const CUID = 'clh1234567890abcdefghij';
const accounts = [
  {
    id: CUID,
    name: 'Ahorros COP',
    currency: 'COP',
    type: 'SAVINGS',
    parentAccountId: null,
    balanceCents: 50000,
  },
];

describe('CreateLoanModal', () => {
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
      <CreateLoanModal
        dictionary={{}}
        locale="es-CO"
        isOpen
        onClose={onClose}
        accounts={accounts}
      />
    );
  }

  function submitButton(container: HTMLElement) {
    return container.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  async function fillRequired() {
    expect(await screen.findByLabelText('Nombre del préstamo')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre del préstamo'), {
      target: { value: 'Préstamo a Juan' },
    });
    fireEvent.change(screen.getByTestId('numeric-input-loan-principal'), {
      target: { value: '100000' },
    });
  }

  it('mantiene el submit deshabilitado hasta que el formulario es válido', async () => {
    const { container } = renderModal();
    expect(await screen.findByLabelText('Nombre del préstamo')).toBeInTheDocument();

    expect(submitButton(container)).toBeDisabled();

    await fillRequired();
    await waitFor(() => expect(submitButton(container)).not.toBeDisabled());
  });

  it('muestra la vista previa y crea el préstamo', async () => {
    const { container } = renderModal();
    await fillRequired();

    expect(await screen.findByText('Vista previa')).toBeInTheDocument();
    expect(screen.getByText('Cuota calculada')).toBeInTheDocument();

    await waitFor(() => expect(submitButton(container)).not.toBeDisabled());
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(createLoan).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Préstamo a Juan',
          principalCents: 100000,
          scheduleMode: 'TERM',
          termCount: 12,
        })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('avisa y bloquea cuando el monto supera el saldo de la cuenta', async () => {
    const { container } = renderModal();
    await fillRequired();

    fireEvent.change(screen.getByLabelText('Cuenta'), { target: { value: CUID } });

    expect(await screen.findByText('El monto supera el saldo disponible')).toBeInTheDocument();
    expect(submitButton(container)).toBeDisabled();
  });

  it('alterna a modo INSTALLMENT y deriva el número de cuotas', async () => {
    const { container } = renderModal();
    await fillRequired();

    const installmentRadio = container.querySelector(
      'input[value="INSTALLMENT"]'
    ) as HTMLInputElement;
    fireEvent.click(installmentRadio);

    expect(await screen.findByTestId('numeric-input-loan-installment-amount')).toBeInTheDocument();
    expect(screen.queryByLabelText('Número de cuotas')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('numeric-input-loan-installment-amount'), {
      target: { value: '10000' },
    });

    const termLabel = await screen.findByText('Número de cuotas calculado');
    expect(
      await within(termLabel.parentElement as HTMLElement).findByText('10')
    ).toBeInTheDocument();
  });

  it('muestra el error del servidor al crear', async () => {
    vi.mocked(createLoan).mockResolvedValueOnce({
      success: false,
      error: 'No se pudo crear el préstamo',
      code: 'INTERNAL_SERVER_ERROR',
    });

    const { container } = renderModal();
    await fillRequired();

    await waitFor(() => expect(submitButton(container)).not.toBeDisabled());
    fireEvent.click(submitButton(container));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo crear el préstamo')
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
