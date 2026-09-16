'use client';

import { useMemo } from 'react';
import { Plus, Pencil, Trash2, Tags, Sparkles } from 'lucide-react';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type {
  VariableExpenseDefinition,
  VariableExpenseMonthStat,
  VariableExpensesOverviewBucket,
} from '@/types/variable-expense';
import { EXPENSE_DELTA_COLORS, formatExpenseDelta, getExpenseDeltaTone } from './delta';
import {
  getVariableExpenseColor,
  VARIABLE_EXPENSE_CURRENCIES,
  VARIABLE_EXPENSE_ICONS,
} from './constants';

interface VariableExpenseDefinitionListProps {
  definitions: VariableExpenseDefinition[];
  /** Per-currency overview buckets used to resolve each definition's monthly stats. */
  buckets: VariableExpensesOverviewBucket[];
  /** Resolved error message (i18n) when the server fetch failed, else null. */
  error: string | null;
  dictionary: Record<string, unknown>;
  locale: string;
  onRegister: (definition: VariableExpenseDefinition) => void;
  onOpenDetail: (definition: VariableExpenseDefinition) => void;
  onEdit: (definition: VariableExpenseDefinition) => void;
  onDelete: (definition: VariableExpenseDefinition) => void;
}

/** Expected-vs-actual summary lines for one definition. */
function buildExpectedActual(
  definition: VariableExpenseDefinition,
  stat: VariableExpenseMonthStat | undefined,
  dictionary: Record<string, unknown>,
  locale: string
): { expectedLine: string; actualLine: string } {
  const count = stat?.count ?? 0;
  const totalCents = stat?.totalCents ?? 0;
  const ofLabel = get(dictionary, 'of');
  const timesLabel = get(dictionary, 'times');
  const perUnitLabel = get(dictionary, 'perUnit');

  const expectedTimes =
    definition.expectedTimesPerMonth == null
      ? '—'
      : `${definition.expectedTimesPerMonth} ${timesLabel}`;
  const expectedAmount =
    definition.expectedAmountCents == null
      ? null
      : formatMoney(definition.expectedAmountCents, definition.currency, locale);

  const actualTimes =
    definition.expectedTimesPerMonth == null
      ? `${count} ${timesLabel}`
      : `${count} ${ofLabel} ${definition.expectedTimesPerMonth} ${timesLabel}`;

  // The monthly target (expectedTotalCents) is what the real total compares
  // against. When the backend lacks one of the targets we fall back to showing
  // the per-unit expected amount so the number is never ambiguous.
  const expectedTotal = stat?.expectedTotalCents ?? null;
  let actualAmount: string;
  if (expectedTotal != null) {
    actualAmount = `${formatMoney(totalCents, definition.currency, locale)} ${ofLabel} ${formatMoney(
      expectedTotal,
      definition.currency,
      locale
    )}`;
  } else if (expectedAmount != null) {
    actualAmount = `${formatMoney(totalCents, definition.currency, locale)} (${expectedAmount} ${perUnitLabel})`;
  } else {
    actualAmount = formatMoney(totalCents, definition.currency, locale);
  }

  const expectedLine =
    expectedAmount == null ? expectedTimes : `${expectedTimes} · ${expectedAmount} ${perUnitLabel}`;

  return {
    expectedLine,
    actualLine: `${actualTimes} · ${actualAmount}`,
  };
}

interface DefinitionCardProps {
  definition: VariableExpenseDefinition;
  stat: VariableExpenseMonthStat | undefined;
  dictionary: Record<string, unknown>;
  locale: string;
  onRegister: (definition: VariableExpenseDefinition) => void;
  onOpenDetail: (definition: VariableExpenseDefinition) => void;
  onEdit: (definition: VariableExpenseDefinition) => void;
  onDelete: (definition: VariableExpenseDefinition) => void;
}

