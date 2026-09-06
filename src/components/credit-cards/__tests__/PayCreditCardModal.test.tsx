/**
 * PayCreditCardModal Component Tests
 * Covers the critical guards: no-debt state, amount clamping, card selector,
 * bank/pocket account split, submit payload and server error mapping.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PayCreditCardModal } from '../PayCreditCardModal';
import type { CreditCard } from '../credit-card.types';

const { mockNumericMaxValue, mockAddNotification } = vi.hoisted(() => ({
  mockNumericMaxValue: { value: 0 },
  mockAddNotification: vi.fn(),
}));

vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) =>
    selector({
      addNotification: mockAddNotification,
    })
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const mockPayCreditCard = vi.fn();
vi.mock('@/actions/credit-card.actions', () => ({
  payCreditCard: (...args: unknown[]) => mockPayCreditCard(...args),
}));

const mockGetBankAccounts = vi.fn();
vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: (...args: unknown[]) => mockGetBankAccounts(...args),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => key),
}));

vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string) => `${currency} ${cents}`),
}));

vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: ({
    value,
    onChange,
    maxValue,
    'aria-invalid': ariaInvalid,
  }: {
    value: number;
    onChange: (v: number) => void;
    maxValue?: number;
    'aria-invalid'?: boolean;
  }) => {
    mockNumericMaxValue.value = maxValue ?? 0;
    return (
      <input
        type="number"
        data-testid="numeric-pay-amount"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-invalid={ariaInvalid}
      />
    );
  },
}));

vi.mock('@/components/transactions/AccountSelect', () => ({
  AccountSelect: ({
    accounts,
    pockets,
    value,
    onChange,
  }: {
    accounts: Array<{ id: string; name: string }>;
    pockets: Array<{ id: string; name: string }>;
    value: string;
    onChange: (id: string) => void;
  }) => (
    <div>
      <select
        aria-label="source-account-select"
        data-accounts={JSON.stringify(accounts.map((a) => a.name))}
        data-pockets={JSON.stringify(pockets.map((a) => a.name))}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">--</option>
        {[...accounts, ...pockets].map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  ),
}));

const makeCard = (overrides: Partial<CreditCard> = {}): CreditCard => ({
  id: 'clhcard0000000000000001',
  name: 'Visa Oro',
  currency: 'COP',
  balanceCents: -100000,
  creditLimitCents: 1000000,
  cutoffDay: 10,
  paymentDueDay: 25,
  cardColor: 'blue',
  cardNetwork: 'VISA',
  createdAt: new Date('2026-01-01'),
  transactions: [],
  debtCents: 100000,
  availableCreditCents: 900000,
  paymentStatus: 'ON_TRACK',
  ...overrides,
});

const bankAccounts = [
  {
    id: 'clhbank0000000000000001',
    name: 'Checking',
    currency: 'COP',
    balanceCents: 500000,
    type: 'CHECKING',
    parentAccountId: null,
  },
  {
    id: 'clhpocket0000000000000001',
    name: 'Viaje',
    currency: 'COP',
    balanceCents: 200000,
    type: 'POCKET',
    parentAccountId: 'clhbank0000000000000002',
  },
];

function renderModal(cards: CreditCard[], initialCardId?: string, open = true) {
  return render(
    <PayCreditCardModal
      open={open}
      cards={cards}
      initialCardId={initialCardId}
      dictionary={{}}
      locale="es-CO"
      onClose={vi.fn()}
    />
  );
}

/** Wait for the AccountSelect options to load, then select a source account. */
async function selectSourceAccount(value: string, optionName: string) {
  // Re-query on every poll: the AccountSelect remounts (key = modalSession),
  // so a previously-captured node can become detached with stale options.
  await waitFor(
    () => {
      expect(screen.getByRole('option', { name: optionName })).toBeInTheDocument();
    },
    { timeout: 3000 }
  );
  const select = screen.getByLabelText('source-account-select');
  fireEvent.change(select, { target: { value } });
  return select;
}

