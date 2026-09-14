/**
 * CreateTransactionModal — expense nature behavior.
 *
 * Kept separate from the pre-existing CreateTransactionModal.spec.tsx so the
 * original suite is untouched. Locks: the "Variable" nature hides the category
 * selector (the category is inherited from the monitored definition) and
 * submits `variableExpenseId` WITHOUT `categoryId`; the "Normal" nature still
 * shows the category selector.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useUIStore } from '@/store/ui.store';
import { CreateTransactionModal } from '../CreateTransactionModal';
import { createTransaction } from '@/actions/transaction.actions';
import type { AccountBrief } from '../types';
import type { VariableExpenseDefinition } from '@/types/variable-expense';

interface AccountSelectProps {
  id: string;
  value: string;
  onChange: (accountId: string) => void;
}

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/actions/transaction.actions', () => ({
  createTransaction: vi.fn().mockResolvedValue({ success: true, data: { id: 'tx-1' } }),
  updateTransaction: vi.fn().mockResolvedValue({ success: true, data: { id: 'tx-1' } }),
}));

vi.mock('@/actions/fixed-expense.actions', () => ({
  payFixedExpense: vi.fn().mockResolvedValue({ success: true }),
  getFixedExpenses: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

const variableDefinition: VariableExpenseDefinition = {
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

vi.mock('@/actions/variable-expense.actions', () => ({
  getVariableExpenses: vi.fn().mockResolvedValue({ success: true, data: [variableDefinition] }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      createTitle: 'Nueva transacción',
      editTitle: 'Editar transacción',
      type: 'Tipo',
      expenseLabel: 'Gasto',
      incomeLabel: 'Ingreso',
      expenseNature: 'Naturaleza',
      natureNormal: 'Normal',
      natureFixed: 'Fijo',
      natureVariable: 'Variable',
      account: 'Cuenta',
      selectAccount: 'Selecciona una cuenta',
      accountsGroup: 'Cuentas',
      creditCardsGroup: 'Tarjetas',
      pocketsGroup: 'Bolsillos',
      selectVariableExpense: 'Definición variable',
      selectFixedExpense: 'Gasto fijo',
      noVariableExpenses: 'Sin definiciones',
      noFixedExpenses: 'Sin gastos fijos',
      amountLabel: 'Monto',
      availableToSpend: 'Disponible',
      category: 'Categoría',
      selectCategory: 'Selecciona categoría',
      manageCategories: 'Administrar',
      descriptionLabel: 'Descripción',
      descriptionPlaceholder: 'Detalle',
      transactionDate: 'Fecha',
      create: 'Crear',
      creating: 'Creando...',
      cancel: 'Cancelar',
      createSuccess: 'Creada',
      updateSuccess: 'Actualizada',
      currencyMismatch: 'Monedas distintas',
      noPendingPayments: 'Sin pagos pendientes',
      advanceNextMonth: 'Adelantar mes',
      fixedAmountAuto: 'Automático',
      dueDate: 'Vencimiento',
      autoAmount: 'Monto automático',
      noAccountsDesc: 'Sin cuentas',
      createAccountCta: 'Crear cuenta',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: (cents: number, currency: string) => `${currency} ${(cents / 100).toFixed(2)}`,
}));

vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: ({
    id,
    value,
    onChange,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
  }: {
    id?: string;
    value: number;
    onChange: (value: number) => void;
    'aria-invalid'?: boolean;
    'aria-describedby'?: string;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      data-testid={`numeric-input-${id}`}
      aria-invalid={ariaInvalid}
      aria-describedby={ariaDescribedBy}
    />
  ),
}));

vi.mock('@/components/transactions/AccountSelect', () => ({
  AccountSelect: (props: AccountSelectProps) => (
    <button type="button" data-testid="account-select" onClick={() => props.onChange('acc-cop')}>
      account-select
    </button>
  ),
}));

vi.mock('@/components/transactions/getTransactionError', () => ({
  getTransactionError: vi.fn(() => 'Error al crear'),
}));

const ACCOUNT: AccountBrief = {
  id: 'acc-cop',
  name: 'Ahorros COP',
  currency: 'COP',
  type: 'SAVINGS',
  parentAccountId: null,
  balanceCents: 1_000_000,
};

describe('CreateTransactionModal (expense nature)', () => {
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useUIStore.setState({ activeModal: 'create-transaction', modalData: null, notifications: [] });
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  function renderModal() {
    return render(
      <CreateTransactionModal
        accounts={[ACCOUNT]}
        categories={[{ id: 'cat-1', name: 'Deporte', type: 'OTHER', color: null, userId: null }]}
        dictionary={{}}
        lang="es"
        locale="es-CO"
        onSuccess={onSuccess}
      />
    );
  }

  it('shows the category selector in the Normal nature', async () => {
    renderModal();

    await screen.findByTestId('account-select');
    await waitFor(() => expect(screen.getAllByText('Categoría').length).toBeGreaterThan(0));
  });

  it('hides the category selector when the nature is Variable', async () => {
    renderModal();
    await screen.findByTestId('account-select');

    fireEvent.click(screen.getByRole('button', { name: 'Variable' }));

    await waitFor(() => {
      expect(screen.queryByText('Categoría')).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText('Definición variable')).toBeInTheDocument();
  });

  it('submits variableExpenseId and NO categoryId for a Variable expense', async () => {
    const { container } = renderModal();
    await screen.findByTestId('account-select');

    fireEvent.click(screen.getByRole('button', { name: 'Variable' }));
    await screen.findByLabelText('Definición variable');

    fireEvent.change(screen.getByLabelText('Definición variable'), {
      target: { value: 'def-1' },
    });
    fireEvent.change(screen.getByTestId('numeric-input-tx-amount'), {
      target: { value: '12345' },
    });

    const submit = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submit);

    await waitFor(() => {
      expect(vi.mocked(createTransaction)).toHaveBeenCalled();
    });
    const payload = vi.mocked(createTransaction).mock.calls[0][0] as {
      type?: string;
      amountCents?: number;
      currency?: string;
      variableExpenseId?: string;
      categoryId?: string;
    };
    expect(payload).toEqual(
      expect.objectContaining({
        type: 'EXPENSE',
        amountCents: -12345,
        currency: 'COP',
        variableExpenseId: 'def-1',
      })
    );
    expect(payload.categoryId).toBeUndefined();
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
