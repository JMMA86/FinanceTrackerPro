'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Currency } from '@prisma/client';
import { TrendingUp } from 'lucide-react';
import { get } from '@/lib/i18n';
import { centsToDecimal, formatMoney } from '@/lib/money';
import {
  getVariableExpenseDetail,
  getVariableExpenseMovements,
} from '@/actions/variable-expense.actions';
import type {
  VariableExpenseDefinition,
  VariableExpenseDetailResponse,
  VariableExpenseMovementsResponse,
  VariableExpenseTransactionSerialized,
} from '@/types/variable-expense';
import { VariableExpenseDialog } from './VariableExpenseDialog';
import { getVariableExpenseColor } from './constants';

interface VariableExpenseDetailProps {
  isOpen: boolean;
  definition: VariableExpenseDefinition;
  definitions: VariableExpenseDefinition[];
  month: number;
  year: number;
  dictionary: Record<string, unknown>;
  locale: string;
  onClose: () => void;
}

/**
 * Loaded data is a discriminated union because `trend` only exists for a single
 * definition (getVariableExpenseDetail), never for the "all definitions" filter
 * (getVariableExpenseMovements).
 */
type DetailState =
  | { kind: 'definition'; data: VariableExpenseDetailResponse }
  | { kind: 'all'; data: VariableExpenseMovementsResponse };

interface MonthOption {
  value: string;
  label: string;
}

interface DetailFiltersProps {
  dictionary: Record<string, unknown>;
  definitions: VariableExpenseDefinition[];
  selectedDefinitionId: string;
  onDefinitionChange: (id: string) => void;
  period: string;
  onPeriodChange: (period: string) => void;
  monthOptions: MonthOption[];
}

interface DetailTotalsProps {
  dictionary: Record<string, unknown>;
  state: DetailState;
  displayCurrency: Currency;
  accent: string;
  locale: string;
}

interface DetailTrendProps {
  dictionary: Record<string, unknown>;
  detail: VariableExpenseDetailResponse;
  locale: string;
}

interface TransactionListProps {
  dictionary: Record<string, unknown>;
  scope: 'month' | 'all';
  transactions: VariableExpenseTransactionSerialized[];
  locale: string;
}

const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 170;
const PAD_TOP = 28;
const PAD_BOTTOM = 30;
const PAD_X = 10;
const INNER_WIDTH = VIEW_WIDTH - PAD_X * 2;
const INNER_HEIGHT = VIEW_HEIGHT - PAD_TOP - PAD_BOTTOM;

const SELECT_CLS =
  'bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-transparent transition-all appearance-none';

function monthShortLabel(month: number, year: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(year, month - 1, 1));
}