describe('PayCreditCardModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBankAccounts.mockResolvedValue({ success: true, data: bankAccounts });
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
    // The modal resets amountCents inside requestAnimationFrame on open. Fire it
    // synchronously so the reset never races with the test's own amount change.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the no-debt status and disables submit when the selected card has no debt', () => {
    renderModal([makeCard({ debtCents: 0, balanceCents: 0, availableCreditCents: 1000000 })]);

    expect(screen.getByText('pay.noDebt')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'pay.confirmPay' });
    expect(submit).toBeDisabled();
  });

  it('clamps the amount input to the selected card debt via maxValue', async () => {
    renderModal([makeCard({ debtCents: 100000 })]);

    await waitFor(() => {
      expect(screen.getByTestId('numeric-pay-amount')).toBeInTheDocument();
    });
    expect(mockNumericMaxValue.value).toBe(100000);
  });

  it('shows a card selector when more than one payable card is available', async () => {
    renderModal([
      makeCard({ id: 'clhcard0000000000000001', debtCents: 100000 }),
      makeCard({ id: 'clhcard0000000000000002', name: 'Platinum', debtCents: 50000 }),
    ]);

    const selector = await screen.findByLabelText('pay.selectCard');
    expect(selector).toBeInTheDocument();
    const options = Array.from(selector.querySelectorAll('option'));
    expect(options).toHaveLength(2);
  });

  it('does NOT show a card selector when only one payable card exists', async () => {
    renderModal([makeCard({ debtCents: 100000 })]);
    expect(screen.queryByLabelText('pay.selectCard')).not.toBeInTheDocument();
  });

  it('splits source accounts into bank accounts and pockets for AccountSelect', async () => {
    renderModal([makeCard({ debtCents: 100000 })]);

    const select = await screen.findByLabelText('source-account-select');
    expect(select).toHaveAttribute('data-accounts', JSON.stringify(['Checking']));
    expect(select).toHaveAttribute('data-pockets', JSON.stringify(['Viaje']));
  });

  it('shows the no source accounts hint when none match the card currency', async () => {
    mockGetBankAccounts.mockResolvedValue({
      success: true,
      data: [
        {
          id: 'clhbank0000000000000003',
          name: 'Dolares',
          currency: 'USD',
          balanceCents: 100,
          type: 'SAVINGS',
          parentAccountId: null,
        },
      ],
    });
    renderModal([makeCard({ debtCents: 100000 })]);

    expect(await screen.findByText('pay.noSourceAccounts')).toBeInTheDocument();
  });

  it('submits the payment payload to payCreditCard', async () => {
    mockPayCreditCard.mockResolvedValue({ success: true, data: { payment: { id: 'p-1' } } });
    renderModal([makeCard({ debtCents: 100000 })]);

    // Select the source account
    await selectSourceAccount('clhbank0000000000000001', 'Checking');

    // Enter an amount
    fireEvent.change(screen.getByTestId('numeric-pay-amount'), { target: { value: '50000' } });

    const submit = screen.getByRole('button', { name: 'pay.confirmPay' });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(mockPayCreditCard).toHaveBeenCalled();
    });
    const arg = mockPayCreditCard.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.accountId).toBe('clhcard0000000000000001');
    expect(arg.sourceAccountId).toBe('clhbank0000000000000001');
    expect(arg.amountCents).toBe(50000);
    expect(arg.currency).toBe('COP');
    expect(arg.idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/);
  });

  it('shows the insufficient funds hint when the amount exceeds the source balance', async () => {
    renderModal([makeCard({ debtCents: 100000 })]);

    await selectSourceAccount('clhbank0000000000000001', 'Checking');
    fireEvent.change(screen.getByTestId('numeric-pay-amount'), { target: { value: '600000' } });

    expect(screen.getByText('pay.insufficientFunds')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'pay.confirmPay' })).toBeDisabled();
  });

  it('maps CARD_NO_DEBT server errors inline', async () => {
    mockPayCreditCard.mockResolvedValue({ success: false, code: 'CARD_NO_DEBT', error: 'no debt' });
    renderModal([makeCard({ debtCents: 100000 })]);

    await selectSourceAccount('clhbank0000000000000001', 'Checking');
    fireEvent.change(screen.getByTestId('numeric-pay-amount'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'pay.confirmPay' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('pay.noDebt');
    });
  });

  it('maps CARD_OVERPAYMENT server errors inline', async () => {
    mockPayCreditCard.mockResolvedValue({
      success: false,
      code: 'CARD_OVERPAYMENT',
      error: 'over',
    });
    renderModal([makeCard({ debtCents: 100000 })]);

    await selectSourceAccount('clhbank0000000000000001', 'Checking');
    fireEvent.change(screen.getByTestId('numeric-pay-amount'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'pay.confirmPay' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('pay.overpayment');
    });
  });

  it('maps INSUFFICIENT_FUNDS server errors inline', async () => {
    mockPayCreditCard.mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'funds',
    });
    renderModal([makeCard({ debtCents: 100000 })]);

    await selectSourceAccount('clhbank0000000000000001', 'Checking');
    fireEvent.change(screen.getByTestId('numeric-pay-amount'), { target: { value: '50000' } });
    fireEvent.click(screen.getByRole('button', { name: 'pay.confirmPay' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('pay.insufficientFunds');
    });
  });

  it('includes the initial card (even without debt) when opened from the detail', async () => {
    const noDebtCard = makeCard({ id: 'clhcard0000000000000009', name: 'Sin Deuda', debtCents: 0 });
    renderModal(
      [noDebtCard, makeCard({ id: 'clhcard0000000000000001', debtCents: 100000 })],
      noDebtCard.id
    );

    const selector = await screen.findByLabelText('pay.selectCard');
    const options = Array.from(selector.querySelectorAll('option')).map((o) => o.textContent);
    // Payable cards come first, then the initially requested no-debt card.
    expect(options).toEqual(['Visa Oro (COP)', 'Sin Deuda (COP)']);
  });
});
