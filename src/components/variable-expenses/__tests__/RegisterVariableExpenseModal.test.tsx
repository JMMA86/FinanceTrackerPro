/**
 * RegisterVariableExpenseModal Component Tests
 *
 * Locks: AccountSelect is used (accounts/cards/pockets grouped, filtered by the
 * definition currency), there is NO category selector, and the submit payload
 * carries the definition's `variableExpenseId` plus its inherited `categoryId`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RegisterVariableExpenseModal } from '../RegisterVariableExpenseModal';
import { createTransaction } from '@/actions/transaction.actions';
import type { VariableExpenseDefinition } from '@/types/variable-expense';

const { accountSelectSpy } = vi.hoisted(() => ({
  accountSelectSpy: { props: null as Record<string, unknown> | null },
}));

vi.mock('@/actions/transaction.actions', () => ({
  createTransaction: vi.fn().mockResolvedValue({ success: true, data: { id: 'tx-1' } }),
}));

vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      registerExpense: 'Registrar gasto',
      selectDefinition: 'Selecciona una definición',
      amount: 'Monto',
      sourceAccount: 'Cuenta de origen',
      date: 'Fecha',
      notes: 'Notas',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      confirmRegister: 'Confirmar registro',
      noAccountsForCurrency: 'No tienes cuentas en esta moneda.',
      selectAccount: 'Selecciona una cuenta',
      accountsGroup: 'Cuentas',
      creditCardsGroup: 'Tarjetas',
      pocketsGroup: 'Bolsillos',
      'errors.selectDefinition': 'Selecciona una definición',
      'errors.selectAccount': 'Selecciona una cuenta',
      'errors.registerFailed': 'No se pudo registrar',
    };
    return keyMap[key] ?? key;
  }),
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

vi.mock('@/components/transactions/AccountSelect', () => ({
  AccountSelect: (props: Record<string, unknown>) => {
    accountSelectSpy.props = props;
    return (
      <button
        type="button"
        data-testid="account-select"
        onClick={() => (props.onChange as (id: string) => void)('acc-cop')}
      >
        account-select
      </button>
    );
  },
}));

vi.mock('@/components/transactions/getTransactionError', () => ({
  getTransactionError: vi.fn(() => 'No se pudo registrar'),
}));

const definition: VariableExpenseDefinition = {
  id: 'def-1',
  name: 'Fútbol',
  description: null,
  color: null,
  icon: null,
  categoryId: 'cat-1',
  category: { id: 'cat-1', name: 'Deporte', color: '#22c55e' },
  expectedTimesPerMonth: null,
  expectedAmountCents: null,
  currency: 'COP',
  isActive: true,
};

const ACCOUNT = {
  id: 'acc-cop',
  name: 'Ahorros COP',
  currency: 'COP',
  type: 'SAVINGS',
  parentAccountId: null,
  balanceCents: 500000,
};

describe('RegisterVariableExpenseModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    accountSelectSpy.props = null;
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  function renderModal() {
    return render(
      <RegisterVariableExpenseModal
        isOpen
        definition={definition}
        definitions={[definition]}
        dictionary={{}}
        transactionsDictionary={{}}
        locale="es-CO"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }

  function submitButton(container: HTMLElement) {
    return container.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('uses AccountSelect, groups the currency accounts and shows no category selector', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [
        ACCOUNT,
        { ...ACCOUNT, id: 'acc-card', name: 'Tarjeta', type: 'CREDIT_CARD' },
        { ...ACCOUNT, id: 'acc-pocket', name: 'Bolsillo', type: 'POCKET' },
        { ...ACCOUNT, id: 'acc-usd', name: 'Ahorros USD', currency: 'USD' },
      ],
    });

    renderModal();

    await screen.findByTestId('account-select');
    await waitFor(() => expect(accountSelectSpy.props).not.toBeNull());

    const props = accountSelectSpy.props!;
    expect((props.accounts as Array<{ id: string }>).map((a) => a.id)).toEqual(['acc-cop']);
    expect((props.creditCards as Array<{ id: string }>).map((a) => a.id)).toEqual(['acc-card']);
    expect((props.pockets as Array<{ id: string }>).map((a) => a.id)).toEqual(['acc-pocket']);
    // The USD account is filtered out (definition currency is COP).
    expect((props.accounts as Array<{ id: string }>).some((a) => a.id === 'acc-usd')).toBe(false);
    // No category selector in this modal.
    expect(screen.queryByText('category')).not.toBeInTheDocument();
  });

  it('submits the inherited categoryId and the variableExpenseId', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [ACCOUNT],
    });

    const { container } = renderModal();
    await waitFor(() => expect(submitButton(container)).not.toBeDisabled());

    fireEvent.click(screen.getByTestId('account-select'));
    fireEvent.change(screen.getByTestId('numeric-input-register-amount'), {
      target: { value: '12345' },
    });
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(vi.mocked(createTransaction)).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'EXPENSE',
          accountId: 'acc-cop',
          amountCents: -12345,
          currency: 'COP',
          categoryId: 'cat-1',
          variableExpenseId: 'def-1',
        })
      );
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('shows a notice and disables submit when there are no accounts in the currency', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [{ ...ACCOUNT, id: 'acc-usd', currency: 'USD' }],
    });

    const { container } = renderModal();

    await screen.findByText('No tienes cuentas en esta moneda.');
    expect(submitButton(container)).toBeDisabled();
  });
});
