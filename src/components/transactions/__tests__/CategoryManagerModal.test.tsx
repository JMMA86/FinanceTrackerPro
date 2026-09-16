/**
 * CategoryManagerModal Component Tests
 * Tests list rendering, create/edit/delete category flows, and system restrictions
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CategoryManagerModal } from '../CategoryManagerModal';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAddNotification = vi.fn();
vi.mock('@/store/ui.store', () => ({
  useUIStore: vi.fn((selector) => {
    const state = {
      addNotification: mockAddNotification,
    };
    return selector(state);
  }),
}));

vi.mock('@/lib/i18n', () => ({
  get: vi.fn((_dict: Record<string, unknown>, key: string) => key),
}));

const mockCreateCategory = vi.fn();
const mockUpdateCategory = vi.fn();
const mockDeleteCategory = vi.fn();
vi.mock('@/actions/category.actions', () => ({
  createCategory: (...args: unknown[]) => mockCreateCategory(...args),
  updateCategory: (...args: unknown[]) => mockUpdateCategory(...args),
  deleteCategory: (...args: unknown[]) => mockDeleteCategory(...args),
}));

HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
});
HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute('open');
});

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const mockCategories = [
  { id: 'cat-1', name: 'Groceries', type: 'GROCERIES', color: '#3B82F6', userId: null },
  { id: 'cat-2', name: 'My Travel', type: 'OTHER', color: '#8B5CF6', userId: 'user-1' },
];

const dictionary = {};

const renderModal = (overrides: Record<string, unknown> = {}) =>
  render(
    <CategoryManagerModal
      open
      categories={mockCategories}
      dictionary={dictionary}
      onClose={vi.fn()}
      onChanged={vi.fn()}
      {...overrides}
    />
  );

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CategoryManagerModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the dialog with title and aria-labelledby', () => {
    const { container } = renderModal();

    expect(screen.getByText('categoriesTitle')).toBeInTheDocument();
    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'category-manager-title');
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  });

  it('should list all categories with color dots', () => {
    renderModal();

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('My Travel')).toBeInTheDocument();
  });

  it('should mark system categories as default and not editable', () => {
    renderModal();

    // System category shows the "Default" badge
    expect(screen.getByText('systemCategory')).toBeInTheDocument();
    // No edit/delete buttons for system categories
    expect(screen.queryByLabelText('editCategory: Groceries')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('deleteCategory: Groceries')).not.toBeInTheDocument();
  });

  it('should show edit and delete buttons for user-defined categories', () => {
    renderModal();

    expect(screen.getByLabelText('editCategory: My Travel')).toBeInTheDocument();
    expect(screen.getByLabelText('deleteCategory: My Travel')).toBeInTheDocument();
  });

  it('should create a category with name, type and color', async () => {
    mockCreateCategory.mockResolvedValue({ success: true, data: {} });

    renderModal();

    await userEvent.type(screen.getByLabelText('categoryName'), 'Rent');
    await userEvent.selectOptions(screen.getByLabelText('categoryType'), 'UTILITIES');
    await userEvent.click(screen.getByLabelText('categoryColor #10B981'));

    await userEvent.click(screen.getByRole('button', { name: 'addCategory' }));

    await waitFor(() => {
      expect(mockCreateCategory).toHaveBeenCalledWith({
        name: 'Rent',
        type: 'UTILITIES',
        color: '#10B981',
      });
      expect(mockAddNotification).toHaveBeenCalledWith('success', 'categorySaved');
    });
  });

  it('should not submit when the name is empty', async () => {
    renderModal();

    await userEvent.click(screen.getByRole('button', { name: 'addCategory' }));

    await waitFor(() => {
      expect(mockCreateCategory).not.toHaveBeenCalled();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('categoryError');
  });

  it('should prefill the form and update an existing category', async () => {
    mockUpdateCategory.mockResolvedValue({ success: true, data: {} });

    renderModal();

    // Start editing the user category
    await userEvent.click(screen.getByLabelText('editCategory: My Travel'));

    // Form is prefilled
    expect(screen.getByLabelText('categoryName')).toHaveValue('My Travel');
    expect(screen.getByLabelText('categoryType')).toHaveValue('OTHER');

    // Change the name and save
    await userEvent.clear(screen.getByLabelText('categoryName'));
    await userEvent.type(screen.getByLabelText('categoryName'), 'Travel 2026');
    await userEvent.click(screen.getByRole('button', { name: 'saveCategory' }));

    await waitFor(() => {
      expect(mockUpdateCategory).toHaveBeenCalledWith({
        categoryId: 'cat-2',
        name: 'Travel 2026',
        type: 'OTHER',
        color: '#8B5CF6',
      });
      expect(mockAddNotification).toHaveBeenCalledWith('success', 'categorySaved');
    });
  });

  it('should delete a category after inline confirmation', async () => {
    mockDeleteCategory.mockResolvedValue({ success: true, data: {} });

    renderModal();

    // Click delete on the user category → inline confirmation appears
    await userEvent.click(screen.getByLabelText('deleteCategory: My Travel'));
    expect(screen.getByText('categoryDeleteConfirm')).toBeInTheDocument();

    // Confirm deletion
    await userEvent.click(screen.getByText('deleteCategory'));

    await waitFor(() => {
      expect(mockDeleteCategory).toHaveBeenCalledWith({ categoryId: 'cat-2' });
      expect(mockAddNotification).toHaveBeenCalledWith('success', 'categoryDeleted');
    });
  });

  it('should cancel inline deletion and keep the category', async () => {
    renderModal();

    await userEvent.click(screen.getByLabelText('deleteCategory: My Travel'));
    expect(screen.getByText('categoryDeleteConfirm')).toBeInTheDocument();

    await userEvent.click(screen.getByText('cancel'));

    expect(mockDeleteCategory).not.toHaveBeenCalled();
    expect(screen.queryByText('categoryDeleteConfirm')).not.toBeInTheDocument();
  });

  it('should show error notification when create fails', async () => {
    mockCreateCategory.mockResolvedValue({ success: false, code: 'X', error: 'boom' });

    renderModal();

    await userEvent.type(screen.getByLabelText('categoryName'), 'Rent');
    await userEvent.click(screen.getByRole('button', { name: 'addCategory' }));

    await waitFor(() => {
      expect(mockAddNotification).toHaveBeenCalledWith('error', 'categoryError');
    });
  });

  it('should call onChanged after a successful mutation', async () => {
    const mockOnChanged = vi.fn();
    mockCreateCategory.mockResolvedValue({ success: true, data: {} });

    renderModal({ onChanged: mockOnChanged });

    await userEvent.type(screen.getByLabelText('categoryName'), 'Rent');
    await userEvent.click(screen.getByRole('button', { name: 'addCategory' }));

    await waitFor(() => {
      expect(mockOnChanged).toHaveBeenCalled();
    });
  });
});
