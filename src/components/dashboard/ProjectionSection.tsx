'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Clock,
  PiggyBank,
  Settings,
  Settings2,
  Target,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Currency } from '@prisma/client';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';
import type {
  DashboardProjection,
  ProjectionBreakdownLine,
  ProjectionPeriod,
  ProjectionSalaryStatus,
  UnconvertedCurrencyBucket,
} from '@/types/dashboard';

type Translator = (key: string) => string;

const DAY_MS = 86_400_000;

interface ProjectionSectionProps {
  readonly projection: DashboardProjection;
  readonly lang: Locale;
  readonly dictionary: Record<string, unknown>;
  readonly locale: string;
}

// ============================================================================
// Localization helpers (the backend `detail` is Spanish-only prose and is used
// ONLY as a fallback when a dictionary key is missing)
// ============================================================================

/** `{placeholder}` interpolation, mirroring the onboarding i18n helper. */
function interpolate(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}

/** Reads a dictionary key, falling back when the key has no entry. */
function translateOr(t: Translator, key: string, fallback: string): string {
  const value = t(key);
  return value === key ? fallback : value;
}

function resolveSourceLabel(line: ProjectionBreakdownLine, t: Translator): string {
  return translateOr(t, `projection.sources.${line.source}`, line.detail);
}

function resolveCountLabel(line: ProjectionBreakdownLine, t: Translator): string {
  if (line.count <= 0) return '';
  const template = translateOr(t, `projection.counts.${line.source}`, t('projection.countLabel'));
  if (!template.includes('{count}')) return '';
  return interpolate(template, { count: line.count });
}

function formatRate(rate: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }).format(rate);
}

/**
 * Rule 9 — FX traceability. Returns the original amount + applied rate for a
 * foreign-currency line, the explicit "no rate" note when it could not be
 * converted, or null for COP lines.
 */
function resolveFxNote(
  line: ProjectionBreakdownLine,
  t: Translator,
  locale: string
): string | null {
  if (line.sourceCurrency === 'COP') return null;
  if (line.exchangeRate === null) {
    return interpolate(t('projection.fxUnavailable'), { currency: line.sourceCurrency });
  }
  return interpolate(t('projection.fxLine'), {
    original: formatMoney(line.originalAmountCents, line.sourceCurrency, locale),
    rate: formatRate(line.exchangeRate, locale),
  });
}

function formatDateRange(start: Date, end: Date, locale: string): string {
  const startLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(
    new Date(start)
  );
  const endLabel = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(end));
  return `${startLabel} – ${endLabel}`;
}

