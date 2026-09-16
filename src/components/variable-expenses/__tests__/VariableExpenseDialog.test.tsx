/**
 * VariableExpenseDialog Component Tests — shared modal shell.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VariableExpenseDialog } from '../VariableExpenseDialog';

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = { close: 'Cerrar' };
    return keyMap[key] ?? key;
  }),
}));

describe('VariableExpenseDialog', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    });
  });

  it('opens the native dialog and focuses the heading', () => {
    render(
      <VariableExpenseDialog
        open
        titleId="dialog-title"
        title="Mi diálogo"
        dictionary={{}}
        onClose={onClose}
      >
        <p>contenido</p>
      </VariableExpenseDialog>
    );

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Mi diálogo' })).toHaveFocus();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('closes via the close button and notifies onClose', async () => {
    render(
      <VariableExpenseDialog
        open
        titleId="dialog-title"
        title="Mi diálogo"
        dictionary={{}}
        onClose={onClose}
      >
        <p>contenido</p>
      </VariableExpenseDialog>
    );

    fireEvent.click(screen.getByLabelText('Cerrar'));

    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 2000 });
  });
});
