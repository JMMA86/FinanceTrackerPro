/**
 * DeleteVariableExpenseModal Component Tests — soft-delete confirmation.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DeleteVariableExpenseModal } from '../DeleteVariableExpenseModal';
import { deleteVariableExpense } from '@/actions/variable-expense.actions';
import type { VariableExpenseDefinition } from '@/types/variable-expense';

vi.mock('@/actions/variable-expense.actions', () => ({
  deleteVariableExpense: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      deleteDefinition: 'Eliminar definición',
      deleteConfirm: '¿Seguro que quieres eliminarla?',
      delete: 'Eliminar',
      cancel: 'Cancelar',
      loading: 'Cargando...',
      close: 'Cerrar',
      'errors.deleteFailed': 'No se pudo eliminar',
    };
    return keyMap[key] ?? key;
  }),
}));

const definition: VariableExpenseDefinition = {
  id: 'def-1',
  name: 'Fútbol',
  description: null,
  color: null,
  icon: null,
  categoryId: null,
  category: null,
  expectedTimesPerMonth: null,
  expectedAmountCents: null,
  currency: 'COP',
  isActive: true,
};

describe('DeleteVariableExpenseModal', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();

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
    return render(
      <DeleteVariableExpenseModal
        isOpen
        definition={definition}
        dictionary={{}}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }

  it('soft-deletes the definition on confirm', async () => {
    renderModal();

    fireEvent.click(screen.getByText('Eliminar'));

    await waitFor(() => {
      expect(vi.mocked(deleteVariableExpense)).toHaveBeenCalledWith({
        variableExpenseId: 'def-1',
      });
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an error when the delete fails', async () => {
    const { deleteVariableExpense } = await import('@/actions/variable-expense.actions');
    (deleteVariableExpense as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false });

    renderModal();
    fireEvent.click(screen.getByText('Eliminar'));

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo eliminar');
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
