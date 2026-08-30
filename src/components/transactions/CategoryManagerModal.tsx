'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import { createCategory, updateCategory, deleteCategory } from '@/actions/category.actions';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';
import type { CategoryBrief } from '@/components/transactions/types';

interface CategoryManagerModalProps {
  open: boolean;
  categories: CategoryBrief[];
  dictionary: Record<string, unknown>;
  onClose: () => void;
  onChanged: () => void;
}

const CATEGORY_TYPES = [
  { value: 'GROCERIES', labelKey: 'groceries' },
  { value: 'TRANSPORTATION', labelKey: 'transportation' },
  { value: 'UTILITIES', labelKey: 'utilities' },
  { value: 'ENTERTAINMENT', labelKey: 'entertainment' },
  { value: 'HEALTHCARE', labelKey: 'healthcare' },
  { value: 'EDUCATION', labelKey: 'education' },
  { value: 'SHOPPING', labelKey: 'shopping' },
  { value: 'DINING', labelKey: 'dining' },
  { value: 'OTHER', labelKey: 'other' },
] as const;

const COLOR_PRESETS = [
  '#3B82F6',
  '#EF4444',
  '#10B981',
  '#F59E0B',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#F97316',
  '#64748B',
] as const;

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => vars[key] ?? '');
}

const inputCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all';
const selectCls =
  'w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all appearance-none';
const labelCls = 'block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider';