function DefinitionCard({
  definition,
  stat,
  dictionary,
  locale,
  onRegister,
  onOpenDetail,
  onEdit,
  onDelete,
}: Readonly<DefinitionCardProps>) {
  const iconOption = VARIABLE_EXPENSE_ICONS.find((entry) => entry.name === definition.icon);
  const color = getVariableExpenseColor(definition.color);
  const { expectedLine, actualLine } = buildExpectedActual(definition, stat, dictionary, locale);
  const deltaPct = stat?.deltaAmountPct ?? null;
  const deltaTone = getExpenseDeltaTone(deltaPct);

  return (
    <li className="rounded-2xl bg-white/[0.03] border border-white/5 p-4">
      <div className="flex items-start gap-3">
        <div
          className="p-2 rounded-xl shrink-0"
          style={{ backgroundColor: `${color}26`, color }}
          aria-hidden="true"
        >
          {iconOption ? <iconOption.Icon className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>

        <button
          type="button"
          onClick={() => onOpenDetail(definition)}
          className="flex-1 min-w-0 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/70"
          aria-label={`${get(dictionary, 'detail')}: ${definition.name}`}
        >
          <p className="text-sm font-semibold text-white truncate">{definition.name}</p>
          {definition.description && (
            <p className="text-xs text-slate-400 truncate">{definition.description}</p>
          )}
          {definition.category && (
            <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-slate-400">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: definition.category.color ?? '#64748B' }}
                aria-hidden="true"
              />
              {definition.category.name}
            </span>
          )}

          <div className="mt-2 space-y-0.5">
            <p className="text-[11px] text-slate-500">
              <span className="uppercase tracking-wider">{get(dictionary, 'expected')}: </span>
              <span className="text-slate-300 tabular-nums">{expectedLine}</span>
            </p>
            <p className="text-[11px] text-slate-500">
              <span className="uppercase tracking-wider">{get(dictionary, 'actual')}: </span>
              <span className="text-white tabular-nums">{actualLine}</span>
              {deltaPct !== null && (
                <span className={`ml-2 font-semibold ${EXPENSE_DELTA_COLORS[deltaTone]}`}>
                  {formatExpenseDelta(deltaPct)} {get(dictionary, 'vsLastMonth')}
                </span>
              )}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onRegister(definition)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
            {get(dictionary, 'register')}
          </button>
          <button
            type="button"
            onClick={() => onEdit(definition)}
            aria-label={`${get(dictionary, 'editDefinition')}: ${definition.name}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/8 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(definition)}
            aria-label={`${get(dictionary, 'deleteDefinition')}: ${definition.name}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * Per-currency list of monitored definitions. Every definition is rendered,
 * including those with zero occurrences this month, with its expected vs actual
 * summary and month-over-month variation.
 */
export function VariableExpenseDefinitionList({
  definitions,
  buckets,
  error,
  dictionary,
  locale,
  onRegister,
  onOpenDetail,
  onEdit,
  onDelete,
}: Readonly<VariableExpenseDefinitionListProps>) {
  const statsById = useMemo(() => {
    const map = new Map<string, VariableExpenseMonthStat>();
    for (const bucket of buckets) {
      for (const stat of bucket.stats) {
        map.set(stat.variableExpenseId, stat);
      }
    }
    return map;
  }, [buckets]);

  if (error) {
    return (
      <div role="alert" className="app-shell rounded-2xl p-5 text-sm text-red-400">
        {error}
      </div>
    );
  }

  if (definitions.length === 0) {
    return (
      <div className="app-shell rounded-2xl py-16 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-2xl bg-teal-500/10 text-teal-400">
          <Tags className="w-8 h-8" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-1">
            {get(dictionary, 'noDefinitions')}
          </p>
          <p className="text-xs text-slate-400 max-w-sm">{get(dictionary, 'noDefinitionsDesc')}</p>
        </div>
      </div>
    );
  }

  const groups = VARIABLE_EXPENSE_CURRENCIES.map((currency) => ({
    currency,
    items: definitions.filter((definition) => definition.currency === currency),
  })).filter((group) => group.items.length > 0);

  return (
    <section
      className="app-shell rounded-2xl p-5 space-y-5"
      aria-label={get(dictionary, 'definitions')}
    >
      <div className="flex items-center gap-2">
        <Tags className="w-4 h-4 text-teal-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
          {get(dictionary, 'definitions')}
        </h2>
        <span className="text-xs text-slate-500 tabular-nums">({definitions.length})</span>
      </div>

      {groups.map((group) => (
        <div key={group.currency} className="space-y-3">
          <h3 className="text-xs font-semibold text-teal-300 uppercase tracking-wider">
            {group.currency}
          </h3>
          <ul className="space-y-3">
            {group.items.map((definition) => (
              <DefinitionCard
                key={definition.id}
                definition={definition}
                stat={statsById.get(definition.id)}
                dictionary={dictionary}
                locale={locale}
                onRegister={onRegister}
                onOpenDetail={onOpenDetail}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
