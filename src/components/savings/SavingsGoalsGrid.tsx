'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, PiggyBank } from 'lucide-react';
import { get } from '@/lib/i18n';
import type { SavingsGoalWithProgress } from '@/types/savings';
import { SavingsGoalCard } from './SavingsGoalCard';
import { CreateSavingsGoalModal } from './CreateSavingsGoalModal';
import { EditSavingsGoalModal } from './EditSavingsGoalModal';
import { ContributeModal } from './ContributeModal';
import { DeleteGoalModal } from './DeleteGoalModal';

interface DeletingGoalState {
  id: string;
  name: string;
  hasContributions: boolean;
}

interface SavingsGoalsGridProps {
  /** Goals + progress loaded on the server page. */
  goals: SavingsGoalWithProgress[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  loadError: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
}

export function SavingsGoalsGrid({
  goals,
  loadError,
  dictionary,
  locale,
}: Readonly<SavingsGoalsGridProps>) {
  const router = useRouter();

  // Modal states (UI only). Initial data always comes from server props; after
  // any mutation the page is re-rendered server-side via router.refresh().
  const [showCreate, setShowCreate] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoalWithProgress | null>(null);
  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [deletingGoal, setDeletingGoal] = useState<DeletingGoalState | null>(null);

  // Each modal calls onClose() twice per close cycle: once directly from its
  // submit handler after a successful mutation and once via the native
  // <dialog> 'close' event ~240ms later (fade-out). Both fire router.refresh(),
  // so two overlapping refreshes race and can intermittently leave stale
  // server-rendered DOM after a mutation. Coalesce the duplicate; the guard is
  // reset whenever a modal opens so genuinely consecutive mutations always
  // refresh.
  const lastRefreshAtRef = useRef(0);

  const refreshOnce = useCallback(() => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < 1000) return;
    lastRefreshAtRef.current = now;
    router.refresh();
  }, [router]);

  const handleContribute = useCallback((goalId: string) => {
    lastRefreshAtRef.current = 0;
    setContributingGoalId(goalId);
  }, []);

  const handleEdit = useCallback((goal: SavingsGoalWithProgress) => {
    lastRefreshAtRef.current = 0;
    setEditingGoal(goal);
  }, []);

  const handleDelete = useCallback(
    (goalId: string, goalName: string, hasContributions: boolean) => {
      lastRefreshAtRef.current = 0;
      setDeletingGoal({ id: goalId, name: goalName, hasContributions });
    },
    []
  );

  const handleCreateClose = useCallback(() => {
    setShowCreate(false);
    refreshOnce();
  }, [refreshOnce]);

  const handleEditClose = useCallback(() => {
    setEditingGoal(null);
    refreshOnce();
  }, [refreshOnce]);

  const handleContributeClose = useCallback(() => {
    setContributingGoalId(null);
    refreshOnce();
  }, [refreshOnce]);

  const handleDeleteClose = useCallback(() => {
    setDeletingGoal(null);
    refreshOnce();
  }, [refreshOnce]);

  const openCreate = useCallback(() => {
    lastRefreshAtRef.current = 0;
    setShowCreate(true);
  }, []);

  if (loadError) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-6 text-center">
        <p className="text-sm text-red-400">{loadError}</p>
        <button
          type="button"
          onClick={refreshOnce}
          className="mt-3 px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-300 hover:bg-white/10 transition-colors"
        >
          {get(dictionary, 'retry')}
        </button>
      </div>
    );
  }

  return (
    <>
      {goals.length === 0 ? (
        <div className="app-shell rounded-2xl py-16 flex flex-col items-center gap-4 text-center">
          <div className="p-4 rounded-2xl bg-violet-500/10 text-violet-400">
            <PiggyBank className="w-8 h-8" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white mb-1">{get(dictionary, 'noGoals')}</p>
            <p className="text-xs text-slate-400 max-w-sm">{get(dictionary, 'noGoalsDesc')}</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            {get(dictionary, 'addGoal')}
          </button>
        </div>
      ) : (
        <>
          {/* Header with add button */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
              {goals.length}{' '}
              {goals.length === 1 ? get(dictionary, 'goal') : get(dictionary, 'goals')}
            </h2>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {get(dictionary, 'addGoal')}
            </button>
          </div>

          {/* Goals grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {goals.map((goal) => (
              <SavingsGoalCard
                key={goal.id}
                goal={goal}
                dictionary={dictionary}
                locale={locale}
                onContribute={handleContribute}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      <CreateSavingsGoalModal
        dictionary={dictionary}
        locale={locale}
        isOpen={showCreate}
        onClose={handleCreateClose}
      />

      {editingGoal && (
        <EditSavingsGoalModal
          goal={editingGoal}
          dictionary={dictionary}
          locale={locale}
          isOpen
          onClose={handleEditClose}
        />
      )}

      {contributingGoalId && (
        <ContributeModal
          goalId={contributingGoalId}
          dictionary={dictionary}
          locale={locale}
          isOpen
          onClose={handleContributeClose}
        />
      )}

      {deletingGoal && (
        <DeleteGoalModal
          goalId={deletingGoal.id}
          goalName={deletingGoal.name}
          hasContributions={deletingGoal.hasContributions}
          dictionary={dictionary}
          isOpen
          onClose={handleDeleteClose}
        />
      )}
    </>
  );
}