export function CategoryManagerModal({
  open,
  categories,
  dictionary,
  onClose,
  onChanged,
}: Readonly<CategoryManagerModalProps>) {
  const addNotification = useUIStore((s) => s.addNotification);

  // NOTE (Fix 2 — prod finding): the category list MUST derive directly from
  // the `categories` prop (rendered via `categories.map(...)` below). Do NOT
  // copy it into `useState(categories)` — after a mutation the parent calls
  // `router.refresh()` and the page server component re-fetches categories,
  // so the modal only sees fresh data when it stays a pure function of props.

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form state (create / edit)
  const [mode, setMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('OTHER');
  const [color, setColor] = useState<string>(COLOR_PRESETS[0]);

  // Inline delete confirmation
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const isEditing = mode === 'edit';

  // -------------------------------------------------------------------------
  // Dialog open/close
  // -------------------------------------------------------------------------

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else if (dialog.open) {
      setIsVisible(false);
      setTimeout(() => {
        if (dialog.open) dialog.close();
      }, 220);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const handleClose = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    setIsVisible(false);
    setTimeout(() => {
      if (dialog.open) dialog.close();
    }, 220);
    // Clear form state for the next open
    resetForm();
  }, []);

  const handleDialogClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // -------------------------------------------------------------------------
  // Form helpers
  // -------------------------------------------------------------------------

  function resetForm() {
    setMode('create');
    setEditingId(null);
    setName('');
    setType('OTHER');
    setColor(COLOR_PRESETS[0]);
    setFormError(null);
    setConfirmingId(null);
  }

  function startEdit(category: CategoryBrief) {
    setMode('edit');
    setEditingId(category.id);
    setName(category.name);
    setType(category.type);
    setColor(category.color ?? COLOR_PRESETS[0]);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setFormError(get(dictionary, 'categoryError'));
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const payload = {
      name: name.trim(),
      type,
      color,
    };

    const result =
      isEditing && editingId
        ? await updateCategory({ categoryId: editingId, ...payload })
        : await createCategory(payload);

    setIsSubmitting(false);

    if (result.success) {
      addNotification('success', get(dictionary, 'categorySaved'));
      onChanged();
      resetForm();
    } else {
      addNotification('error', get(dictionary, 'categoryError'));
    }
  }

  async function handleDelete(categoryId: string) {
    setIsSubmitting(true);
    const result = await deleteCategory({ categoryId });
    setIsSubmitting(false);

    if (result.success) {
      addNotification('success', get(dictionary, 'categoryDeleted'));
      setConfirmingId(null);
      if (editingId === categoryId) resetForm();
      onChanged();
    } else {
      addNotification('error', get(dictionary, 'categoryError'));
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const panelStyle: React.CSSProperties = {
    transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(12px)',
    opacity: isVisible ? 1 : 0,
    transition: isVisible
      ? 'transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)'
      : 'transform 180ms cubic-bezier(0.4, 0, 0.2, 1), opacity 160ms cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={handleDialogClose}
      aria-labelledby="category-manager-title"
      className="bg-transparent border-none m-0 h-full w-full max-w-full max-h-full backdrop:bg-transparent open:flex items-center justify-center p-4"
    >
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        style={{
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 180ms ease',
        }}
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        style={panelStyle}
        className="relative w-full max-w-lg bg-slate-900 border border-white/10 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/8 sticky top-0 bg-slate-900 z-10">
          <div>
            <h2 id="category-manager-title" className="text-base font-semibold text-white">
              {get(dictionary, 'categoriesTitle')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{get(dictionary, 'categoriesDesc')}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label={get(dictionary, 'cancel')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Category list */}
          <ul
            className="space-y-2 max-h-64 overflow-y-auto pr-1"
            aria-label={get(dictionary, 'categoriesTitle')}
          >
            {categories.length === 0 && (
              <li className="text-sm text-slate-400 text-center py-6">
                {get(dictionary, 'noCategories')}
              </li>
            )}
            {categories.map((cat) => {
              const isSystem = cat.userId === null;

              // Actions/status rendered to the right of each category name.
              // Extracted from a nested ternary (SonarQube typescript:S3358).
              let categoryActions: ReactNode;
              if (isSystem) {
                categoryActions = (
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-white/5 px-2 py-0.5 rounded-full">
                    {get(dictionary, 'systemCategory')}
                  </span>
                );
              } else if (confirmingId === cat.id) {
                categoryActions = (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-300 max-w-[220px]">
                      {interpolate(get(dictionary, 'categoryDeleteConfirm'), { name: cat.name })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDelete(cat.id)}
                      disabled={isSubmitting}
                      className="text-rose-400 hover:text-rose-300 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 rounded-lg px-1.5 py-0.5 disabled:opacity-50"
                    >
                      {get(dictionary, 'deleteCategory')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(null)}
                      disabled={isSubmitting}
                      className="text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg px-1.5 py-0.5 disabled:opacity-50"
                    >
                      {get(dictionary, 'cancel')}
                    </button>
                  </div>
                );
              } else {
                categoryActions = (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      aria-label={`${get(dictionary, 'editCategory')}: ${cat.name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingId(cat.id)}
                      aria-label={`${get(dictionary, 'deleteCategory')}: ${cat.name}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              }

              return (
                <li
                  key={cat.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/4"
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.color ?? '#64748B' }}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-white font-medium flex-1 min-w-0 truncate">
                    {cat.name}
                  </span>

                  {categoryActions}
                </li>
              );
            })}
          </ul>

          {/* Divider */}
          <div className="border-t border-white/8" />

          {/* Create / Edit form */}
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                {isEditing ? get(dictionary, 'editCategory') : get(dictionary, 'addCategory')}
              </h3>
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-400 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-lg px-1.5 py-0.5"
                >
                  {get(dictionary, 'cancel')}
                </button>
              )}
            </div>

            <div>
              <label htmlFor="cat-name" className={labelCls}>
                {get(dictionary, 'categoryName')}
              </label>
              <input
                id="cat-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                placeholder={get(dictionary, 'categoryName')}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="cat-type" className={labelCls}>
                {get(dictionary, 'categoryType')}
              </label>
              <select
                id="cat-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={selectCls}
              >
                {CATEGORY_TYPES.map((t) => (
                  <option key={t.value} value={t.value} className="bg-slate-800">
                    {get(dictionary, t.labelKey)}
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className={labelCls}>{get(dictionary, 'categoryColor')}</legend>
              <div className="flex flex-wrap gap-2.5">
                {COLOR_PRESETS.map((preset) => (
                  <label
                    key={preset}
                    className={`w-8 h-8 rounded-full cursor-pointer border-2 transition-all ${
                      color === preset
                        ? 'border-white scale-110'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: preset }}
                  >
                    <input
                      type="radio"
                      name="cat-color"
                      value={preset}
                      checked={color === preset}
                      onChange={() => setColor(preset)}
                      className="sr-only"
                      aria-label={`${get(dictionary, 'categoryColor')} ${preset}`}
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            {formError && (
              <p className="text-xs text-red-400" role="alert">
                {formError}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
              >
                {!isEditing && <Plus className="w-4 h-4" aria-hidden="true" />}
                {isEditing ? get(dictionary, 'saveCategory') : get(dictionary, 'addCategory')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </dialog>
  );
}
