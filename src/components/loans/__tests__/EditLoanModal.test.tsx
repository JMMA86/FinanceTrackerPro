/**
 * EditLoanModal Component Tests
 *
 * Metadata-only form (react-hook-form + Zod): preload, submit success and
 * client-side validation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditLoanModal } from '../EditLoanModal';
import type { LoanWithInstallments } from '@/types/loans';

vi.mock('@/actions/loan.actions', () => ({
  updateLoan: vi.fn().mockResolvedValue({ success: true, data: { id: 'clh1234567890abcdefghij' } }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      updateLoan: 'Actualizar préstamo',
      close: 'Cerrar',
      name: 'Nombre del préstamo',
      namePlaceholder: 'Ej: Préstamo a Juan',
      notes: 'Notas (opcional)',
      'status.label': 'Estado',
      'status.ACTIVE': 'Activo',
      'status.COMPLETED': 'Completado',
      'status.CANCELLED': 'Cancelado',
      'status.DEFAULTED': 'En mora',
      color: 'Color',
      customColor: 'Color personalizado',
      'colorNames.violet': 'Violeta',
      save: 'Guardar',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      'errors.updateFailed': 'No se pudo actualizar el préstamo',
      'errors.validationFailed': 'Revisa los datos del formulario',
    };
    return keyMap[key] ?? key;
  }),
  localeToBCP47: vi.fn(() => 'es-CO'),
}));

import { updateLoan } from '@/actions/loan.actions';

const loan = {
  id: 'clh1234567890abcdefghij',
  name: 'Préstamo a Juan',
  notes: null,
  color: null,
  status: 'ACTIVE',
} as unknown as LoanWithInstallments;

describe('EditLoanModal', () => {
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
    return render(<EditLoanModal loan={loan} dictionary={{}} isOpen onClose={onClose} />);
  }

  function submitButton(container: HTMLElement) {
    return container.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  /**
   * The modal resets `submitError` on the first animation frame after mount.
   * Wait for the entrance transition to settle so a fast submit is not wiped by
   * that mount-time reset (pre-existing flake).
   */
  async function waitForModalVisible(container: HTMLElement) {
    await waitFor(() => {
      const panel = container.querySelector('form')?.parentElement as HTMLElement | null;
      expect(panel?.style.opacity).toBe('1');
    });
  }

  function panel(container: HTMLElement) {
    return container.querySelector('form')?.parentElement as HTMLElement | null;
  }

  it('precarga el nombre y guarda los cambios', async () => {
    const { container } = renderModal();

    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del préstamo')).toHaveValue('Préstamo a Juan')
    );

    fireEvent.change(screen.getByLabelText('Nombre del préstamo'), {
      target: { value: 'Préstamo a María' },
    });
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(updateLoan).toHaveBeenCalledWith(
        expect.objectContaining({ loanId: 'clh1234567890abcdefghij', name: 'Préstamo a María' })
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('bloquea el envío cuando el nombre queda vacío', async () => {
    const { container } = renderModal();

    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del préstamo')).toHaveValue('Préstamo a Juan')
    );

    fireEvent.change(screen.getByLabelText('Nombre del préstamo'), { target: { value: '' } });
    fireEvent.click(submitButton(container));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(updateLoan).not.toHaveBeenCalled();
  });

  it('muestra el error del servidor', async () => {
    vi.mocked(updateLoan).mockResolvedValueOnce({
      success: false,
      error: 'No se pudo actualizar el préstamo',
      code: 'INTERNAL_SERVER_ERROR',
    });

    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del préstamo')).toHaveValue('Préstamo a Juan')
    );
    await waitForModalVisible(container);

    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo actualizar el préstamo');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mapea el error de validación del servidor', async () => {
    vi.mocked(updateLoan).mockResolvedValueOnce({
      success: false,
      error: 'name: validation.nameRequired',
      code: 'VALIDATION_ERROR',
    });

    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del préstamo')).toHaveValue('Préstamo a Juan')
    );
    await waitForModalVisible(container);

    fireEvent.click(submitButton(container));

    expect(await screen.findByRole('alert')).toHaveTextContent('Name is required');
  });

  it('muestra el mensaje de la excepción cuando la acción lanza', async () => {
    vi.mocked(updateLoan).mockRejectedValueOnce(new Error('falló la red'));

    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del préstamo')).toHaveValue('Préstamo a Juan')
    );
    await waitForModalVisible(container);

    fireEvent.click(submitButton(container));

    expect(await screen.findByRole('alert')).toHaveTextContent('falló la red');
  });

  it('incluye el color predefinido seleccionado en el payload', async () => {
    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del préstamo')).toHaveValue('Préstamo a Juan')
    );
    await waitForModalVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Violeta' }));
    fireEvent.click(submitButton(container));

    await waitFor(() =>
      expect(updateLoan).toHaveBeenCalledWith(
        expect.objectContaining({ color: 'from-violet-500 to-purple-500' })
      )
    );
  });

  it('incluye el color personalizado en el payload', async () => {
    const { container } = renderModal();
    await waitFor(() =>
      expect(screen.getByLabelText('Nombre del préstamo')).toHaveValue('Préstamo a Juan')
    );
    await waitForModalVisible(container);

    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#112233' } });
    fireEvent.click(submitButton(container));

    await waitFor(() =>
      expect(updateLoan).toHaveBeenCalledWith(expect.objectContaining({ color: '#112233' }))
    );
  });

  it('cierra el diálogo al pulsar Cancelar', async () => {
    const { container } = renderModal();
    await waitForModalVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(panel(container)?.style.opacity).toBe('0'));
    expect(updateLoan).not.toHaveBeenCalled();
  });

  it('notifica onClose cuando el diálogo emite el evento nativo de cierre', () => {
    renderModal();

    fireEvent(screen.getByRole('dialog'), new Event('close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('oculta el diálogo cuando isOpen cambia a false', async () => {
    const { container, rerender } = renderModal();
    await waitForModalVisible(container);

    rerender(<EditLoanModal loan={loan} dictionary={{}} isOpen={false} onClose={onClose} />);

    await waitFor(() => expect(panel(container)?.style.opacity).toBe('0'));
  });
});
