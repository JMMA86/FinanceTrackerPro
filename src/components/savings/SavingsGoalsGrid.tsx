'use client';

import { useState, useCallback, useEffect } from 'react';
import { Plus, PiggyBank } from 'lucide-react';
import { get } from '@/lib/i18n';
import { getSavingsGoals } from '@/actions/savings.actions';
import type { SavingsGoal, SavingsContribution } from '@prisma/client';
import { SavingsGoalCard } from './SavingsGoalCard';
import { CreateSavingsGoalModal } from './CreateSavingsGoalModal';
import { EditSavingsGoalModal } from './EditSavingsGoalModal';
import { ContributeModal } from './ContributeModal';
import { DeleteGoalModal } from './DeleteGoalModal';

interface GoalWithProgress extends SavingsGoal {
  progressPercentage: number;
  projectedCompletion: string | null;
  contributions: SavingsContribution[];
  linkedAccount?: { id: string; name: string; currency: string } | null;
}

interface SavingsGoalsGridProps {
  dictionary: Record<string, unknown>;
  locale: string;
}

export function SavingsGoalsGrid({ dictionary, locale }: Readonly<SavingsGoalsGridProps>) {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showCreate, setShowCreate] = useState(false);
  const [editingGoal, setEditingGoal] = useState<GoalWithProgress | null>(null);
  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [deletingGoalId, setDeletingGoalId] = useState<string | null>(null);
  const [deletingGoalName, setDeletingGoalName] = useState('');
  const [deletingHasContributions, setDeletingHasContributions] = useState(false);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSavingsGoals({});
      if (res.success && res.data) {
        setGoals(res.data as GoalWithProgress[]);
      } else {
        setError(res.error ?? get(dictionary, 'errors.loadFailed'));
      }
    } catch {
      setError(get(dictionary, 'errors.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [dictionary]);

  useEffect(() => {
    const id = setTimeout(() => {
      loadGoals();
    }, 0);
    return () => clearTimeout(id);
  }, [loadGoals]);

  const handleContribute = useCallback((goalId: string) => {
    setContributingGoalId(goalId);
  }, []);

  const handleEdit = useCallback((goal: GoalWithProgress) => {
    setEditingGoal(goal);
  }, []);

  const handleDelete = useCallback(
    (goalId: string, goalName: string, hasContributions: boolean) => {
      setDeletingGoalId(goalId);
      setDeletingGoalName(goalName);
      setDeletingHasContributions(hasContributions);
    },
    []
  );

  const handleModalClose = useCallback(() => {
    loadGoals();
  }, [loadGoals]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-5 animate-pulse space-y-4">
            <div className="h-1.5 bg-white/5 rounded-full" />
            <div className="h-5 w-32 bg-white/5 rounded" />
            <div className="h-2.5 bg-white/5 rounded-full" />
            <div className="grid grid-cols-2 gap-3">
              <div className="h-8 bg-white/5 rounded" />
              <div className="h-8 bg-white/5 rounded" />
            </div>
            <div className="h-4 w-24 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-6 text-center">
        <p className="text-sm text-red-400">{error}</p>
        <button
          type="button"
          onClick={loadGoals}
          className="mt-3 px-4 py-2 rounded-xl bg-white/5 text-sm text-slate-300 hover:bg-white/10 transition-colors"
        >
          {get(dictionary, 'retry')}
        </button>
      </div>
    );
  }

  if (goals.length === 0) {
    return (
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
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {get(dictionary, 'addGoal')}
        </button>

        <CreateSavingsGoalModal
          dictionary={dictionary}
          locale={locale}
          isOpen={showCreate}
          onClose={() => {
            setShowCreate(false);
            handleModalClose();
          }}
        />
      </div>
    );
  }

  return (
    <>
      {/* Header with add button */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          {goals.length} {goals.length === 1 ? get(dictionary, 'goal') : get(dictionary, 'goals')}
        </h2>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors"
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

      {/* Modals */}
      <CreateSavingsGoalModal
        dictionary={dictionary}
        locale={locale}
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          handleModalClose();
        }}
      />

      {editingGoal && (
        <EditSavingsGoalModal
          goal={editingGoal}
          dictionary={dictionary}
          locale={locale}
          isOpen={!!editingGoal}
          onClose={() => {
            setEditingGoal(null);
            handleModalClose();
          }}
        />
      )}

      {contributingGoalId && (
        <ContributeModal
          goalId={contributingGoalId}
          dictionary={dictionary}
          locale={locale}
          isOpen={!!contributingGoalId}
          onClose={() => {
            setContributingGoalId(null);
            handleModalClose();
          }}
        />
      )}

      {deletingGoalId && (
        <DeleteGoalModal
          goalId={deletingGoalId}
          goalName={deletingGoalName}
          hasContributions={deletingHasContributions}
          dictionary={dictionary}
          isOpen={!!deletingGoalId}
          onClose={() => {
            setDeletingGoalId(null);
            handleModalClose();
          }}
        />
      )}
    </>
  );
}
