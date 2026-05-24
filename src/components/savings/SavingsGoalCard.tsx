'use client';

import { useMemo, useCallback } from 'react';
import { Plus, Pencil, Trash2, Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type { SavingsGoal, SavingsContribution } from '@prisma/client';

interface GoalWithProgress extends SavingsGoal {
  progressPercentage: number;
  projectedCompletion: string | null;
  contributions: SavingsContribution[];
  linkedAccount?: { id: string; name: string; currency: string } | null;
}

interface SavingsGoalCardProps {
  goal: GoalWithProgress;
  dictionary: Record<string, unknown>;
  locale: string;
  onContribute: (goalId: string) => void;
  onEdit: (goal: GoalWithProgress) => void;
  onDelete: (goalId: string, goalName: string, hasContributions: boolean) => void;
}

const TYPE_COLORS: Record<string, string> = {
  ANNUAL: 'from-blue-500 to-cyan-500',
  SHORT_TERM: 'from-amber-500 to-orange-500',
  EMERGENCY: 'from-red-500 to-rose-500',
  CUSTOM: 'from-violet-500 to-purple-500',
};

const DEFAULT_GRADIENT = 'from-violet-500 to-purple-500';

export function SavingsGoalCard({
  goal,
  dictionary,
  locale,
  onContribute,
  onEdit,
  onDelete,
}: Readonly<SavingsGoalCardProps>) {
  const isCompleted = goal.status === 'COMPLETED';
  const progress = Math.min(goal.progressPercentage, 100);

  const isHexColor = goal.color?.startsWith('#') ?? false;
  const gradient = isHexColor ? '' : (goal.color || TYPE_COLORS[goal.type] || DEFAULT_GRADIENT);
  const solidStyle = isHexColor ? { background: goal.color } : undefined;

  const remainingCents = useMemo(
    () => Math.max(0, goal.targetAmountCents - goal.currentAmountCents),
    [goal.currentAmountCents, goal.targetAmountCents]
  );

  const deadlineText = useMemo(() => {
    if (!goal.deadline) return get(dictionary, 'noDeadline');
    const now = new Date();
    const deadline = new Date(goal.deadline);
    const diffTime = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return `${get(dictionary, 'overduePrefix')} ${Math.abs(diffDays)} ${get(dictionary, 'overdueDays')}`;
    if (diffDays === 0) return get(dictionary, 'deadlineToday');
    if (diffDays === 1) return get(dictionary, 'deadlineTomorrow');
    if (diffDays <= 30) return `${diffDays} ${get(dictionary, 'daysLeft')}`;
    const diffMonths = Math.ceil(diffDays / 30);
    return `${diffMonths} ${get(dictionary, 'monthsLeft')}`;
  }, [goal.deadline, dictionary]);

  const typeLabel = useMemo(() => {
    const key = `types.${goal.type}`;
    return get(dictionary, key);
  }, [goal.type, dictionary]);

  const recentContributions = useMemo(
    () => goal.contributions.slice(0, 3),
    [goal.contributions]
  );

  const handleContribute = useCallback(() => {
    onContribute(goal.id);
  }, [goal.id, onContribute]);

  const handleEdit = useCallback(() => {
    onEdit(goal);
  }, [goal, onEdit]);

  const handleDelete = useCallback(() => {
    onDelete(goal.id, goal.name, goal.contributions.length > 0);
  }, [goal.id, goal.name, goal.contributions.length, onDelete]);

  return (
    <article
      className="app-shell rounded-2xl overflow-hidden group transition-all duration-200 hover:ring-1 hover:ring-white/10"
      aria-label={`${goal.name} - ${typeLabel}`}
    >
      {/* Colored header bar */}
      <div
        className={`h-1.5 ${isHexColor ? '' : `bg-gradient-to-r ${gradient}`}`}
        style={solidStyle}
      />

      <div className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white truncate">{goal.name}</h3>
              {isCompleted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold uppercase tracking-wider">
                  <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                  {get(dictionary, 'completed')}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {typeLabel}
              {goal.linkedAccount && (
                <span className="ml-2 text-slate-500">· {goal.linkedAccount.name}</span>
              )}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleContribute}
              disabled={isCompleted}
              aria-label={`${get(dictionary, 'contribute')} - ${goal.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-30 transition-colors"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleEdit}
              aria-label={`${get(dictionary, 'updateGoal')} - ${goal.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-violet-500/10 transition-colors"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              aria-label={`${get(dictionary, 'deleteGoal')} - ${goal.name}`}
              className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-400">{get(dictionary, 'progress')}</span>
            <span className="text-xs font-semibold text-white tabular-nums">
              {progress.toFixed(1)}%
            </span>
          </div>
          <div className="h-2.5 bg-white/5 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.name}: ${progress.toFixed(1)}%`}>
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${isHexColor ? '' : `bg-gradient-to-r ${gradient}`}`}
              style={{ width: `${progress}%`, ...solidStyle }}
            />
          </div>
        </div>

        {/* Amounts */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {get(dictionary, 'saved')}
            </p>
            <p className="text-sm font-bold text-white tabular-nums">
              {formatMoney(goal.currentAmountCents, goal.currency, locale)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              {get(dictionary, 'target')}
            </p>
            <p className="text-sm font-bold text-white tabular-nums">
              {formatMoney(goal.targetAmountCents, goal.currency, locale)}
            </p>
          </div>
        </div>

        {/* Timeline info */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
          {goal.deadline && (
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3" aria-hidden="true" />
              <span>{deadlineText}</span>
            </div>
          )}
          {goal.projectedCompletion && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" aria-hidden="true" />
              <span>
                {get(dictionary, 'projectedCompletion')}: {goal.projectedCompletion}
              </span>
            </div>
          )}
          {!goal.monthlyContributionCents && !goal.projectedCompletion && (
            <span className="text-slate-500">{get(dictionary, 'noProjection')}</span>
          )}
        </div>

        {/* Recent contributions */}
        {!isCompleted && recentContributions.length > 0 && (
          <div className="pt-2 border-t border-white/5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              {get(dictionary, 'recentContributions')}
            </p>
            <div className="space-y-1">
              {recentContributions.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">
                    {new Date(c.date).toLocaleDateString(locale === 'es-CO' ? 'es-CO' : 'en-US', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span className="font-medium text-emerald-400 tabular-nums">
                    +{formatMoney(c.amountCents, c.currency, locale)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Remaining */}
        {!isCompleted && remainingCents > 0 && (
          <div className="pt-2 border-t border-white/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">{get(dictionary, 'remaining')}</span>
              <span className="font-medium text-amber-400 tabular-nums">
                {formatMoney(remainingCents, goal.currency, locale)}
              </span>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
