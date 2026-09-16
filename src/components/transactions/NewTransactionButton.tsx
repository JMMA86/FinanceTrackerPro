'use client';

import { Plus } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';

interface NewTransactionButtonProps {
  dictionary: Record<string, unknown>;
  disabled?: boolean;
}

export function NewTransactionButton({
  dictionary,
  disabled = false,
}: Readonly<NewTransactionButtonProps>) {
  const openModal = useUIStore((s) => s.openModal);

  return (
    <button
      type="button"
      onClick={() => openModal('create-transaction')}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
    >
      <Plus className="w-4 h-4" aria-hidden="true" />
      {get(dictionary, 'newTransaction')}
    </button>
  );
}
