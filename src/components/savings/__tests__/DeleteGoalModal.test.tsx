/**
 * DeleteGoalModal Component Tests
 *
 * NOTE: This modal is props-driven (isOpen/onClose) — it does NOT use the
 * Zustand ui.store. The store's ModalId union has no savings goal entries.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteGoalModal } from '../DeleteGoalModal';

const MOCK_CUID = 'clh1234567890abcdefghij';

const mockDeleteSavingsGoal = vi.fn();

vi.mock('@/actions/savings.actions', () => ({
  deleteSavingsGoal: (...args: unknown[]) => mockDeleteSavingsGoal(...args),
}));

// Mock i18n get function
vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      deleteGoal: 'Eliminar Meta',
      deleteGoalConfirm: '¿Estás seguro de eliminar esta meta?',
      deleteGoalWarning:
        'No se puede eliminar una meta con contribuciones. Desactívala en su lugar.',
      cancel: 'Cancelar',
      delete: 'Eliminar',
      'errors.sessionInvalid': 'Sesión inválida',
      'errors.deleteFailed': 'Error al eliminar la meta',
    };
    return keyMap[key] ?? key;
  }),
}));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

describe('DeleteGoalModal', () => {
  const mockOnClose = vi.fn();
  const defaultDictionary = {};

  beforeEach(() => {
    vi.clearAllMocks();
    mockDeleteSavingsGoal.mockResolvedValue({ success: true, data: { goalId: MOCK_CUID } });
  });

  const renderModal = (props: Partial<React.ComponentProps<typeof DeleteGoalModal>> = {}) =>
    render(
      <DeleteGoalModal
        goalId={MOCK_CUID}
        goalName="Vacaciones 2026"
        hasContributions={false}
        dictionary={defaultDictionary}
        isOpen={true}
        onClose={mockOnClose}
        {...props}
      />
    );

  /**
   * The component's open effect schedules a requestAnimationFrame callback
   * that clears submitError and flips isVisible. We wait for that callback to
   * complete (content opacity becomes 1) before clicking, so a late rAF does
   * not wipe the submit error we assert on.
   */
  const waitForVisible = async (container: HTMLElement) => {
    await waitFor(() => {
      const content = container.querySelector('div[class*="max-w-md"]') as HTMLElement | null;
      expect(content).toBeTruthy();
      expect(content?.style.opacity).toBe('1');
    });
  };

  it('should render title, confirm text and goal name when open', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });

    expect(screen.getByText('¿Estás seguro de eliminar esta meta?')).toBeInTheDocument();
    expect(screen.getByText('“Vacaciones 2026”')).toBeInTheDocument();
    expect(screen.getByText('Cancelar')).toBeInTheDocument();
    expect(screen.getByText('Eliminar')).toBeInTheDocument();
  });

  it('should call showModal when isOpen=true', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should render the blocking warning when hasContributions=true', async () => {
    renderModal({ hasContributions: true });
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });

    expect(screen.getByText(/No se puede eliminar una meta con contribuciones/)).toBeInTheDocument();
  });

  it('should disable the delete button when hasContributions=true', async () => {
    renderModal({ hasContributions: true });
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
  });

  it('should not call deleteSavingsGoal when hasContributions=true', async () => {
    renderModal({ hasContributions: true });
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(mockDeleteSavingsGoal).not.toHaveBeenCalled();
  });

  it('should call deleteSavingsGoal with goalId and call onClose on success', async () => {
    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });
    await waitForVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(mockDeleteSavingsGoal).toHaveBeenCalledWith({ goalId: MOCK_CUID });
    });
    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should display server error when deletion fails', async () => {
    mockDeleteSavingsGoal.mockResolvedValue({
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Server error occurred',
    });

    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });
    await waitForVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Server error occurred');
    });
  });

  it('should display session invalid message when code is SESSION_INVALID', async () => {
    mockDeleteSavingsGoal.mockResolvedValue({ success: false, code: 'SESSION_INVALID' });

    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });
    await waitForVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Sesión inválida');
    });
  });

  it('should display generic error when the action throws', async () => {
    mockDeleteSavingsGoal.mockImplementation(() => Promise.reject(new Error('boom')));

    const { container } = renderModal();
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });
    await waitForVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    await waitFor(() => {
      expect(mockDeleteSavingsGoal).toHaveBeenCalledWith({ goalId: MOCK_CUID });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Error al eliminar la meta');
  });

  it('should call onClose when Cancel is clicked', async () => {
    renderModal();
    await waitFor(() => {
      expect(screen.getByText('Eliminar Meta')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Cancelar'));

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});