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
      currentProgress: 'Progreso actual',
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
    // Mirror native behavior: close() fires the 'close' event.
    this.dispatchEvent(new Event('close'));
  });
});

describe('ContributeModal', () => {
  const mockOnClose = vi.fn();
  const defaultDictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Renders the open modal and waits for the goal (fetched by the modal) to
   * appear. The modal also lazy-loads accounts after a 0ms timer.
   */
  async function renderContributeModal() {
    const utils = render(
      <ContributeModal
        goalId={MOCK_CUID}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    await screen.findByText(/Vacaciones 2026/);
    return utils;
  }

  async function fillValidContribution(container: HTMLElement) {
    // The open effect schedules a requestAnimationFrame that flips isVisible
    // and clears submitError. Wait for it (opacity becomes 1) before touching
    // the form, otherwise a late rAF wipes the submit error we assert on.
    await waitFor(() => {
      const content = container.querySelector('div[class*="max-w-lg"]') as HTMLElement | null;
      expect(content).toBeTruthy();
      expect(content?.style.opacity).toBe('1');
    });

    const amountInput = screen.getByTestId('numeric-input-contribute-amount');
    fireEvent.change(amountInput, { target: { value: '25000' } });

    const accountSelect = screen.getByLabelText('Cuenta de origen') as HTMLSelectElement;
    fireEvent.change(accountSelect, { target: { value: MOCK_CUID } });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(submitBtn).not.toBeDisabled();
    return submitBtn;
  }

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

  it('should submit successfully and call contributeToGoal with the payload and onClose', async () => {
    // Only a CUID-shaped account passes the zod schema validation.
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [{ id: MOCK_CUID, name: 'Cuenta de Ahorros', currency: 'COP', balanceCents: 500000 }],
    });

    const { container } = await renderContributeModal();
    await screen.findByText(/Cuenta de Ahorros/);

    const submitBtn = await fillValidContribution(container);
    fireEvent.click(submitBtn);

    const { contributeToGoal } = await import('@/actions/savings.actions');
    await waitFor(() => {
      expect(contributeToGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          goalId: MOCK_CUID,
          amountCents: 25000,
          sourceAccountId: MOCK_CUID,
          currency: 'COP',
        })
      );
    });
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should show the generic contributeFailed alert when the action returns success:false without a code', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [{ id: MOCK_CUID, name: 'Cuenta de Ahorros', currency: 'COP', balanceCents: 500000 }],
    });
    const { contributeToGoal } = await import('@/actions/savings.actions');
    (contributeToGoal as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false });

    const { container } = await renderContributeModal();
    await screen.findByText(/Cuenta de Ahorros/);

    const submitBtn = await fillValidContribution(container);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Error al contribuir');
    });
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it('should show the server error message when the action returns success:false with an error', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [{ id: MOCK_CUID, name: 'Cuenta de Ahorros', currency: 'COP', balanceCents: 500000 }],
    });
    const { contributeToGoal } = await import('@/actions/savings.actions');
    (contributeToGoal as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      code: 'INSUFFICIENT_FUNDS',
      error: 'Fondos insuficientes',
    });

    const { container } = await renderContributeModal();
    await screen.findByText(/Cuenta de Ahorros/);

    const submitBtn = await fillValidContribution(container);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(contributeToGoal).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Fondos insuficientes');
    });
  });

  it('should show the SESSION_INVALID specific alert', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [{ id: MOCK_CUID, name: 'Cuenta de Ahorros', currency: 'COP', balanceCents: 500000 }],
    });
    const { contributeToGoal } = await import('@/actions/savings.actions');
    (contributeToGoal as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
    });

    const { container } = await renderContributeModal();
    await screen.findByText(/Cuenta de Ahorros/);

    const submitBtn = await fillValidContribution(container);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(contributeToGoal).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sesión inválida');
    });
  });

  it('should show a client-side validation error when submitting without selecting a source account', async () => {
    const { getBankAccounts } = await import('@/actions/account.actions');
    (getBankAccounts as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: [{ id: MOCK_CUID, name: 'Cuenta de Ahorros', currency: 'COP', balanceCents: 500000 }],
    });

    const { container } = await renderContributeModal();
    await screen.findByText(/Cuenta de Ahorros/);

    const amountInput = screen.getByTestId('numeric-input-contribute-amount');
    fireEvent.change(amountInput, { target: { value: '25000' } });

    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    // The source account select is empty → react-hook-form/zod reports a
    // validation error and contributeToGoal is never invoked.
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    const { contributeToGoal } = await import('@/actions/savings.actions');
    expect(contributeToGoal).not.toHaveBeenCalled();
  });

  it('should call onClose when the cancel button is clicked', async () => {
    const { container } = await renderContributeModal();

    // Wait for the closing transition to reach the native dialog.close() call.
    fireEvent.click(screen.getByText('Cancelar'));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
    expect(container.querySelector('button[type="submit"]')).toBeTruthy();
  });
});
