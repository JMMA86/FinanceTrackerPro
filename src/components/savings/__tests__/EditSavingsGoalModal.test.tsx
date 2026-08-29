/**
 * EditSavingsGoalModal Component Tests
 *
 * NOTE: This modal is props-driven (isOpen/onClose) — it does NOT use the
 * Zustand ui.store. The store's ModalId union has no savings goal entries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { SavingsGoal } from '@prisma/client';
import { EditSavingsGoalModal } from '../EditSavingsGoalModal';

const MOCK_CUID = 'clh1234567890abcdefghij';

const mockUpdateSavingsGoal = vi.fn();

vi.mock('@/actions/savings.actions', () => ({
  updateSavingsGoal: (...args: unknown[]) => mockUpdateSavingsGoal(...args),
}));

// Mock i18n get function
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      updateGoal: 'Editar Meta',
      cancel: 'Cancelar',
      loading: 'Guardando...',
      save: 'Guardar',
      goalName: 'Nombre de la meta',
      goalNamePlaceholder: 'Ej: Vacaciones 2026',
      goalDescription: 'Descripción',
      goalDescriptionPlaceholder: 'Describe tu meta...',
      targetAmount: 'Monto objetivo',
      monthlyContribution: 'Contribución mensual',
      monthlyContributionHint: 'Opcional - Cuánto planeas ahorrar cada mes',
      deadline: 'Fecha límite',
      deadlineHint: 'Opcional - Cuándo esperas cumplir la meta',
      status: 'Estado',
      color: 'Color',
      customColor: 'Color personalizado',
      'errors.sessionInvalid': 'Sesión inválida',
      'errors.updateFailed': 'Error al actualizar la meta',
    };
    return keyMap[key] ?? key;
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
    }: {
      id?: string;
      value: number;
      onChange: (v: number) => void;
      'aria-invalid'?: boolean;
      className?: string;
    }) => (
      <input
        id={id}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        data-testid={`numeric-input-${id}`}
        aria-invalid={ariaInvalid}
        className={className}
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
    // Mirror native behavior: close() fires the 'close' event
    this.dispatchEvent(new Event('close'));
  });
});

describe('EditSavingsGoalModal', () => {
  const mockOnClose = vi.fn();
  const defaultDictionary = {};

  const baseGoal: SavingsGoal = {
    id: MOCK_CUID,
    userId: 'user-1',
    name: 'Vacaciones 2026',
    description: 'Ahorro para viaje',
    type: 'ANNUAL',
    targetAmountCents: 200000,
    currency: 'COP',
    currentAmountCents: 50000,
    deadline: null,
    monthlyContributionCents: 25000,
    linkedAccountId: null,
    status: 'ACTIVE',
    priority: 0,
    color: 'from-violet-500 to-purple-500',
    icon: null,
    idempotencyKey: null,
    isActive: true,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    createdBy: 'user-1',
    lastModifiedBy: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateSavingsGoal.mockResolvedValue({ success: true, data: { id: MOCK_CUID } });
  });

  const renderModal = () =>
    render(
      <EditSavingsGoalModal
        goal={baseGoal}
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

  /**
   * The component's reset effect schedules a requestAnimationFrame callback
   * that clears submitError and flips isVisible. We wait for that callback to
   * complete (content opacity becomes 1) before submitting, so a late rAF does
   * not wipe the submit error we assert on.
   */
  const waitForVisible = async (container: HTMLElement) => {
    await waitFor(() => {
      const content = container.querySelector('div[class*="max-w-lg"]') as HTMLElement | null;
      expect(content).toBeTruthy();
      expect(content?.style.opacity).toBe('1');
    });
  };

  it('should render the form with all fields when open', async () => {
    const { container } = renderModal();

    await waitFor(() => {
      expect(screen.getByText('Editar Meta')).toBeInTheDocument();
    });

    expect(container.querySelector('h2')?.textContent).toContain('Editar Meta');
    expect(screen.getByLabelText('Nombre de la meta')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
    expect(screen.getByLabelText('Monto objetivo')).toBeInTheDocument();
    expect(screen.getByLabelText('Contribución mensual')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha límite')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toBeInTheDocument();
    expect(screen.getByText('Color')).toBeInTheDocument();
    expect(screen.getByText('Guardar')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });

  it('should call showModal when isOpen=true', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Editar Meta')).toBeInTheDocument();
    });
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should prefill the form with the goal values', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre de la meta')).toHaveValue('Vacaciones 2026');
    });

    expect(screen.getByLabelText('Descripción')).toHaveValue('Ahorro para viaje');
    // Target amount and monthly contribution come from the numeric inputs
    await waitFor(() => {
      expect(screen.getByTestId('numeric-input-edit-savings-target')).toHaveValue(200000);
      expect(screen.getByTestId('numeric-input-edit-savings-monthly')).toHaveValue(25000);
    });
  });

  it('should have 3 status options', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByLabelText('Estado')).toBeInTheDocument();
    });

    const statusSelect = screen.getByLabelText('Estado');
    const options = Array.from(statusSelect.querySelectorAll('option'));
    expect(options).toHaveLength(3);
    expect(options.map((o) => o.textContent)).toEqual(['ACTIVE', 'COMPLETED', 'CANCELLED']);
  });

  it('should have 6 preset color swatches and a custom color input', async () => {
    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByText('Editar Meta')).toBeInTheDocument();
    });

    const colorSwatchButtons = container.querySelectorAll('button[aria-label^="from-"]');
    expect(colorSwatchButtons).toHaveLength(6);
    expect(container.querySelector('input[type="color"]')).toBeInTheDocument();
  });

  it('should submit valid changes and call updateSavingsGoal then onClose', async () => {
    const { container } = renderModal();

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre de la meta')).toHaveValue('Vacaciones 2026');
    });
    await waitForVisible(container);

    fireEvent.change(screen.getByLabelText('Nombre de la meta'), {
      target: { value: 'Vacaciones 2027' },
    });

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockUpdateSavingsGoal).toHaveBeenCalledWith(
        expect.objectContaining({
          goalId: MOCK_CUID,
          name: 'Vacaciones 2027',
          targetAmountCents: 200000,
          monthlyContributionCents: 25000,
          status: 'ACTIVE',
        })
      );
    });
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should display server error when update fails', async () => {
    mockUpdateSavingsGoal.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Server error occurred',
    });

    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre de la meta')).toHaveValue('Vacaciones 2026');
    });
    await waitForVisible(container);

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockUpdateSavingsGoal).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error occurred');
    });
  });

  it('should display session invalid message when code is SESSION_INVALID', async () => {
    mockUpdateSavingsGoal.mockResolvedValue({
      success: false,
      code: 'SESSION_INVALID',
    });

    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre de la meta')).toHaveValue('Vacaciones 2026');
    });
    await waitForVisible(container);

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sesión inválida');
    });
  });

  it('should display generic error when the action throws', async () => {
    mockUpdateSavingsGoal.mockImplementation(() => Promise.reject(new Error('boom')));

    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByLabelText('Nombre de la meta')).toHaveValue('Vacaciones 2026');
    });
    await waitForVisible(container);

    const form = document.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockUpdateSavingsGoal).toHaveBeenCalled();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Error al actualizar la meta');
  });

  it('should call onClose when Cancel is clicked', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Editar Meta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancelar'));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