/** Full localized date for a single salary occurrence (e.g. "15 sept 2026"). */
function formatFullDate(value: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

// ============================================================================
// Salary status (received vs. pending) — presentation only
// ============================================================================

/**
 * Icon + label + tone per salary status. The status is NEVER conveyed by color
 * alone: every state ships an explicit icon AND text label.
 */
const SALARY_STATUS_META: Readonly<
  Record<ProjectionSalaryStatus, { icon: LucideIcon; labelKey: string; className: string }>
> = {
  RECEIVED: {
    icon: CheckCircle2,
    labelKey: 'projection.salary.statusReceived',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  },
  PARTIAL: {
    icon: AlertTriangle,
    labelKey: 'projection.salary.statusPartial',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  },
  PENDING: {
    icon: Clock,
    labelKey: 'projection.salary.statusPending',
    className: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
  },
  NO_PENDING: {
    icon: CheckCircle2,
    labelKey: 'projection.salary.statusNoPending',
    className: 'border-white/10 bg-white/[0.03] text-slate-300',
  },
  NOT_CONFIGURED: {
    icon: Settings,
    labelKey: 'projection.salary.statusNotConfigured',
    className: 'border-white/10 bg-white/[0.03] text-slate-300',
  },
};

interface SalaryStatusBlockProps {
  readonly period: ProjectionPeriod;
  readonly locale: string;
  readonly settingsHref: string;
  readonly t: Translator;
}

/**
 * Salary state of one projection window, shown OUTSIDE the breakdown disclosure:
 * its OWN disclosure whose header keeps the status badge (icon + text) and the
 * tone always visible, and whose body holds the COP received/pending totals, the
 * next payment and every expected occurrence with its own received/pending
 * marker. Collapsed by default: this is an independent disclosure controlled by
 * its own `aria-expanded`/`aria-controls`, so the body stays hidden until the
 * user opens it.
 */
function SalaryStatusBlock({ period, locale, settingsHref, t }: Readonly<SalaryStatusBlockProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const status = period.salaryStatus;
  const meta = SALARY_STATUS_META[status];
  const StatusIcon = meta.icon;
  const occurrences = period.salaryOccurrences ?? [];
  const nextAmount = period.nextSalaryAmountCents;
  // `period.period` is `'month' | 'year'`, so it is unique among the two cards.
  const panelId = `projection-salary-${period.period}`;

  return (
    <section
      aria-label={t('projection.salary.title')}
      className={`mt-4 rounded-xl border px-3 py-2.5 ${meta.className}`}
    >
      {status === 'NOT_CONFIGURED' ? (
        /* Nothing to disclose when the salary is not configured: no toggle. */
        <>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
            <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t(meta.labelKey)}
          </p>
          <Link
            href={settingsHref}
            className="mt-2 inline-flex items-center gap-1.5 rounded text-xs font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t('projection.salary.configureCta')}
          </Link>
        </>
      ) : (
        <>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            aria-label={
              isOpen ? t('projection.salary.hideDetails') : t('projection.salary.showDetails')
            }
            onClick={() => setIsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
              <StatusIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t(meta.labelKey)}
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
                isOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          <div id={panelId} className={isOpen ? 'mt-2 space-y-2' : 'hidden'}>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-1.5">
                <dt className="text-[11px] text-slate-300">{t('projection.salary.received')}</dt>
                <dd className="text-xs font-semibold tabular-nums text-white">
                  {formatMoney(period.salaryReceivedCents, 'COP', locale)}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-1.5">
                <dt className="text-[11px] text-slate-300">{t('projection.salary.pending')}</dt>
                <dd className="text-xs font-semibold tabular-nums text-white">
                  {formatMoney(period.salaryPendingCents, 'COP', locale)}
                </dd>
              </div>
            </dl>

            {period.nextSalaryDate && (
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-200">
                <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="font-semibold">{t('projection.salary.nextPayment')}:</span>
                <span>{formatFullDate(period.nextSalaryDate, locale)}</span>
                {nextAmount !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold tabular-nums">
                      {formatMoney(nextAmount, 'COP', locale)}
                    </span>
                  </>
                )}
              </p>
            )}

            {occurrences.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider opacity-80">
                  {t('projection.salary.occurrencesTitle')}
                </p>
                <ul className="space-y-1">
                  {occurrences.map((occurrence, index) => (
                    <li
                      key={`${new Date(occurrence.date).toISOString()}-${index}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-black/20 px-2.5 py-1.5"
                    >
                      <span className="text-xs text-slate-200">
                        {formatFullDate(occurrence.date, locale)}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold tabular-nums text-white">
                          {formatMoney(occurrence.amountCents, occurrence.currency, locale)}
                        </span>
                        <span className="flex items-center gap-1 text-[11px] font-medium">
                          {occurrence.received ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          )}
                          {occurrence.received
                            ? t('projection.salary.occurrenceReceived')
                            : t('projection.salary.occurrencePending')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/** Elapsed days vs. total days of the projection window. */
function computeDayProgress(period: ProjectionPeriod): {
  current: number;
  total: number;
  percent: number;
} {
  const start = new Date(period.periodStart).getTime();
  const end = new Date(period.periodEnd).getTime();
  const asOf = new Date(period.asOf).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return { current: 0, total: 0, percent: 0 };
  }
  const total = Math.max(1, Math.floor((end - start) / DAY_MS) + 1);
  const elapsed = Number.isFinite(asOf) ? Math.floor((asOf - start) / DAY_MS) + 1 : 1;
  const current = Math.min(total, Math.max(0, elapsed));
  const percent = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
  return { current, total, percent };
}

// ============================================================================
// Direction classification (inflows vs. outflows)
// ============================================================================

/**
 * Sources that ADD money to the projected close:
 * - `CURRENT_CASH`         liquid cash available today,
 * - `SALARY_SCHEDULE`      salary occurrences still ahead,
 * - `BONUS_SCHEDULE`       bonus occurrences still ahead,
 * - `LOAN_RECEIVABLE_PRINCIPAL`  principal the user will COLLECT from loans lent out,
 * - `LOAN_RECEIVABLE_INTEREST`   interest the user will COLLECT from loans lent out,
 * - `INVESTMENT_VALUE`           market value of the investment accounts (converted to COP).
 */
const INFLOW_SOURCES: ReadonlySet<string> = new Set([
  'CURRENT_CASH',
  'SALARY_SCHEDULE',
  'BONUS_SCHEDULE',
  'LOAN_RECEIVABLE_PRINCIPAL',
  'LOAN_RECEIVABLE_INTEREST',
  'INVESTMENT_VALUE',
]);

/**
 * Sources that SUBTRACT money from the projected close:
 * - `FIXED_EXPENSES_PENDING`       unpaid fixed-expense payments,
 * - `LOAN_PRINCIPAL_REMAINING`     installments the user must PAY (principal),
 * - `LOAN_INTEREST_REMAINING`      installments the user must PAY (interest),
 * - `VARIABLE_ESTIMATE`            prorated variable spend,
 * - `SAVINGS_TARGET`               savings set aside for the period.
 */
const OUTFLOW_SOURCES: ReadonlySet<string> = new Set([
  'FIXED_EXPENSES_PENDING',
  'LOAN_PRINCIPAL_REMAINING',
  'LOAN_INTEREST_REMAINING',
  'VARIABLE_ESTIMATE',
  'SAVINGS_TARGET',
]);

/**
 * Direction of one line. Known sources are classified explicitly; an unknown
 * (future) source falls back to the sign the backend already sent, so the UI
 * never mislabels a component it does not recognize.
 */
function isInflowLine(line: ProjectionBreakdownLine): boolean {
  if (INFLOW_SOURCES.has(line.source)) return true;
  if (OUTFLOW_SOURCES.has(line.source)) return false;
  return line.amountCents >= 0;
}

/**
 * Signed contribution rendered for a line.
 *
 * `CURRENT_CASH` is the ONLY line whose sign is real — it can genuinely be
 * negative (overdrawn accounts) — so it is kept as-is. Every other component
 * arrives as a POSITIVE MAGNITUDE, so the sign is synthesized from its group:
 * `+` for inflows, `−` for outflows.
 */
function signedContributionCents(line: ProjectionBreakdownLine): number {
  if (line.source === 'CURRENT_CASH') return line.amountCents;
  const magnitude = Math.abs(line.amountCents);
  return isInflowLine(line) ? magnitude : -magnitude;
}

type AmountTone = 'inflow' | 'outflow' | 'neutral';

function toneOfSignedCents(cents: number): AmountTone {
  if (cents > 0) return 'inflow';
  if (cents < 0) return 'outflow';
  return 'neutral';
}

/**
 * Direction is NEVER conveyed by color alone: the amount always carries an
 * explicit `+`/`−` sign and the group heading an arrow icon.
 */
const AMOUNT_TONE_CLASS: Readonly<Record<AmountTone, string>> = {
  inflow: 'text-emerald-300',
  outflow: 'text-rose-300',
  neutral: 'text-slate-200',
};

type AmountSign = '+' | '\u2212' | '';

/** Explicit sign of a signed amount: `+`, `−`, or empty when it is exactly zero. */
function signOf(cents: number): AmountSign {
  if (cents > 0) return '+';
  if (cents < 0) return '\u2212';
  return '';
}

/** `+COP 1.234,56` / `−COP 1.234,56` / `COP 0,00`, in COP cents. */
function formatSignedMoney(cents: number, locale: string): string {
  return `${signOf(cents)}${formatMoney(Math.abs(cents), 'COP', locale)}`;
}

// ============================================================================
// Presentational pieces
// ============================================================================

function SectionHeading({ t }: Readonly<{ t: Translator }>) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="rounded-xl bg-blue-500/15 p-2 text-blue-400 ring-1 ring-blue-500/20">
        <CalendarRange className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <h3
          id="projection-title"
          className="text-base font-semibold tracking-tight text-white sm:text-xl"
        >
          {t('projection.title')}
        </h3>
        <p className="text-xs text-slate-400">{t('projection.subtitle')}</p>
      </div>
    </div>
  );
}

interface BreakdownRowProps {
  readonly line: ProjectionBreakdownLine;
  readonly locale: string;
  readonly t: Translator;
}

/** One explainable calculation line (loan principal and interest arrive as separate lines). */
function BreakdownRow({ line, locale, t }: Readonly<BreakdownRowProps>) {
  const fxNote = resolveFxNote(line, t, locale);
  const countLabel = resolveCountLabel(line, t);
  const signedCents = signedContributionCents(line);
  const tone = toneOfSignedCents(signedCents);

  return (
    <li className="rounded-lg bg-white/[0.03] px-3 py-2">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-xs leading-relaxed text-slate-200">
          {resolveSourceLabel(line, t)}
          {countLabel && <span className="text-slate-500"> · {countLabel}</span>}
        </span>
        <span className={`shrink-0 text-xs font-semibold tabular-nums ${AMOUNT_TONE_CLASS[tone]}`}>
          {formatSignedMoney(signedCents, locale)}
        </span>
      </div>
      {fxNote && <p className="mt-1 text-[10px] text-slate-400">{fxNote}</p>}
    </li>
  );
}

interface BreakdownGroupProps {
  /** Unique DOM id prefix (two period cards render at once). */
  readonly id: string;
  readonly title: string;
  readonly tone: 'inflow' | 'outflow';
  readonly lines: readonly ProjectionBreakdownLine[];
  readonly locale: string;
  readonly t: Translator;
}

/**
 * One direction group ("Inflows" / "Outflows") of the breakdown, with the
 * synthesized subtotal of its own lines. Grouping is presentation only — the
 * authoritative period totals keep coming from the backend.
 */
function BreakdownGroup({ id, title, tone, lines, locale, t }: Readonly<BreakdownGroupProps>) {
  const headingId = `${id}-heading`;
  const totalCents = lines.reduce((sum, line) => sum + signedContributionCents(line), 0);
  const totalTone = toneOfSignedCents(totalCents);
  const DirectionIcon = tone === 'inflow' ? ArrowDownLeft : ArrowUpRight;
  const headingClass = tone === 'inflow' ? 'text-emerald-300' : 'text-rose-300';

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <h5
          id={headingId}
          className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${headingClass}`}
        >
          <DirectionIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {title}
        </h5>
        <span className={`text-[11px] font-semibold tabular-nums ${AMOUNT_TONE_CLASS[totalTone]}`}>
          <span className="sr-only">{t('projection.groupSubtotal')} </span>
          {formatSignedMoney(totalCents, locale)}
        </span>
      </div>
      <ul className="space-y-2">
        {lines.map((line) => (
          <BreakdownRow
            key={`${line.key}-${line.sourceCurrency}`}
            line={line}
            locale={locale}
            t={t}
          />
        ))}
      </ul>
    </section>
  );
}

interface PeriodCardProps {
  readonly title: string;
  readonly period: ProjectionPeriod;
  readonly locale: string;
  readonly settingsHref: string;
  readonly t: Translator;
}

/** One projection window ("this month" / "this year"). */
function PeriodCard({ title, period, locale, settingsHref, t }: Readonly<PeriodCardProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const breakdownId = `projection-breakdown-${period.period}`;
  const progress = computeDayProgress(period);
  const progressLabel = interpolate(t('projection.dayProgress'), {
    current: progress.current,
    total: progress.total,
  });

  // Presentation-only split: money that adds to the close vs. money that subtracts.
  const inflowLines = period.breakdown.filter((line) => isInflowLine(line));
  const outflowLines = period.breakdown.filter((line) => !isInflowLine(line));

  const surplusLabel = period.overBudget ? t('projection.deficit') : t('projection.surplus');
  const surplusClass = period.overBudget
    ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';

  return (
    <article className="app-shell rounded-2xl border border-white/[0.08] p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-white">{title}</h4>
          <p className="text-xs text-slate-400">
            {formatDateRange(period.periodStart, period.periodEnd, locale)}
          </p>
        </div>
        <div className="rounded-xl bg-blue-500/10 p-2 text-blue-300">
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
        </div>
      </header>

      {/* Period progress (elapsed days vs. total days) */}
      <div className="mb-4">
        <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>{t('projection.progressLabel')}</span>
          <span className="tabular-nums">{progressLabel}</span>
        </div>
        <progress
          value={progress.percent}
          max={100}
          aria-label={`${t('projection.progressLabel')}: ${progressLabel}`}
          className="block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-white/8 [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-blue-400 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/8 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-blue-400"
        />
      </div>

      <dl className="space-y-3">
        <div className="rounded-xl border border-blue-400/25 bg-blue-500/10 px-3 py-2.5">
          <dt className="text-[11px] uppercase tracking-wider text-blue-200">
            {t('projection.projectedEnd')}
          </dt>
          <dd className="text-2xl font-bold tabular-nums text-white">
            {formatMoney(period.projectedEndCents, 'COP', locale)}
          </dd>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-white/[0.03] px-3 py-2.5">
            <dt className="text-[11px] uppercase tracking-wider text-slate-400">
              {t('projection.remainingToSpend')}
            </dt>
            <dd className="text-sm font-semibold tabular-nums text-slate-100">
              {formatMoney(period.remainingToSpendCents, 'COP', locale)}
            </dd>
          </div>

          <div className={`rounded-xl border px-3 py-2.5 ${surplusClass}`}>
            <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              {period.overBudget ? (
                <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {surplusLabel}
            </dt>
            <dd className="text-sm font-semibold tabular-nums">
              {formatMoney(period.projectedSurplusCents, 'COP', locale)}
            </dd>
          </div>
        </div>
      </dl>

      {/* Salary status — its own disclosure (independent from the breakdown below),
          collapsed by default: the header keeps icon + label always visible while
          the body is toggled through its own aria-expanded/aria-controls */}
      <SalaryStatusBlock period={period} locale={locale} settingsHref={settingsHref} t={t} />

      {/* "How was it calculated?" — accessible disclosure */}
      <div className="mt-4 border-t border-white/8 pt-3">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={breakdownId}
          onClick={() => setIsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1.5 text-left text-sm font-semibold text-blue-300 transition-colors hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          {isOpen ? t('projection.hideCalculation') : t('projection.howCalculated')}
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform duration-300 ${
              isOpen ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        <div id={breakdownId} className={isOpen ? 'mt-2 space-y-3' : 'hidden'}>
          {period.breakdown.length === 0 ? (
            <p className="px-1 py-1 text-xs text-slate-400">{t('projection.noBreakdown')}</p>
          ) : (
            <>
              {inflowLines.length > 0 && (
                <BreakdownGroup
                  id={`${breakdownId}-inflows`}
                  title={t('projection.inflows')}
                  tone="inflow"
                  lines={inflowLines}
                  locale={locale}
                  t={t}
                />
              )}
              {outflowLines.length > 0 && (
                <BreakdownGroup
                  id={`${breakdownId}-outflows`}
                  title={t('projection.outflows')}
                  tone="outflow"
                  lines={outflowLines}
                  locale={locale}
                  t={t}
                />
              )}
            </>
          )}
        </div>
      </div>
    </article>
  );
}

interface UnconvertedNoticeProps {
  readonly buckets: DashboardProjection['unconvertedByCurrency'];
  readonly locale: string;
  readonly t: Translator;
}

/** Warning shown when some amounts could not be converted to COP. */
function UnconvertedNotice({ buckets, locale, t }: Readonly<UnconvertedNoticeProps>) {
  const entries = Object.entries(buckets).filter(
    (entry): entry is [string, UnconvertedCurrencyBucket] => entry[1] !== undefined
  );

  return (
    <output className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{t('projection.unconvertedWarning')}</p>
        {entries.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {entries.map(([currency, bucket]) => (
              <li key={currency}>
                <span className="font-semibold">{currency}</span>:{' '}
                {formatMoney(bucket.amountCents, currency as Currency, locale)} ({bucket.count})
              </li>
            ))}
          </ul>
        )}
      </div>
    </output>
  );
}

/**
 * End-of-period projection (month + year) with an explainable breakdown.
 *
 * All amounts arrive in COP cents from the server (already FX-converted with
 * traceable rates); the UI only formats and localizes them. The breakdown prose
 * is rebuilt from `source`/`count`/`sourceCurrency`/`originalAmountCents`/
 * `exchangeRate` i18n keys — never by rendering the backend's Spanish `detail`.
 */
export function ProjectionSection({
  projection,
  lang,
  dictionary,
  locale,
}: Readonly<ProjectionSectionProps>) {
  const t: Translator = (key: string) => get(dictionary, key);
  const settingsHref = `/${lang}/settings`;

  if (!projection.configured) {
    return (
      <section
        aria-labelledby="projection-title"
        className="animate-in fade-in slide-in-from-top-4 duration-700"
      >
        <SectionHeading t={t} />
        <div className="app-shell rounded-2xl border border-white/[0.08] p-6">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
            <div className="rounded-2xl bg-blue-500/10 p-4 text-blue-300">
              <PiggyBank className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-base font-semibold text-white">{t('projection.emptyTitle')}</h4>
              <p className="text-sm text-slate-400">{t('projection.emptyDescription')}</p>
            </div>
            <Link
              href={settingsHref}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              {t('projection.emptyCta')}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="projection-title"
      className="animate-in fade-in slide-in-from-top-4 duration-700"
    >
      <SectionHeading t={t} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PeriodCard
          title={t('projection.monthTitle')}
          period={projection.month}
          locale={locale}
          settingsHref={settingsHref}
          t={t}
        />
        <PeriodCard
          title={t('projection.yearTitle')}
          period={projection.year}
          locale={locale}
          settingsHref={settingsHref}
          t={t}
        />
      </div>

      {!projection.targetConfigured && (
        <output className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-200">
          <Target className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('projection.targetMissing')}
          <Link
            href={settingsHref}
            className="inline-flex items-center gap-1 font-semibold text-indigo-100 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
          >
            {t('projection.targetCta')}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </output>
      )}

      {projection.unconverted && (
        <UnconvertedNotice buckets={projection.unconvertedByCurrency} locale={locale} t={t} />
      )}
    </section>
  );
}
