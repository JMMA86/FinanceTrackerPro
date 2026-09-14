/**
 * VariableExpenseDefinitionModal Component Tests
 *
 * Locks: no custom color input (unlike savings goals), the REQUIRED category
 * chip selector and the create/update payload carrying `categoryId`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VariableExpenseDefinitionModal } from '../VariableExpenseDefinitionModal';
import { createVariableExpense, updateVariableExpense } from '@/actions/variable-expense.actions';
import type { VariableExpenseDefinition } from '@/types/variable-expense';

vi.mock('@/actions/variable-expense.actions', () => ({
  createVariableExpense: vi.fn().mockResolvedValue({ success: true, data: { id: 'new-def' } }),
  updateVariableExpense: vi.fn().mockResolvedValue({ success: true, data: { id: 'def-1' } }),
}));

const CATEGORIES = [
  { id: 'cat-sport', name: 'Deporte', type: 'OTHER', color: '#22c55e', userId: null },
  { id: 'cat-food', name: 'Comida', type: 'FOOD', color: '#f97316', userId: null },
];

vi.mock('@/actions/category.actions', () => ({
  getCategories: vi.fn().mockResolvedValue({ success: true, data: CATEGORIES }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => {
    const keyMap: Record<string, string> = {
      createDefinition: 'Nueva definición',
      editDefinition: 'Editar definición',
      definitionName: 'Nombre',
      definitionNamePlaceholder: 'Ej: Fútbol',
      definitionDescription: 'Descripción',
      definitionDescriptionPlaceholder: 'Detalles',
      category: 'Categoría',
      selectCategory: 'Selecciona una categoría',
      expectedTimes: 'Veces al mes',
      expectedAmount: 'Monto esperado',
      currency: 'Moneda',
      color: 'Color',
      icon: 'Icono',
      cancel: 'Cancelar',
      save: 'Guardar',
      loading: 'Cargando...',
      'errors.duplicateName': 'Ya existe una definición con ese nombre',
      'errors.createFailed': 'No se pudo crear',
      'errors.updateFailed': 'No se pudo actualizar',
      close: 'Cerrar',
    };
    return keyMap[key] ?? key;
  }),
}));

vi.mock('@/components/ui/FormattedNumericInput', () => ({
  FormattedNumericInput: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value: number;
    onChange: (value: number) => void;
  }) => (
    <input
      id={id}
      type="number"
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      data-testid={`numeric-input-${id}`}
    />
  ),
}));

const existingDefinition: VariableExpenseDefinition = {
  id: 'def-1',
  name: 'Fútbol',
  description: 'Partidos',
  color: '#14b8a6',
  icon: 'dumbbell',
  categoryId: 'cat-sport',
  category: { id: 'cat-sport', name: 'Deporte', color: '#22c55e' },
  expectedTimesPerMonth: 4,
  expectedAmountCents: 5000,
  currency: 'COP',
  isActive: true,
};

describe('VariableExpenseDefinitionModal', () => {
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

  function renderModal(definition: VariableExpenseDefinition | null = null) {
    return render(
      <VariableExpenseDefinitionModal
        isOpen
        definition={definition}
        dictionary={{}}
        locale="es-CO"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
  }

  function submitButton(container: HTMLElement) {
    return container.querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('renders the category chips and NO custom color picker', async () => {
    const { container } = renderModal();

    await screen.findByLabelText('Deporte');
    expect(screen.getByLabelText('Comida')).toBeInTheDocument();
    // The variable-expense modal intentionally has no free-form color input.
    expect(container.querySelector('input[type="color"]')).not.toBeInTheDocument();
  });

  it('creates a definition including the selected categoryId', async () => {
    const { container } = renderModal();
    await screen.findByLabelText('Deporte');

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Baloncesto' } });
    fireEvent.click(screen.getByLabelText('Deporte'));
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(vi.mocked(createVariableExpense)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Baloncesto',
          categoryId: 'cat-sport',
          currency: 'COP',
        })
      );
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('requires a category before submitting', async () => {
    const { container } = renderModal();
    await screen.findByLabelText('Deporte');

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Sin categoría' } });
    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(screen.getByText('Selecciona una categoría')).toBeInTheDocument();
    });
    expect(createVariableExpense).not.toHaveBeenCalled();
  });

  it('prefills and updates an existing definition with its categoryId', async () => {
    const { container } = renderModal(existingDefinition);

    await waitFor(() => {
      expect(screen.getByLabelText('Nombre')).toHaveValue('Fútbol');
    });
    expect(screen.getByLabelText('Deporte')).toBeChecked();

    fireEvent.click(submitButton(container));

    await waitFor(() => {
      expect(vi.mocked(updateVariableExpense)).toHaveBeenCalledWith(
        expect.objectContaining({
          variableExpenseId: 'def-1',
          categoryId: 'cat-sport',
          name: 'Fútbol',
        })
      );
    });
  });
});