function TrendBars({ detail, dictionary, locale }: Readonly<DetailTrendProps>) {
  const points = detail.trend;
  const maxCents = Math.max(...points.map((point) => point.totalCents), 1);
  const slotWidth = points.length > 0 ? INNER_WIDTH / points.length : INNER_WIDTH;
  const barWidth = slotWidth * 0.5;
  const compact = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  return (
    <div className="space-y-2">
      {/* Decorative: the sr-only table below carries the accessible data. */}
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        className="w-full h-auto"
      >
        <line
          x1={PAD_X}
          y1={PAD_TOP + INNER_HEIGHT}
          x2={VIEW_WIDTH - PAD_X}
          y2={PAD_TOP + INNER_HEIGHT}
          stroke="rgba(148, 163, 184, 0.2)"
          strokeWidth="1"
        />
        {points.map((point, index) => {
          const barHeight = (point.totalCents / maxCents) * INNER_HEIGHT;
          const x = PAD_X + index * slotWidth + (slotWidth - barWidth) / 2;
          const y = PAD_TOP + INNER_HEIGHT - barHeight;
          const label = monthShortLabel(point.month, point.year, locale);
          return (
            <g key={`${point.year}-${point.month}`}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barHeight, point.totalCents > 0 ? 2 : 0)}
                rx="4"
                fill="rgba(45, 212, 191, 0.75)"
              />
              <text
                x={x + barWidth / 2}
                y={Math.max(y - 6, 12)}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="12"
              >
                {compact.format(centsToDecimal(point.totalCents).toNumber())}
              </text>
              <text
                x={x + barWidth / 2}
                y={VIEW_HEIGHT - 10}
                textAnchor="middle"
                fill="#64748b"
                fontSize="12"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>
          {get(dictionary, 'trend')} {detail.definition.name}
        </caption>
        <thead>
          <tr>
            <th scope="col">{get(dictionary, 'date')}</th>
            <th scope="col">{get(dictionary, 'amount')}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={`row-${point.year}-${point.month}`}>
              <th scope="row">
                {monthShortLabel(point.month, point.year, locale)} {point.year}
              </th>
              <td>{formatMoney(point.totalCents, detail.definition.currency, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Loads the detail for one definition (with trend) or the aggregated movements. */
async function loadDetail(variableExpenseId: string, period: string): Promise<DetailState | null> {
  const [periodYear, periodMonth] = period.split('-').map(Number);
  const monthFilters = period === 'all' ? undefined : { month: periodMonth, year: periodYear };

  if (variableExpenseId) {
    const response = monthFilters
      ? await getVariableExpenseDetail({ variableExpenseId, ...monthFilters })
      : await getVariableExpenseDetail({ variableExpenseId });
    if (!response.success || !response.data) return null;
    return { kind: 'definition', data: response.data };
  }

  const response = monthFilters
    ? await getVariableExpenseMovements(monthFilters)
    : await getVariableExpenseMovements({});
  if (!response.success || !response.data) return null;
  return { kind: 'all', data: response.data };
}

/**
 * The "all definitions" endpoint has no currency; use it only when every
 * movement shares one, otherwise fall back to the opened definition currency.
 */
function resolveDisplayCurrency(state: DetailState | null, fallback: Currency): Currency {
  if (state?.kind === 'definition') return state.data.definition.currency;
  if (state?.kind === 'all') {
    const currencies = new Set(state.data.transactions.map((transaction) => transaction.currency));
    if (currencies.size === 1) return [...currencies][0];
  }
  return fallback;
}

function DetailFilters({
  dictionary,
  definitions,
  selectedDefinitionId,
  onDefinitionChange,
  period,
  onPeriodChange,
  monthOptions,
}: Readonly<DetailFiltersProps>) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        {get(dictionary, 'filterByDefinition')}
        <select
          aria-label={get(dictionary, 'filterByDefinition')}
          value={selectedDefinitionId}
          onChange={(event) => onDefinitionChange(event.target.value)}
          className={SELECT_CLS}
        >
          <option value="" className="bg-slate-800">
            {get(dictionary, 'allDefinitions')}
          </option>
          {definitions.map((item) => (
            <option key={item.id} value={item.id} className="bg-slate-800">
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-500">
        {get(dictionary, 'filterMovements')}
        <select
          aria-label={get(dictionary, 'filterMovements')}
          value={period}
          onChange={(event) => onPeriodChange(event.target.value)}
          className={SELECT_CLS}
        >
          <option value="all" className="bg-slate-800">
            {get(dictionary, 'allMovements')}
          </option>
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value} className="bg-slate-800">
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DetailTotals({
  dictionary,
  state,
  displayCurrency,
  accent,
  locale,
}: Readonly<DetailTotalsProps>) {
  const totalLabel =
    state.data.scope === 'all' ? get(dictionary, 'totalHistory') : get(dictionary, 'total');
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl bg-white/5 p-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{totalLabel}</p>
        <p className="text-sm font-semibold tabular-nums" style={{ color: accent }}>
          {formatMoney(state.data.totalCents, displayCurrency, locale)}
        </p>
      </div>
      <div className="rounded-xl bg-white/5 p-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          {get(dictionary, 'count')}
        </p>
        <p className="text-sm font-semibold text-white tabular-nums">{state.data.count}</p>
      </div>
      <div className="rounded-xl bg-white/5 p-3">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          {get(dictionary, 'average')}
        </p>
        <p className="text-sm font-semibold text-white tabular-nums">
          {formatMoney(state.data.averageCents, displayCurrency, locale)}
        </p>
      </div>
    </div>
  );
}

function DetailTrend({ dictionary, detail, locale }: Readonly<DetailTrendProps>) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="w-4 h-4 text-teal-400" aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {get(dictionary, 'trend')}
        </h3>
        <span className="text-[10px] text-slate-500">{get(dictionary, 'lastMonths')}</span>
      </div>
      {detail.trend.every((point) => point.totalCents === 0) ? (
        <p className="text-xs text-slate-500">{get(dictionary, 'noData')}</p>
      ) : (
        <TrendBars detail={detail} dictionary={dictionary} locale={locale} />
      )}
    </div>
  );
}

function TransactionList({
  dictionary,
  scope,
  transactions,
  locale,
}: Readonly<TransactionListProps>) {
  const title =
    scope === 'all' ? get(dictionary, 'allMovements') : get(dictionary, 'monthMovements');
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        {title}
      </h3>
      {transactions.length === 0 ? (
        <p className="text-xs text-slate-500">{get(dictionary, 'noData')}</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto space-y-2 pr-1">
          {transactions.map((transaction) => (
            <li
              key={transaction.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-xs text-white truncate">{transaction.description ?? '—'}</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {new Date(transaction.date).toLocaleDateString(locale, {
                    day: 'numeric',
                    month: 'short',
                  })}
                  {transaction.category ? ` · ${transaction.category.name}` : ''}
                </p>
              </div>
              <span className="text-xs font-semibold text-rose-300 tabular-nums shrink-0">
                {'\u2212 '}
                {formatMoney(transaction.amountCents, transaction.currency, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Definition detail modal: totals, 6-month trend (only for a single definition)
 * and the movements registered, filterable by definition and month.
 */
export function VariableExpenseDetail({
  isOpen,
  definition,
  definitions,
  month,
  year,
  dictionary,
  locale,
  onClose,
}: Readonly<VariableExpenseDetailProps>) {
  const [selectedDefinitionId, setSelectedDefinitionId] = useState<string>(definition.id);
  const [period, setPeriod] = useState<string>(`${year}-${month}`);
  const [state, setState] = useState<DetailState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const monthOptions = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
    const options: MonthOption[] = [];
    const base = new Date();
    for (let offset = 0; offset < 12; offset += 1) {
      const date = new Date(base.getFullYear(), base.getMonth() - offset, 1);
      options.push({
        value: `${date.getFullYear()}-${date.getMonth() + 1}`,
        label: formatter.format(date),
      });
    }
    const current = `${year}-${month}`;
    if (!options.some((option) => option.value === current)) {
      options.push({ value: current, label: formatter.format(new Date(year, month - 1, 1)) });
    }
    return options;
  }, [locale, month, year]);

  // The definition filter defaults back to the definition the modal was opened
  // from (e.g. after switching to "All" and reopening another definition).
  useEffect(() => {
    queueMicrotask(() => setSelectedDefinitionId(definition.id));
  }, [definition.id]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const timer = setTimeout(() => {
      setIsLoading(true);
      setLoadError(null);
      setState(null);
      void (async () => {
        try {
          const nextState = await loadDetail(selectedDefinitionId, period);
          if (!active) return;
          if (nextState) {
            setState(nextState);
          } else {
            setLoadError(get(dictionary, 'errors.loadFailed'));
          }
        } catch {
          if (active) setLoadError(get(dictionary, 'errors.loadFailed'));
        } finally {
          if (active) setIsLoading(false);
        }
      })();
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, selectedDefinitionId, period, dictionary]);

  const selectedDefinition = definitions.find((item) => item.id === selectedDefinitionId) ?? null;
  const isAllDefinitions = selectedDefinitionId === '';
  const activeDefinition = selectedDefinition ?? definition;
  const accent = useMemo(
    () => getVariableExpenseColor(activeDefinition.color),
    [activeDefinition.color]
  );
  const displayCurrency = resolveDisplayCurrency(state, definition.currency);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <output aria-live="polite" className="block py-8 text-center text-sm text-slate-400">
        {get(dictionary, 'loading')}
      </output>
    );
  } else if (loadError) {
    body = (
      <p role="alert" className="py-8 text-center text-sm text-red-400">
        {loadError}
      </p>
    );
  } else if (state) {
    body = (
      <div className="space-y-5">
        <DetailTotals
          dictionary={dictionary}
          state={state}
          displayCurrency={displayCurrency}
          accent={accent}
          locale={locale}
        />
        {state.kind === 'definition' && (
          <DetailTrend dictionary={dictionary} detail={state.data} locale={locale} />
        )}
        <TransactionList
          dictionary={dictionary}
          scope={state.data.scope}
          transactions={state.data.transactions}
          locale={locale}
        />
      </div>
    );
  } else {
    body = <p className="py-8 text-center text-sm text-slate-400">{get(dictionary, 'noData')}</p>;
  }

  return (
    <VariableExpenseDialog
      open={isOpen}
      titleId="variable-expense-detail-title"
      title={
        <>
          {get(dictionary, 'detail')}
          <span className="text-slate-400 ml-1">
            — {isAllDefinitions ? get(dictionary, 'allDefinitions') : activeDefinition.name}
          </span>
        </>
      }
      dictionary={dictionary}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <DetailFilters
          dictionary={dictionary}
          definitions={definitions}
          selectedDefinitionId={selectedDefinitionId}
          onDefinitionChange={setSelectedDefinitionId}
          period={period}
          onPeriodChange={setPeriod}
          monthOptions={monthOptions}
        />
        {body}
      </div>
    </VariableExpenseDialog>
  );
}
