/**
 * DeleteLoanModal Component Tests
 *
 * Confirmation dialog: blocks deletion when there are settled installments and
 * surfaces server errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteLoanModal } from '../DeleteLoanModal';

vi.mock('@/actions/loan.actions', () => ({
  deleteLoan: vi.fn().mockResolvedValue({ success: true, data: { success: true } }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      deleteLoan: 'Eliminar préstamo',
      close: 'Cerrar',
      confirmDelete: '¿Estás seguro de eliminar este préstamo?',
      deleteWarning: 'Esta acción no se puede deshacer.',
      cannotDeletePaid: 'No se puede eliminar un préstamo con cuotas pagadas o parciales.',
      delete: 'Eliminar',
      cancel: 'Cancelar',
      'errors.deleteFailed': 'No se pudo eliminar el préstamo',
      'errors.sessionInvalid': 'Tu sesión expiró. Inicia sesión de nuevo.',
    };
    return keyMap[key] ?? key;
  }),
}));

import { deleteLoan } from '@/actions/loan.actions';

describe('DeleteLoanModal', () => {
  const onClose = vi.fn();
  const onDeleted = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    });
  });

  function renderModal(hasSettledInstallments = false, isOpen = true) {
    return render(
      <DeleteLoanModal
        loanId="loan-1"
        loanName="Préstamo a Juan"
        hasSettledInstallments={hasSettledInstallments}
        dictionary={{}}
        isOpen={isOpen}
        onClose={onClose}
        onDeleted={onDeleted}
      />
    );
  }

  function backdrop(container: HTMLElement) {
    return container.querySelector('[aria-hidden="true"]') as HTMLElement | null;
  }

  /** Wait for the modal entrance animation so mount-time resets cannot race. */
  async function waitForVisible(container: HTMLElement) {
    await waitFor(() => expect(backdrop(container)?.style.opacity).toBe('1'));
  }

  function deleteButton() {
    return screen.getByRole('button', { name: 'Eliminar' }) as HTMLButtonElement;
  }

  it('elimina el préstamo y notifica a los callbacks', async () => {
    renderModal();

    fireEvent.click(deleteButton());

    await waitFor(() => {
      expect(deleteLoan).toHaveBeenCalledWith({ loanId: 'loan-1' });
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('bloquea el borrado y avisa cuando hay cuotas pagadas/parciales', () => {
    renderModal(true);

    expect(
      screen.getByText('No se puede eliminar un préstamo con cuotas pagadas o parciales.')
    ).toBeInTheDocument();
    expect(deleteButton()).toBeDisabled();

    fireEvent.click(deleteButton());
    expect(deleteLoan).not.toHaveBeenCalled();
  });

  it('muestra el error devuelto por el servidor', async () => {
    vi.mocked(deleteLoan).mockResolvedValueOnce({
      success: false,
      error: 'No se pudo eliminar el préstamo',
      code: 'INTERNAL_SERVER_ERROR',
    });

    renderModal();
    fireEvent.click(deleteButton());

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo eliminar el préstamo');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cierra el diálogo al pulsar Cancelar sin borrar el préstamo', async () => {
    const { container } = renderModal();
    await waitForVisible(container);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(backdrop(container)?.style.opacity).toBe('0'));
    expect(deleteLoan).not.toHaveBeenCalled();
  });

  it('notifica onClose cuando el diálogo emite el evento nativo de cierre', () => {
    renderModal();

    fireEvent(screen.getByRole('dialog'), new Event('close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('oculta el diálogo cuando isOpen cambia a false', async () => {
    const { container, rerender } = renderModal();
    await waitForVisible(container);

    rerender(
      <DeleteLoanModal
        loanId="loan-1"
        loanName="Préstamo a Juan"
        hasSettledInstallments={false}
        dictionary={{}}
        isOpen={false}
        onClose={onClose}
        onDeleted={onDeleted}
      />
    );

    await waitFor(() => expect(backdrop(container)?.style.opacity).toBe('0'));
  });

  it('muestra el error genérico cuando el borrado lanza una excepción', async () => {
    vi.mocked(deleteLoan).mockRejectedValueOnce(new Error('boom'));

    const { container } = renderModal();
    await waitForVisible(container);

    fireEvent.click(deleteButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo eliminar el préstamo');
  });
});
