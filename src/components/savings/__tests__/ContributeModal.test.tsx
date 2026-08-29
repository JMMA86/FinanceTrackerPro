/**
 * ContributeModal Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContributeModal } from '../ContributeModal';

const MOCK_CUID = 'clh1234567890abcdefghij';

// Mock actions
vi.mock('@/actions/savings.actions', () => ({
  contributeToGoal: vi.fn().mockResolvedValue({
    success: true,
    data: { contribution: { id: 'c-1' }, wasIdempotent: false },
  }),
  getSavingsGoals: vi.fn().mockResolvedValue({
    success: true,
    data: [
      {
        id: 'clh1234567890abcdefghij',
        userId: 'user-1',
        name: 'Vacaciones 2026',
        description: null,
        type: 'ANNUAL',
        targetAmountCents: 200000,
        currency: 'COP',
        currentAmountCents: 50000,
        deadline: null,
        monthlyContributionCents: 25000,
        linkedAccountId: null,
        linkedAccount: null,
        status: 'ACTIVE',
        priority: 0,
        color: null,
        icon: null,
        idempotencyKey: null,
        isActive: true,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
        deletedAt: null,
        createdBy: 'user-1',
        lastModifiedBy: 'user-1',
        progressPercentage: 25,
        projectedCompletion: null,
        contributions: [],
      },
    ],
  }),
}));

// Mock account actions
vi.mock('@/actions/account.actions', () => ({
  getBankAccounts: vi.fn().mockResolvedValue({
    success: true,
    data: [
      { id: 'acc-1', name: 'Cuenta de Ahorros', currency: 'COP', balanceCents: 500000 },
      { id: 'acc-2', name: 'Cuenta Corriente', currency: 'COP', balanceCents: 1000000 },
    ],
  }),
}));

// Mock i18n get
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      contribute: 'Contribuir',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      progress: 'Progreso',
      remaining: 'Restante',
      contributionAmount: 'Monto a contribuir',
      sourceAccount: 'Cuenta de origen',
      contributionNotes: 'Notas',
      confirmContribute: 'Confirmar Contribución',
      'errors.sessionInvalid': 'Sesión inválida',
      'errors.contributeFailed': 'Error al contribuir',
    };
    return keyMap[key] ?? key;
  }),
}));

// Mock formatMoney
vi.mock('@/lib/money', () => ({
  formatMoney: vi.fn((cents: number, currency: string, _locale?: string) => {
    const amount = (cents / 100).toFixed(2);
    return `$${amount} ${currency}`;
  }),
}));

// Mock FormattedNumericInput
vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: vi.fn(
    ({
      id,
      value,
      onChange,
      'aria-invalid': ariaInvalid,
      className,
      maxValue,
    }: {
      id?: string;
      value: number;
      onChange: (v: number) => void;
      'aria-invalid'?: boolean;
      className?: string;
      maxValue?: number;
    }) => (
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={`numeric-input-${id}`}
        aria-invalid={ariaInvalid}
        className={className}
        max={maxValue}
      />
    )
  ),
}));

beforeEach(() => {
  // jsdom dialogs are inert unless open — mirror the browser so content inside
  // the dialog is exposed to role/accessibility queries (getByRole).
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
});

describe('ContributeModal', () => {
  const mockOnClose = vi.fn();
  const defaultDictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the form with amount field when open', async () => {
    render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Wait for goal name to be loaded
    await waitFor(() => {
      expect(screen.getByText(/Vacaciones 2026/)).toBeInTheDocument();
    });

    expect(screen.getByText('Monto a contribuir')).toBeInTheDocument();
    expect(screen.getByText('Cuenta de origen')).toBeInTheDocument();
    expect(screen.getByText('Notas')).toBeInTheDocument();
  });

  it('should show current progress info when goal is loaded', async () => {
    render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Progreso/)).toBeInTheDocument();
    });
  });

  it('should show progress preview when amount is entered', async () => {
    render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Progreso/)).toBeInTheDocument();
    });

    // Enter amount
    const amountInput = screen.getByTestId('numeric-input-contribute-amount');
    fireEvent.change(amountInput, { target: { value: '50000' } });

    await waitFor(() => {
      expect(screen.getByText(/→/)).toBeInTheDocument();
    });
  });

  it('should disable submit button when amount is 0 or less', async () => {
    const { container } = render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const submitBtn = container.querySelector('button[type="submit"]')!;
    expect(submitBtn).toBeDisabled();
  });

  it('should enable submit button when amount is entered', async () => {
    const { container } = render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Progreso/)).toBeInTheDocument();
    });

    // Enter amount
    const amountInput = screen.getByTestId('numeric-input-contribute-amount');
    fireEvent.change(amountInput, { target: { value: '50000' } });

    const submitBtn = container.querySelector('button[type="submit"]')!;
    expect(submitBtn).not.toBeDisabled();
  });

  it('should have hidden inputs for goalId and idempotencyKey', async () => {
    render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Progreso/)).toBeInTheDocument();
    });

    const hiddenInputs = document.querySelectorAll('input[type="hidden"]');
    expect(hiddenInputs.length).toBeGreaterThanOrEqual(2);
  });

  it('should display source account options', async () => {
    render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Cuenta de origen')).toBeInTheDocument();
    });
  });

  it('should display remaining amount info when goal is loaded', async () => {
    render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Restante')).toBeInTheDocument();
    });
  });
});
