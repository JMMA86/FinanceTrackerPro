/**
 * CreateSavingsGoalModal Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateSavingsGoalModal } from '../CreateSavingsGoalModal';

// Mock createSavingsGoal action
vi.mock('@/actions/savings.actions', () => ({
  createSavingsGoal: vi.fn().mockResolvedValue({ success: true, data: { id: 'new-goal' } }),
}));

// Mock i18n get function
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      createGoal: 'Crear Meta',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      goalName: 'Nombre de la meta',
      goalNamePlaceholder: 'Ej: Vacaciones 2026',
      goalDescription: 'Descripción',
      goalDescriptionPlaceholder: 'Describe tu meta...',
      goalType: 'Tipo',
      targetAmount: 'Monto objetivo',
      currency: 'Moneda',
      monthlyContribution: 'Contribución mensual',
      monthlyContributionHint: 'Opcional - Cuánto planeas ahorrar cada mes',
      deadline: 'Fecha límite',
      deadlineHint: 'Opcional - Cuándo esperas cumplir la meta',
      color: 'Color',
      'types.ANNUAL': 'Anual',
      'types.SHORT_TERM': 'Corto Plazo',
      'types.EMERGENCY': 'Emergencia',
      'types.CUSTOM': 'Personalizada',
      'errors.sessionInvalid': 'Sesión inválida',
      'errors.createFailed': 'Error al crear la meta',
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

// Helper to check if we're in a jsdom environment without dialog support
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

describe('CreateSavingsGoalModal', () => {
  const mockOnClose = vi.fn();
  const defaultDictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the form with all fields when open', () => {
    const { container } = render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(container.querySelector('h2')?.textContent).toContain('Crear Meta');
    expect(screen.getByLabelText('Nombre de la meta')).toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toBeInTheDocument();
    expect(screen.getByLabelText('Tipo')).toBeInTheDocument();
    expect(screen.getByLabelText('Moneda')).toBeInTheDocument();
    expect(screen.getByLabelText('Contribución mensual')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha límite')).toBeInTheDocument();
  });

  it('should have 4 goal type options', () => {
    render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const typeSelect = screen.getByLabelText('Tipo');
    const options = Array.from(typeSelect.querySelectorAll('option'));
    expect(options).toHaveLength(4);
    expect(options[0].textContent).toBe('Anual');
    expect(options[1].textContent).toBe('Corto Plazo');
    expect(options[2].textContent).toBe('Emergencia');
    expect(options[3].textContent).toBe('Personalizada');
  });

  it('should have currency options COP, USD, EUR', () => {
    render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    const currencySelect = screen.getByLabelText('Moneda');
    const options = Array.from(currencySelect.querySelectorAll('option'));
    const currencyValues = options.map((o) => o.textContent);
    expect(currencyValues).toContain('COP');
    expect(currencyValues).toContain('USD');
    expect(currencyValues).toContain('EUR');
  });

  it('should have color swatch buttons and a custom color input', () => {
    const { container } = render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Preset colors are rendered as gradient swatch buttons (aria-label matches Tailwind gradient class)
    const colorSwatchButtons = container.querySelectorAll('button[aria-label^="from-"]');
    expect(colorSwatchButtons.length).toBeGreaterThanOrEqual(6);

    // A native color picker input is also present for custom hex colors
    const colorInput = container.querySelector('input[type="color"]');
    expect(colorInput).toBeInTheDocument();
  });

  it('should call showModal when isOpen=true', () => {
    render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should show inline validation errors when submitting with invalid data', async () => {
    const { container } = render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Submit without filling in required fields → should trigger form validation error
    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      // Should show Zod validation error from react-hook-form for name
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
  });

  it('should allow filling the form fields', async () => {
    render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Fill in name
    const nameInput = screen.getByLabelText('Nombre de la meta');
    fireEvent.change(nameInput, { target: { value: 'New Goal' } });
    expect(nameInput).toHaveValue('New Goal');

    // Set target amount
    const targetInput = screen.getByTestId('numeric-input-savings-target');
    fireEvent.change(targetInput, { target: { value: '100000' } });
    expect(targetInput).toHaveValue(100000);
  });

  it('should submit form and display server error', async () => {
    const { createSavingsGoal } = await import('@/actions/savings.actions');
    (createSavingsGoal as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: false,
      error: 'Server error occurred',
    });

    const { container } = render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    // Fill in valid fields so client-side validation passes
    const nameInput = screen.getByLabelText('Nombre de la meta');
    fireEvent.change(nameInput, { target: { value: 'Test Goal' } });
    const targetInput = screen.getByTestId('numeric-input-savings-target');
    fireEvent.change(targetInput, { target: { value: '100000' } });

    // Submit via clicking the submit button
    const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement;
    fireEvent.click(submitBtn);

    // The mocked server error must be rendered in the error alert
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error occurred');
    });
  });

  it('should have Cancel button rendered', () => {
    render(
      <CreateSavingsGoalModal
        dictionary={defaultDictionary}
        locale="es-CO"
        isOpen={true}
        onClose={mockOnClose}
      />
    );

    expect(screen.getByText('Cancelar')).toBeInTheDocument();
  });
});
