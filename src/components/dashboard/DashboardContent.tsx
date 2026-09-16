'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Decimal } from 'decimal.js';
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  TrendingDown,
  CreditCard,
  DollarSign,
  Target,
  PieChart,
  AlertCircle,
  Banknote,
  Landmark,
  WalletCards,
  BarChart3,
  Calculator,
  Plus,
  ArrowRight,
  ArrowLeftRight,
  Sparkles,
  Eye,
  EyeOff,
  HandCoins,
  CalendarClock,
  AlertTriangle,
  AlertOctagon,
  Info,
} from 'lucide-react';
import { PieChartComponent } from '@/components/dashboard/PieChartComponent';
import { ExpandableMetricSection } from '@/components/dashboard/ExpandableMetricSection';
import { InlineMetric } from '@/components/dashboard/InlineMetric';
import { SparklineChart } from '@/components/dashboard/SparklineChart';
import { TransactionList } from '@/components/transactions/TransactionList';
import { CreateTransactionModal } from '@/components/transactions/CreateTransactionModal';
import { TransferModal } from '@/components/transactions/TransferModal';
import { hasAnyValidPair } from '@/components/transactions/transferRules';
import { PayCreditCardModal } from '@/components/credit-cards/PayCreditCardModal';
import { useUIStore } from '@/store/ui.store';
import { get } from '@/lib/i18n';
import { addCents, formatMoney } from '@/lib/money';
import type { Locale } from '@/lib/i18n';
import type {
  DashboardAlert,
  DashboardCurrencyBuckets,
  DashboardMetrics,
  ExchangeRateSource,
  MoneyBucket,
} from '@/types/dashboard';
import type { AccountBrief, CategoryBrief } from '@/components/transactions/types';
import type { CreditCard as CreditCardModel } from '@/components/credit-cards/credit-card.types';

interface DashboardContentProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly dashboard: Record<string, unknown>;
  /** Transactions dictionary (create/transfer modals + validation messages). */
  readonly transactionsDictionary: Record<string, unknown>;
  /** Credit-cards dictionary (pay-card modal). */
  readonly creditCardsDictionary: Record<string, unknown>;
  readonly accounts: AccountBrief[];
  readonly creditCards: CreditCardModel[];
  readonly categories: CategoryBrief[];
  readonly userId: string;
  readonly locale: string;
}

const MASK = '***';

const categoryColors: Record<
  string,
  {
    bg: string;
    border: string;
    glow: string;
    accent: string;
    accentBg: string;
  }
> = {
  executive: {
    bg: 'from-blue-600/20 via-blue-500/10 to-blue-600/5',
    border: 'border-blue-500/25',
    glow: 'group-hover:shadow-[0_20px_60px_-12px_rgba(59,130,246,0.4)]',
    accent: 'text-blue-400',
    accentBg: 'bg-blue-500/10',
  },
  liquidity: {
    bg: 'from-emerald-600/20 via-emerald-500/10 to-emerald-600/5',
    border: 'border-emerald-500/25',
    glow: 'group-hover:shadow-[0_20px_60px_-12px_rgba(16,185,129,0.4)]',
    accent: 'text-emerald-400',
    accentBg: 'bg-emerald-500/10',
  },
  debts: {
    bg: 'from-rose-600/20 via-rose-500/10 to-rose-600/5',
    border: 'border-rose-500/25',
    glow: 'group-hover:shadow-[0_20px_60px_-12px_rgba(244,63,94,0.4)]',
    accent: 'text-rose-400',
    accentBg: 'bg-rose-500/10',
  },
  investments: {
    bg: 'from-violet-600/20 via-violet-500/10 to-violet-600/5',
    border: 'border-violet-500/25',
    glow: 'group-hover:shadow-[0_20px_60px_-12px_rgba(139,92,246,0.4)]',
    accent: 'text-violet-400',
    accentBg: 'bg-violet-500/10',
  },
  expenses: {
    bg: 'from-amber-600/20 via-amber-500/10 to-amber-600/5',
    border: 'border-amber-500/25',
    glow: 'group-hover:shadow-[0_20px_60px_-12px_rgba(245,158,11,0.4)]',
    accent: 'text-amber-400',
    accentBg: 'bg-amber-500/10',
  },
};

type Translator = (key: string) => string;
/** Applies the privacy mask to an already-formatted money string. */
type MoneyMasker = (formatted: string) => string;
/** Direction of a metric trend, shared by every card/badge style map. */
type Trend = 'up' | 'down' | 'neutral';

/**
 * Static trend class maps.
 *
 * Tailwind's JIT cannot see interpolated class fragments such as
 * `from-${color}-500/20`, so those utilities were never generated. Listing the
 * complete class strings keeps every variant available at build time.
 */
const TREND_GLOW: Record<Trend, string> = {
  up: 'from-emerald-500/20',
  down: 'from-rose-500/20',
  neutral: 'from-slate-500/20',
};

const TREND_BADGE: Record<Trend, string> = {
  up: 'bg-emerald-500/12 text-emerald-300',
  down: 'bg-rose-500/12 text-rose-300',
  neutral: 'bg-slate-500/12 text-slate-300',
};

// ============================================================================
// Formatting helpers (locale-aware, Rule 4 — never assume a currency)
// ============================================================================

/**
 * Sum money amounts (integer cents) exclusively through `addCents`
 * (Decimal.js, ROUND_HALF_EVEN) — Rule 1: no native float arithmetic on money.
 */
function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => addCents(total, value), 0);
}

function formatDateValue(value: Date | null, locale: string): string {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatPercent(value: number, locale: string): string {
  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
  return `${formatted}%`;
}

function rateSourceLabel(source: ExchangeRateSource, t: Translator): string {
  if (source === 'live') return t('sourceLive');
  if (source === 'fallback') return t('sourceFallback');
  return t('sourceUnavailable');
}

// ============================================================================
// Small presentational pieces
// ============================================================================

interface HeroMetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly subValue?: string;
  readonly trend?: Trend;
  readonly t: Translator;
  readonly masked?: boolean;
  readonly onToggleMask?: () => void;
}

function HeroMetricCard({
  label,
  value,
  subValue,
  trend,
  t,
  masked = false,
  onToggleMask,
}: HeroMetricCardProps) {
  const getTrendStyles = (trendValue: Trend | undefined) => {
    if (trendValue === 'up') return 'bg-emerald-500/15 text-emerald-300';
    if (trendValue === 'down') return 'bg-rose-500/15 text-rose-300';
    return 'bg-slate-500/10 text-slate-300';
  };
  const trendStyles = getTrendStyles(trend);

  return (
    <div
      className="
      group relative overflow-hidden rounded-2xl sm:rounded-3xl
      bg-gradient-to-br from-blue-600/25 via-blue-500/12 to-blue-700/8
      border border-blue-400/30
      p-5 sm:p-8 lg:p-12
      col-span-full
      hover:border-blue-300/40
      transition-all duration-700
      backdrop-blur-sm
    "
    >
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/15 rounded-full blur-[80px] group-hover:bg-blue-400/20 transition-all duration-1000" />
      <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-blue-400/10 rounded-full blur-[60px]" />

      <div className="absolute top-0 right-0 w-32 h-32 opacity-30 group-hover:opacity-40 transition-opacity duration-500">
        <div className="absolute top-6 right-6 w-12 h-12 border-t-2 border-r-2 border-blue-400/60 rounded-tr-2xl" />
        <div className="absolute top-10 right-10 w-6 h-6 border-t border-r border-blue-300/40 rounded-tr" />
      </div>

      {onToggleMask && (
        <button
          type="button"
          onClick={onToggleMask}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 p-2 sm:p-2.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          aria-label={masked ? t('showValues') : t('hideValues')}
        >
          {masked ? (
            <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          ) : (
            <Eye className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
          )}
        </button>
      )}

      <div className="relative z-10">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-5">
          <div
            className={`p-2 sm:p-3 rounded-lg sm:rounded-xl transition-all duration-300 ${categoryColors.executive.accentBg} ${categoryColors.executive.accent} group-hover:text-blue-300`}
          >
            <Wallet className="w-4 h-4 sm:w-6 sm:h-6" aria-hidden="true" />
          </div>
          <div>
            <span className="text-xs sm:text-sm font-semibold text-blue-300/70 uppercase tracking-widest block">
              {label}
            </span>
            <span className="text-xs sm:text-sm text-blue-300/50">{t('totalAvailable')}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6 lg:gap-8">
          <div className="flex-1">
            <p className="text-4xl sm:text-6xl lg:text-7xl font-bold text-white tracking-tighter mb-2 sm:mb-3">
              {masked ? MASK : value}
            </p>
            {subValue && (
              <div
                className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg backdrop-blur-sm ${trendStyles}`}
              >
                {trend === 'up' && (
                  <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
                )}
                {trend === 'down' && (
                  <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" aria-hidden="true" />
                )}
                <span className="text-xs sm:text-sm font-semibold">{subValue}</span>
              </div>
            )}
          </div>

          <div className="hidden lg:flex flex-col items-end text-right">
            <div className="text-blue-400/60 text-sm font-medium mb-2">{t('estimatedWealth')}</div>
            <div className="flex items-center gap-2 text-blue-300">
              <Sparkles className="w-5 h-5 group-hover:animate-pulse" aria-hidden="true" />
              <span className="text-xs tracking-wide">{t('active')}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly subValue?: string;
  readonly category: string;
  readonly icon: React.ReactNode;
  readonly trend?: Trend;
  readonly sparklineData?: readonly number[];
  readonly t: Translator;
  readonly masked?: boolean;
  /** When set, the whole card becomes a navigable drill-down link. */
  readonly href?: string;
}

function MetricCard({
  label,
  value,
  subValue,
  category,
  icon,
  trend,
  sparklineData,
  t,
  masked = false,
  href,
}: MetricCardProps) {
  const colors = categoryColors[category] || categoryColors.executive;
  const trendKey: Trend = trend ?? 'neutral';

  const card = (
    <div
      className={`
      group relative overflow-hidden rounded-xl sm:rounded-2xl border ${colors.border} p-3 sm:p-5
      bg-gradient-to-br ${colors.bg} ${colors.glow}
      transition-all duration-400 ease-out
      transform hover:-translate-y-1
      backdrop-blur-sm
    `}
    >
      <div className="absolute -inset-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div
          className={`absolute inset-0 rounded-2xl blur-2xl ${TREND_GLOW[trendKey]} to-transparent bg-gradient-to-br`}
        />
      </div>

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className="flex-1 min-w-0 pr-2">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-0.5 truncate">
              {label}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-400">{t('currentMonth')}</span>
          </div>
          <div
            className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl flex-shrink-0 transition-all duration-300 ${colors.accentBg} ${colors.accent} group-hover:scale-110`}
          >
            <span className="block [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-5 sm:[&>svg]:h-5">
              {icon}
            </span>
          </div>
        </div>

        <div className="mb-1 sm:mb-3">
          <div className="flex items-baseline justify-between mb-1 sm:mb-2">
            <p className="text-lg sm:text-2xl font-bold text-white tracking-tight leading-none">
              {masked ? MASK : value}
            </p>
            {sparklineData && <SparklineChart data={sparklineData} color={colors.accent} />}
          </div>

          {subValue && (
            <div
              className={`inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 rounded text-[10px] sm:text-xs font-semibold ${TREND_BADGE[trendKey]}`}
            >
              {trend === 'up' && (
                <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" aria-hidden="true" />
              )}
              {trend === 'down' && (
                <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" aria-hidden="true" />
              )}
              {trend === 'neutral' && <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />}
              <span>{subValue}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  if (!href) return card;

  return (
    <Link
      href={href}
      className="block rounded-xl sm:rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
    >
      {card}
    </Link>
  );
}

interface SectionHeaderProps {
  readonly title: string;
  readonly icon: React.ReactNode;
  readonly action?: React.ReactNode;
}

function SectionHeader({ title, icon, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3 sm:mb-4">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20">
          <span className="block [&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-5 sm:[&>svg]:h-5">
            {icon}
          </span>
        </div>
        <h3 className="text-base sm:text-xl font-semibold text-white tracking-tight">{title}</h3>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

interface EmptyStateProps {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}

function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 bg-blue-500/10 rounded-full blur-2xl" />
        <div className="relative p-4 rounded-2xl bg-blue-500/10 text-blue-400">{icon}</div>
      </div>
      <h4 className="text-lg font-medium text-white mb-2">{title}</h4>
      <p className="text-sm text-slate-400 max-w-xs mb-4">{description}</p>
      {action}
    </div>
  );
}

interface ModuleLinkProps {
  readonly href: string;
  readonly label: string;
}

function ModuleLink({ href, label }: ModuleLinkProps) {
  return (
    <div className="px-4 py-3 border-t border-white/6">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
      >
        {label}
        <ArrowRight className="w-3 h-3" aria-hidden="true" />
      </Link>
    </div>
  );
}

interface ChipBucket {
  readonly currency: string;
  readonly formatted: string;
}

interface CurrencyChipsProps {
  readonly buckets: readonly ChipBucket[];
  readonly label: string;
  readonly masked: boolean;
}

/** Per-currency breakdown shown ONLY when a KPI spans more than one currency. */
function CurrencyChips({ buckets, label, masked }: CurrencyChipsProps) {
  if (buckets.length <= 1) return null;
  return (
    <div className="px-4 pb-3 pt-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-400 mr-2">{label}</span>
      <span className="inline-flex flex-wrap gap-1.5 align-middle">
        {buckets.map((bucket) => (
          <span
            key={bucket.currency}
            className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-300"
          >
            <span className="font-semibold text-slate-400">{bucket.currency}</span>
            <span className="tabular-nums">{masked ? MASK : bucket.formatted}</span>
          </span>
        ))}
      </span>
    </div>
  );
}

function toChipBuckets(buckets: readonly MoneyBucket[]): ChipBucket[] {
  return buckets.map((bucket) => ({ currency: bucket.currency, formatted: bucket.formatted }));
}

// ============================================================================
// Section subcomponents (one per dashboard block, keeping each function's
// cognitive complexity well below the S3776 ceiling)
// ============================================================================

interface AlertVisual {
  readonly icon: React.ReactNode;
  readonly container: string;
  readonly href: string;
}

function buildAlertVisuals(lang: Locale): Record<string, AlertVisual> {
  return {
    FIXED_EXPENSES_OVERDUE: {
      icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
      container: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      href: `/${lang}/fixed-expenses`,
    },
    CREDIT_CARD_OVERDUE: {
      icon: <AlertOctagon className="w-4 h-4" aria-hidden="true" />,
      container: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
      href: `/${lang}/accounts`,
    },
    CREDIT_CARD_DUE_SOON: {
      icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
      container: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      href: `/${lang}/accounts`,
    },
    LOANS_OVERDUE: {
      icon: <AlertTriangle className="w-4 h-4" aria-hidden="true" />,
      container: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
      href: `/${lang}/loans`,
    },
    SAVINGS_GOALS_AT_RISK: {
      icon: <Info className="w-4 h-4" aria-hidden="true" />,
      container: 'border-blue-500/30 bg-blue-500/10 text-blue-200',
      href: `/${lang}/savings`,
    },
  };
}

interface DashboardAlertsProps {
  readonly alerts: readonly DashboardAlert[];
  readonly lang: Locale;
  readonly t: Translator;
  readonly money: MoneyMasker;
  readonly locale: string;
}

/**
 * Alerts list.
 *
 * WCAG 4.1.2 / 2.4.4: the live region lives on the NON-interactive container
 * (`aria-live="polite"`), while each row keeps its native link semantics. A
 * `role="alert"` directly on the `<Link>` would override the link role.
 */
function DashboardAlerts({ alerts, lang, t, money, locale }: DashboardAlertsProps) {
  if (alerts.length === 0) return null;
  const alertVisuals = buildAlertVisuals(lang);

  return (
    <section aria-live="polite" aria-label={t('alerts.title')} className="space-y-2">
      {alerts.map((alert, index) => {
        const visual = alertVisuals[alert.kind];
        const icon = visual?.icon ?? <Info className="w-4 h-4" aria-hidden="true" />;
        const container = visual?.container ?? 'border-slate-500/30 bg-slate-500/10 text-slate-200';
        const href = visual?.href ?? `/${lang}/dashboard`;
        return (
          <Link
            key={`${alert.kind}-${index}`}
            href={href}
            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${container}`}
          >
            <span className="flex items-center gap-2 min-w-0">
              {icon}
              <span className="truncate">{t(`alerts.${alert.kind}`)}</span>
            </span>
            <span className="flex items-center gap-2 flex-shrink-0 text-xs">
              {alert.amount && (
                <span className="tabular-nums font-semibold">
                  {money(formatMoney(alert.amount.amount, alert.amount.currency, locale))}
                </span>
              )}
              <span
                className="rounded-md bg-black/20 px-1.5 py-0.5 font-semibold"
                title={t('alerts.countLabel')}
              >
                ×{alert.count}
              </span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </span>
          </Link>
        );
      })}
    </section>
  );
}

interface NetWorthSectionProps {
  readonly metrics: DashboardMetrics;
  readonly buckets: readonly MoneyBucket[];
  readonly t: Translator;
  readonly isMasked: boolean;
  readonly onToggleMask: () => void;
}

function NetWorthSection({ metrics, buckets, t, isMasked, onToggleMask }: NetWorthSectionProps) {
  return (
    <section className="animate-in fade-in slide-in-from-top-4 duration-700">
      <HeroMetricCard
        label={t('netWorth')}
        value={metrics.netWorth.formatted}
        subValue={metrics.expensesComparison.formatted}
        trend={metrics.expensesComparison.isPositive ? 'up' : 'down'}
        t={t}
        masked={isMasked}
        onToggleMask={onToggleMask}
      />
      <CurrencyChips
        buckets={toChipBuckets(buckets)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />
    </section>
  );
}

interface CriticalIndicatorsSectionProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly t: Translator;
  readonly isMasked: boolean;
}

function CriticalIndicatorsSection({ metrics, lang, t, isMasked }: CriticalIndicatorsSectionProps) {
  return (
    <section className="animate-in fade-in slide-in-from-top-4 duration-700 delay-100">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        <MetricCard
          t={t}
          label={t('totalCash')}
          value={metrics.totalCash.formatted}
          category="liquidity"
          icon={<Banknote className="w-5 h-5" />}
          trend={metrics.totalCash.amount > 0 ? 'up' : 'neutral'}
          subValue={metrics.totalCash.amount > 0 ? t('available') : t('noFunds')}
          masked={isMasked}
          href={`/${lang}/accounts`}
        />
        <MetricCard
          t={t}
          label={t('maxSpendable')}
          value={metrics.maxSpendable.formatted}
          category="executive"
          icon={<Calculator className="w-5 h-5" />}
          trend="neutral"
          subValue={t('thisMonth')}
          masked={isMasked}
          href={`/${lang}/savings`}
        />
        <MetricCard
          t={t}
          label={t('savings')}
          value={metrics.savings.formatted}
          category="liquidity"
          icon={<PiggyBank className="w-5 h-5" />}
          trend="up"
          subValue={t('accumulated')}
          masked={isMasked}
          href={`/${lang}/savings`}
        />
        <MetricCard
          t={t}
          label={t('debtsTotal')}
          value={metrics.creditCardDebt.formatted}
          category="debts"
          icon={<CreditCard className="w-5 h-5" />}
          trend={metrics.creditCardDebt.amount > 0 ? 'down' : 'neutral'}
          subValue={metrics.creditCardDebt.amount > 0 ? t('pending') : t('noDebts')}
          masked={isMasked}
          href={`/${lang}/accounts`}
        />
      </div>
    </section>
  );
}

interface QuickActionsSectionProps {
  readonly t: Translator;
  readonly lang: Locale;
  readonly hasAccounts: boolean;
  readonly canTransfer: boolean;
  readonly hasCreditCards: boolean;
  readonly onNewTransaction: () => void;
  readonly onTransfer: () => void;
  readonly onPayCard: () => void;
}

function QuickActionsSection({
  t,
  lang,
  hasAccounts,
  canTransfer,
  hasCreditCards,
  onNewTransaction,
  onTransfer,
  onPayCard,
}: QuickActionsSectionProps) {
  return (
    <section className="animate-in fade-in slide-in-from-top-4 duration-700 delay-150">
      <SectionHeader title={t('quickActions')} icon={<Plus className="w-5 h-5" />} />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onNewTransaction}
          disabled={!hasAccounts}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          {t('newTransaction')}
        </button>
        <button
          type="button"
          onClick={onNewTransaction}
          disabled={!hasAccounts}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          {t('quickRegisterExpense')}
        </button>
        <button
          type="button"
          onClick={onTransfer}
          disabled={!canTransfer}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
          {t('quickTransfer')}
        </button>
        <button
          type="button"
          onClick={onPayCard}
          disabled={!hasCreditCards}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CreditCard className="w-4 h-4" aria-hidden="true" />
          {t('quickPayCard')}
        </button>
        <Link
          href={`/${lang}/savings`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <PiggyBank className="w-4 h-4" aria-hidden="true" />
          {t('quickContribute')}
        </Link>
        <Link
          href={`/${lang}/loans`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        >
          <HandCoins className="w-4 h-4" aria-hidden="true" />
          {t('loans')}
        </Link>
      </div>
    </section>
  );
}

interface LiquiditySectionProps {
  readonly metrics: DashboardMetrics;
  readonly byCurrency: DashboardCurrencyBuckets;
  readonly lang: Locale;
  readonly t: Translator;
  readonly isMasked: boolean;
}

function LiquiditySection({ metrics, byCurrency, lang, t, isMasked }: LiquiditySectionProps) {
  return (
    <ExpandableMetricSection
      title={t('liquidity')}
      icon={<Banknote className="w-5 h-5" />}
      defaultOpen={true}
      category="liquidity"
    >
      <div className="flex">
        <InlineMetric
          label={t('savings')}
          value={metrics.savings.formatted}
          icon={<PiggyBank />}
          accent="text-emerald-400"
          trend="up"
          subValue={t('availableBalance')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('receivables')}
          value={metrics.receivables.formatted}
          icon={<DollarSign />}
          accent="text-emerald-400"
          trend="neutral"
          subValue={t('toPay')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
      </div>
      <CurrencyChips
        buckets={toChipBuckets(byCurrency.savings)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />
      <CurrencyChips
        buckets={toChipBuckets(byCurrency.receivables)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />
      <ModuleLink href={`/${lang}/accounts`} label={t('viewAccounts')} />
    </ExpandableMetricSection>
  );
}

interface DebtsSectionProps {
  readonly metrics: DashboardMetrics;
  readonly byCurrency: DashboardCurrencyBuckets;
  readonly lang: Locale;
  readonly t: Translator;
  readonly isMasked: boolean;
}

function DebtsSection({ metrics, byCurrency, lang, t, isMasked }: DebtsSectionProps) {
  return (
    <ExpandableMetricSection
      title={t('debts')}
      icon={<CreditCard className="w-5 h-5" />}
      defaultOpen={false}
      category="debts"
    >
      <div className="flex">
        <InlineMetric
          label={t('creditCardDebt')}
          value={metrics.creditCardDebt.formatted}
          icon={<CreditCard />}
          accent="text-rose-400"
          trend={metrics.creditCardDebt.amount > 0 ? 'down' : 'neutral'}
          subValue={t('currentBalance')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('creditAvailable')}
          value={metrics.creditAvailable.formatted}
          icon={<WalletCards />}
          accent="text-rose-400"
          trend="up"
          subValue={t('available')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('externalDebts')}
          value={metrics.externalDebts.formatted}
          icon={<Landmark />}
          accent="text-rose-400"
          trend={metrics.externalDebts.amount > 0 ? 'down' : 'neutral'}
          subValue={t('otherLoans')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
      </div>
      <CurrencyChips
        buckets={toChipBuckets(byCurrency.creditCardDebt)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />
      <CurrencyChips
        buckets={toChipBuckets(byCurrency.creditAvailable)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />
      <CurrencyChips
        buckets={toChipBuckets(byCurrency.externalDebts)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />
      <ModuleLink href={`/${lang}/loans`} label={t('viewLoans')} />
    </ExpandableMetricSection>
  );
}

interface InvestmentsSectionProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly locale: string;
  readonly t: Translator;
  readonly isMasked: boolean;
  readonly money: MoneyMasker;
}

function InvestmentsSection({
  metrics,
  lang,
  locale,
  t,
  isMasked,
  money,
}: InvestmentsSectionProps) {
  const { investmentsBreakdown } = metrics;

  // Investments aggregate restricted to the PRIMARY investments currency so no
  // two currencies are ever summed together (Rule 4).
  const investmentTotals = useMemo(() => {
    const currency = metrics.investments.currency;
    const scoped = investmentsBreakdown.accounts.filter((account) => account.currency === currency);
    const invested = sumCents(scoped.map((account) => account.totalInvestedCents));
    const marketValue = sumCents(scoped.map((account) => account.holdingsMarketValueCents));
    const totalValue = sumCents(scoped.map((account) => account.totalValueCents));
    const returnCents = sumCents(scoped.map((account) => account.totalReturnCents));
    // Rule 1/3: percentages derived from money use Decimal.js with banker's
    // rounding (same pattern as investment-performance.service.ts).
    const returnPct =
      invested === 0
        ? 0
        : new Decimal(returnCents)
            .dividedBy(invested)
            .times(100)
            .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
            .toNumber();
    return { currency, invested, marketValue, totalValue, returnCents, returnPct };
  }, [investmentsBreakdown.accounts, metrics.investments.currency]);

  return (
    <ExpandableMetricSection
      title={t('investments')}
      icon={<TrendingUp className="w-5 h-5" />}
      defaultOpen={false}
      category="investments"
      maxHeightClass="max-h-[1400px]"
    >
      <div className="flex">
        <InlineMetric
          label={t('investments')}
          value={
            investmentTotals.totalValue === 0
              ? metrics.investments.formatted
              : formatMoney(investmentTotals.totalValue, investmentTotals.currency, locale)
          }
          icon={<TrendingUp />}
          accent="text-violet-400"
          trend="up"
          subValue={t('active')}
          sublabel={t('currentMonth')}
          sparklineData={metrics.sparklines.investments}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('investedAmount')}
          value={formatMoney(investmentTotals.invested, investmentTotals.currency, locale)}
          icon={<BarChart3 />}
          accent="text-violet-400"
          trend="neutral"
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('marketValue')}
          value={formatMoney(investmentTotals.marketValue, investmentTotals.currency, locale)}
          icon={<Calculator />}
          accent="text-violet-400"
          trend="neutral"
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
      </div>

      <div className="flex items-center justify-between px-4 pb-3 pt-1 text-xs">
        <span className="text-slate-400 font-semibold uppercase tracking-wider">
          {t('totalReturn')}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={`font-semibold tabular-nums ${
              investmentTotals.returnCents >= 0 ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {money(formatMoney(investmentTotals.returnCents, investmentTotals.currency, locale))}
          </span>
          <span
            className={`rounded px-1.5 py-0.5 font-semibold ${
              investmentTotals.returnCents >= 0
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-rose-500/15 text-rose-300'
            }`}
          >
            {formatPercent(investmentTotals.returnPct, locale)}
          </span>
        </span>
      </div>

      {investmentsBreakdown.accounts.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-400">{t('noData')}</p>
      ) : (
        <ul className="space-y-2 px-4 pb-4">
          {investmentsBreakdown.accounts.map((account) => (
            <li
              key={account.accountId}
              className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2"
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate text-sm text-slate-200">{account.name}</span>
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                  {account.currency}
                </span>
              </span>
              <span className="text-sm font-semibold text-white tabular-nums">
                {money(formatMoney(account.totalValueCents, account.currency, locale))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <CurrencyChips
        buckets={toChipBuckets(investmentsBreakdown.byCurrency)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />
      <ModuleLink href={`/${lang}/investments`} label={t('viewInvestments')} />
    </ExpandableMetricSection>
  );
}

interface LoansSectionProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly locale: string;
  readonly t: Translator;
  readonly isMasked: boolean;
  readonly money: MoneyMasker;
}

function LoansSection({ metrics, lang, locale, t, isMasked, money }: LoansSectionProps) {
  const { loans } = metrics;
  return (
    <ExpandableMetricSection
      title={t('loans')}
      icon={<HandCoins className="w-5 h-5" />}
      defaultOpen={false}
      category="debts"
      maxHeightClass="max-h-[1600px]"
    >
      <div className="flex">
        <InlineMetric
          label={t('externalDebts')}
          value={metrics.externalDebts.formatted}
          icon={<Landmark />}
          accent="text-rose-400"
          trend={metrics.externalDebts.amount > 0 ? 'down' : 'neutral'}
          subValue={t('otherLoans')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('receivables')}
          value={metrics.receivables.formatted}
          icon={<DollarSign />}
          accent="text-emerald-400"
          trend="neutral"
          subValue={t('toPay')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('overdueInstallments')}
          value={String(loans.totalOverdueCount)}
          icon={<AlertTriangle />}
          accent={loans.totalOverdueCount > 0 ? 'text-rose-400' : 'text-slate-400'}
          trend={loans.totalOverdueCount > 0 ? 'down' : 'neutral'}
          sublabel={t('currentMonth')}
        />
      </div>

      {loans.byCurrency.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState
            icon={<HandCoins className="w-10 h-10" />}
            title={t('noLoans')}
            description={t('noLoansDesc')}
          />
        </div>
      ) : (
        <ul className="space-y-2 px-4 pb-4">
          {loans.byCurrency.map((loan) => (
            <li key={loan.currency} className="rounded-lg bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">{loan.currency}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">
                    {loan.activeCount} {t('activeLoans')}
                  </span>
                  {loan.overdueCount > 0 && (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                      {loan.overdueCount} {t('overdueInstallments')}
                    </span>
                  )}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-400">{t('externalDebt')}</dt>
                <dd className="text-right text-slate-200 tabular-nums">
                  {money(formatMoney(loan.externalDebts, loan.currency, locale))}
                </dd>
                <dt className="text-slate-400">{t('receivables')}</dt>
                <dd className="text-right text-slate-200 tabular-nums">
                  {money(formatMoney(loan.receivables, loan.currency, locale))}
                </dd>
                <dt className="text-slate-400">{t('monthlyPayment')}</dt>
                <dd className="text-right text-slate-200 tabular-nums">
                  {money(formatMoney(loan.monthlyDueCents, loan.currency, locale))}
                </dd>
                {loan.nextDueDate && (
                  <>
                    <dt className="text-slate-400">{t('nextDueDate')}</dt>
                    <dd className="text-right text-slate-200">
                      {formatDateValue(loan.nextDueDate, locale)}
                    </dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
      <ModuleLink href={`/${lang}/loans`} label={t('viewLoans')} />
    </ExpandableMetricSection>
  );
}

interface CreditCardsSectionProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly locale: string;
  readonly t: Translator;
  readonly isMasked: boolean;
  readonly money: MoneyMasker;
}

function CreditCardsSection({
  metrics,
  lang,
  locale,
  t,
  isMasked,
  money,
}: CreditCardsSectionProps) {
  const { creditCards: cardsMetrics } = metrics;
  const cardsOverdueCount = cardsMetrics.byCurrency.reduce(
    (total, bucket) => total + bucket.overdueCount,
    0
  );
  const cardsDueSoonCount = cardsMetrics.byCurrency.reduce(
    (total, bucket) => total + bucket.dueSoonCount,
    0
  );

  return (
    <ExpandableMetricSection
      title={t('creditCards')}
      icon={<CreditCard className="w-5 h-5" />}
      defaultOpen={false}
      category="debts"
      maxHeightClass="max-h-[1400px]"
    >
      <div className="flex">
        <InlineMetric
          label={t('cardsDebt')}
          value={cardsMetrics.totalDebt.formatted}
          icon={<CreditCard />}
          accent="text-rose-400"
          trend={cardsMetrics.totalDebt.amount > 0 ? 'down' : 'neutral'}
          subValue={t('currentBalance')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('cardsAvailable')}
          value={cardsMetrics.totalAvailableCredit.formatted}
          icon={<WalletCards />}
          accent="text-emerald-400"
          trend="up"
          subValue={t('available')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('cardsOverdue')}
          value={String(cardsOverdueCount)}
          icon={<AlertTriangle />}
          accent={cardsOverdueCount > 0 ? 'text-rose-400' : 'text-slate-400'}
          trend={cardsOverdueCount > 0 ? 'down' : 'neutral'}
          sublabel={`${cardsDueSoonCount} ${t('cardsDueSoon')}`}
        />
      </div>

      {cardsMetrics.byCurrency.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState
            icon={<CreditCard className="w-10 h-10" />}
            title={t('noCards')}
            description={t('noCardsDesc')}
          />
        </div>
      ) : (
        <ul className="space-y-2 px-4 pb-4">
          {cardsMetrics.byCurrency.map((card) => (
            <li key={card.currency} className="rounded-lg bg-white/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">{card.currency}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">
                    {card.cardsCount} {t('accountsCount')}
                  </span>
                  {card.dueSoonCount > 0 && (
                    <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300">
                      {card.dueSoonCount} {t('cardsDueSoon')}
                    </span>
                  )}
                  {card.overdueCount > 0 && (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                      {card.overdueCount} {t('cardsOverdue')}
                    </span>
                  )}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-slate-400">{t('cardsDebt')}</dt>
                <dd className="text-right text-slate-200 tabular-nums">
                  {money(formatMoney(card.debtCents, card.currency, locale))}
                </dd>
                <dt className="text-slate-400">{t('cardsAvailable')}</dt>
                <dd className="text-right text-slate-200 tabular-nums">
                  {money(formatMoney(card.availableCreditCents, card.currency, locale))}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
      <ModuleLink href={`/${lang}/accounts`} label={t('viewCards')} />
    </ExpandableMetricSection>
  );
}

type UpcomingFixedExpense = DashboardMetrics['fixedExpenses']['upcoming'][number];
type FixedExpenseBucket = DashboardMetrics['fixedExpenses']['byCurrency'][number];
type VariableExpenseBucket = DashboardMetrics['variableExpenses']['byCurrency'][number];
type TopVariableExpense = VariableExpenseBucket['topExpenses'][number];

interface UpcomingFixedExpensesProps {
  readonly upcoming: readonly UpcomingFixedExpense[];
  readonly locale: string;
  readonly t: Translator;
  readonly money: MoneyMasker;
}

function UpcomingFixedExpenses({ upcoming, locale, t, money }: UpcomingFixedExpensesProps) {
  if (upcoming.length === 0) {
    return <p className="px-4 pb-4 text-sm text-slate-400">{t('noUpcomingFixed')}</p>;
  }
  return (
    <ul className="space-y-1.5 px-4 pb-4">
      {upcoming.map((payment) => (
        <li
          key={payment.id}
          className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm text-slate-200">{payment.name}</span>
            <span className="text-[10px] text-slate-400">
              {t('dueOn')} {formatDateValue(payment.dueDate, locale)}
            </span>
          </span>
          <span className="flex items-center gap-1.5 flex-shrink-0">
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              {payment.currency}
            </span>
            <span className="text-sm font-semibold text-white tabular-nums">
              {money(formatMoney(payment.expectedAmountCents, payment.currency, locale))}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

interface FixedExpensesByCurrencyProps {
  readonly buckets: readonly FixedExpenseBucket[];
  readonly locale: string;
  readonly t: Translator;
  readonly money: MoneyMasker;
}

function FixedExpensesByCurrency({ buckets, locale, t, money }: FixedExpensesByCurrencyProps) {
  if (buckets.length === 0) return null;
  return (
    <div className="border-t border-white/6 px-4 pt-3">
      <dl className="grid grid-cols-1 gap-2 pb-2 text-xs sm:grid-cols-2">
        {buckets.map((bucket) => (
          <div key={bucket.currency} className="rounded-lg bg-white/[0.03] p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">{bucket.currency}</span>
              {bucket.overdueCents > 0 && (
                <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                  {t('fixedOverdue')}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-400">{t('fixedPending')}</dt>
              <dd className="text-slate-200 tabular-nums">
                {money(formatMoney(bucket.pendingCents, bucket.currency, locale))}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate-400">{t('fixedOverdue')}</dt>
              <dd className="text-slate-200 tabular-nums">
                {money(formatMoney(bucket.overdueCents, bucket.currency, locale))}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface TopExpenseRowProps {
  readonly expense: TopVariableExpense;
  readonly locale: string;
  readonly t: Translator;
  readonly money: MoneyMasker;
}

function TopExpenseRow({ expense, locale, t, money }: TopExpenseRowProps) {
  return (
    <li className="flex items-center justify-between text-[11px] text-slate-300">
      <span className="truncate pr-2">{expense.name}</span>
      <span className="flex flex-shrink-0 items-center gap-1.5">
        <span className="tabular-nums">
          {money(formatMoney(expense.totalCents, expense.currency, locale))}
        </span>
        {expense.deltaAmountPct != null && (
          <span
            className={`rounded px-1 py-0.5 font-semibold ${
              expense.deltaAmountPct > 0
                ? 'bg-rose-500/15 text-rose-300'
                : 'bg-emerald-500/15 text-emerald-300'
            }`}
            title={t('deltaLabel')}
          >
            {formatPercent(expense.deltaAmountPct, locale)}
          </span>
        )}
      </span>
    </li>
  );
}

interface VariableExpensesBreakdownProps {
  readonly buckets: readonly VariableExpenseBucket[];
  readonly locale: string;
  readonly t: Translator;
  readonly money: MoneyMasker;
}

function VariableExpensesBreakdown({ buckets, locale, t, money }: VariableExpensesBreakdownProps) {
  if (buckets.length === 0) {
    return <p className="px-4 pb-4 text-sm text-slate-400">{t('noVariableExpenses')}</p>;
  }
  return (
    <div className="space-y-2 px-4 pb-4">
      {buckets.map((bucket) => (
        <div key={bucket.currency} className="rounded-lg bg-white/[0.03] p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-200">{bucket.currency}</span>
            <span className="text-sm font-semibold text-white tabular-nums">
              {money(formatMoney(bucket.totalCents, bucket.currency, locale))}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              {t('expectedTotal')}:{' '}
              <span className="tabular-nums">
                {money(formatMoney(bucket.expectedTotalCents, bucket.currency, locale))}
              </span>
            </span>
            <span>
              {bucket.transactionCount} · {bucket.definitionsCount}
            </span>
          </div>
          {bucket.topExpenses.length > 0 && (
            <ul className="mt-2 space-y-1">
              {bucket.topExpenses.map((expense) => (
                <TopExpenseRow
                  key={expense.id}
                  expense={expense}
                  locale={locale}
                  t={t}
                  money={money}
                />
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

interface ExpensesSectionProps {
  readonly metrics: DashboardMetrics;
  readonly byCurrency: DashboardCurrencyBuckets;
  readonly lang: Locale;
  readonly locale: string;
  readonly t: Translator;
  readonly isMasked: boolean;
  readonly money: MoneyMasker;
}

function ExpensesSection({
  metrics,
  byCurrency,
  lang,
  locale,
  t,
  isMasked,
  money,
}: ExpensesSectionProps) {
  return (
    <ExpandableMetricSection
      title={t('expenses')}
      icon={<AlertCircle className="w-5 h-5" />}
      defaultOpen={false}
      category="expenses"
      maxHeightClass="max-h-[2200px]"
    >
      <div className="flex">
        <InlineMetric
          label={t('monthlyExpenses')}
          value={metrics.monthlyExpenses.formatted}
          icon={<AlertCircle />}
          accent="text-amber-400"
          trend="neutral"
          subValue={t('accumulatedThisMonth')}
          sublabel={t('currentMonth')}
          sparklineData={metrics.sparklines.monthlyExpenses}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('monthlyIncome')}
          value={metrics.monthlyIncome.formatted}
          icon={<DollarSign />}
          accent="text-emerald-400"
          trend="up"
          subValue={t('accumulatedThisMonth')}
          sublabel={t('currentMonth')}
          sparklineData={metrics.sparklines.monthlyIncome}
          masked={isMasked}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('pendingFixedExpenses')}
          value={metrics.pendingFixedExpenses.formatted}
          icon={<Target />}
          accent="text-amber-400"
          trend={metrics.pendingFixedExpenses.amount > 0 ? 'down' : 'up'}
          subValue={metrics.pendingFixedExpenses.amount > 0 ? t('stillToDeduct') : t('paid')}
          sublabel={t('currentMonth')}
          masked={isMasked}
        />
      </div>

      <CurrencyChips
        buckets={toChipBuckets(byCurrency.monthlyExpenses)}
        label={t('otherCurrencies')}
        masked={isMasked}
      />

      {/* Fixed expenses: per-currency + upcoming payments */}
      <div className="border-t border-white/6 px-4 pt-3">
        <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
          {t('upcomingFixed')}
        </h4>
      </div>
      <UpcomingFixedExpenses
        upcoming={metrics.fixedExpenses.upcoming}
        locale={locale}
        t={t}
        money={money}
      />

      <FixedExpensesByCurrency
        buckets={metrics.fixedExpenses.byCurrency}
        locale={locale}
        t={t}
        money={money}
      />
      <ModuleLink href={`/${lang}/fixed-expenses`} label={t('viewFixedExpenses')} />

      {/* Variable expenses: per-currency total + top of month */}
      <div className="border-t border-white/6 px-4 pt-3">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          {t('variableThisMonth')}
        </h4>
      </div>
      <VariableExpensesBreakdown
        buckets={metrics.variableExpenses.byCurrency}
        locale={locale}
        t={t}
        money={money}
      />
      <ModuleLink href={`/${lang}/variable-expenses`} label={t('viewVariableExpenses')} />
    </ExpandableMetricSection>
  );
}

interface FxSectionProps {
  readonly metrics: DashboardMetrics;
  readonly t: Translator;
}

function FxSection({ metrics, t }: FxSectionProps) {
  return (
    <ExpandableMetricSection
      title={t('fxRates')}
      icon={<DollarSign className="w-5 h-5" />}
      defaultOpen={false}
      category="investments"
    >
      <div className="flex">
        <InlineMetric
          label={t('usdRate')}
          value={metrics.dollarRate.formatted}
          icon={<DollarSign />}
          accent="text-violet-400"
          trend="neutral"
          subValue={rateSourceLabel(metrics.dollarRate.source, t)}
          sublabel={t('rateSource')}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('eurRate')}
          value={metrics.euroRate.formatted}
          icon={<DollarSign />}
          accent="text-violet-400"
          trend="neutral"
          subValue={rateSourceLabel(metrics.euroRate.source, t)}
          sublabel={t('rateSource')}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('maxInterestRate')}
          value={metrics.maxInterestRate.formatted}
          icon={<BarChart3 />}
          accent="text-violet-400"
          trend="up"
          subValue={t('maxProfitability')}
          sublabel={t('currentMonth')}
        />
      </div>
    </ExpandableMetricSection>
  );
}

interface SavingsGoalsSectionProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly locale: string;
  readonly t: Translator;
  readonly isMasked: boolean;
  readonly money: MoneyMasker;
}

function SavingsGoalsSection({
  metrics,
  lang,
  locale,
  t,
  isMasked,
  money,
}: SavingsGoalsSectionProps) {
  return (
    <ExpandableMetricSection
      title={t('savingsGoalsTitle')}
      icon={<Target className="w-5 h-5" />}
      defaultOpen={false}
      category="liquidity"
      maxHeightClass="max-h-[1600px]"
    >
      <div className="flex">
        <InlineMetric
          label={t('activeGoals')}
          value={String(metrics.activeSavingsGoals)}
          icon={<Target />}
          accent="text-emerald-400"
          trend="neutral"
          sublabel={t('currentMonth')}
        />
        <div className="flex-shrink-0 w-px bg-white/8 my-3" />
        <InlineMetric
          label={t('totalSaved')}
          value={metrics.totalSavedCents.formatted}
          icon={<PiggyBank />}
          accent="text-emerald-400"
          trend="up"
          subValue={formatPercent(metrics.savingsProgress, locale)}
          sublabel={t('overallProgress')}
          masked={isMasked}
        />
      </div>

      {metrics.savingsGoals.length === 0 ? (
        <div className="px-4 pb-4">
          <EmptyState
            icon={<Target className="w-10 h-10" />}
            title={t('noSavingsGoals')}
            description={t('noSavingsGoalsDesc')}
          />
        </div>
      ) : (
        <ul className="space-y-2 px-4 pb-4">
          {metrics.savingsGoals.map((goal) => {
            const progress = Math.min(100, Math.max(0, goal.progressPercentage));
            return (
              <li key={goal.id} className="rounded-lg bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-sm text-slate-200">{goal.name}</span>
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                      {goal.currency}
                    </span>
                  </span>
                  {goal.atRisk && (
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-300">
                      {t('goalAtRisk')}
                    </span>
                  )}
                </div>
                <progress
                  value={progress}
                  max={100}
                  aria-label={goal.name}
                  className={`mt-2 block h-1.5 w-full appearance-none overflow-hidden rounded-full bg-white/8 [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-white/8 [&::-moz-progress-bar]:rounded-full ${
                    goal.atRisk
                      ? '[&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-rose-400 [&::-moz-progress-bar]:bg-rose-400'
                      : '[&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-emerald-400 [&::-moz-progress-bar]:bg-emerald-400'
                  }`}
                />
                <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="tabular-nums">
                    {money(formatMoney(goal.currentAmountCents, goal.currency, locale))} /{' '}
                    {money(formatMoney(goal.targetAmountCents, goal.currency, locale))}
                  </span>
                  <span className="font-semibold text-slate-300 tabular-nums">
                    {formatPercent(goal.progressPercentage, locale)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-400">
                  {goal.deadline && (
                    <span>
                      {t('goalDeadline')}: {formatDateValue(goal.deadline, locale)}
                    </span>
                  )}
                  {goal.projectedCompletion && (
                    <span>
                      {t('goalProjected')}: {goal.projectedCompletion}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ModuleLink href={`/${lang}/savings`} label={t('viewSavings')} />
    </ExpandableMetricSection>
  );
}

interface DistributionSectionProps {
  readonly metrics: DashboardMetrics;
  readonly t: Translator;
  readonly locale: string;
}

interface DistributionLegendRowProps {
  readonly category: string;
  readonly color: string;
  readonly amountLabel: string;
  readonly percentageLabel: string;
}

/**
 * One read-only row of the asset/liability legend: color swatch, localized
 * category, formatted amount and share. Rendered as a `<li>` so both lists are
 * announced as lists by screen readers.
 */
function DistributionLegendRow({
  category,
  color,
  amountLabel,
  percentageLabel,
}: DistributionLegendRowProps) {
  return (
    <li className="group flex items-start justify-between gap-3 rounded-lg p-2 transition-colors hover:bg-white/5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full shadow-sm transition-transform group-hover:scale-125"
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words text-sm leading-5 text-slate-100 transition-colors group-hover:text-white">
          {category}
        </span>
      </div>
      <div className="flex shrink-0 items-start gap-2.5">
        <span className="text-sm font-medium leading-5 tabular-nums text-slate-100">
          {amountLabel}
        </span>
        <span className="w-14 text-right text-xs font-semibold leading-5 tabular-nums text-slate-300">
          {percentageLabel}
        </span>
      </div>
    </li>
  );
}

function DistributionSection({ metrics, t, locale }: DistributionSectionProps) {
  const currency = metrics.netWorthDistributionCurrency;

  // ASSETS pie slices (base currency, FX-converted server-side).
  const assets = useMemo(
    () =>
      metrics.netWorthDistribution.map((item) => ({
        ...item,
        category: t(item.categoryKey),
      })),
    [metrics.netWorthDistribution, t]
  );

  // LIABILITIES panel slices (never rendered inside the pie: a pie cannot express
  // a negative proportion).
  const liabilities = useMemo(
    () =>
      metrics.netWorthLiabilities.map((item) => ({
        ...item,
        category: t(item.categoryKey),
      })),
    [metrics.netWorthLiabilities, t]
  );

  const hasAssets = assets.length > 0;
  const hasLiabilities = liabilities.length > 0;

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 pt-4">
      <SectionHeader title={t('netWorthDistribution')} icon={<PieChart className="w-5 h-5" />} />
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-5 gap-6">
        <div className="min-w-0 lg:col-span-1 xl:col-span-3 app-shell rounded-2xl p-6 flex flex-col items-center justify-center min-h-[340px] border border-white/[0.08]">
          {hasAssets ? (
            <>
              <PieChartComponent
                data={assets}
                size={280}
                totalLabel={t('detailTotal')}
                detailsLabel={t('detailsOf')}
                hideLegend
                centerAmount={metrics.netWorthAssetsTotal.amount}
                centerLabel={t('totalAssets')}
                centerFormatted={metrics.netWorthAssetsTotal.formatted}
                locale={locale}
                currency={currency}
              />
              <p className="mt-3 text-center text-[11px] text-slate-300">
                {t('convertedToBase')} · {currency}
              </p>
            </>
          ) : (
            <EmptyState
              icon={<PieChart className="w-12 h-12" />}
              title={t('noData')}
              description={t('addAccountsToSeeDistribution')}
            />
          )}
        </div>

        <div className="min-w-0 lg:col-span-1 xl:col-span-2 space-y-3">
          {hasAssets && (
            <div className="app-shell rounded-2xl p-4 border border-white/[0.08]">
              <h4 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-widest">
                {t('assets')}
              </h4>
              <ul className="space-y-3" aria-label={t('assets')}>
                {assets.map((item) => (
                  <DistributionLegendRow
                    key={item.categoryKey}
                    category={item.category}
                    color={item.color}
                    amountLabel={formatMoney(item.amount, currency, locale)}
                    percentageLabel={formatPercent(item.percentage, locale)}
                  />
                ))}
              </ul>
            </div>
          )}

          {hasLiabilities && (
            <div className="app-shell rounded-2xl p-4 border border-white/[0.08]">
              <h4 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-widest">
                {t('liabilities')}
              </h4>
              <ul className="space-y-3" aria-label={t('liabilities')}>
                {liabilities.map((item) => (
                  <DistributionLegendRow
                    key={item.categoryKey}
                    category={item.category}
                    color={item.color}
                    amountLabel={formatMoney(item.amount, currency, locale)}
                    percentageLabel={formatPercent(item.percentage, locale)}
                  />
                ))}
              </ul>
            </div>
          )}

          {metrics.netWorthUnconverted && (
            <output className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs text-amber-300/90">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('unconvertedWarning')}</span>
            </output>
          )}

          <div className="app-shell rounded-2xl p-4 border border-white/[0.08]">
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">{t('totalAssets')}</dt>
                <dd className="font-semibold tabular-nums text-emerald-300">
                  {metrics.netWorthAssetsTotal.formatted}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-400">{t('totalLiabilities')}</dt>
                <dd className="font-semibold tabular-nums text-rose-300">
                  {metrics.netWorthLiabilitiesTotal.formatted}
                </dd>
              </div>
              {/* Highlighted total: same value as the hero (metrics.netWorth). */}
              <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2.5">
                <dt className="text-sm font-semibold text-blue-100">{t('netWorth')}</dt>
                <dd className="text-lg font-bold tabular-nums text-white">
                  {metrics.netWorth.formatted}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-300">
              {t('distributionNote')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

interface RecentTransactionsSectionProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly locale: string;
  readonly t: Translator;
  readonly onNewTransaction: () => void;
}

function RecentTransactionsSection({
  metrics,
  lang,
  locale,
  t,
  onNewTransaction,
}: RecentTransactionsSectionProps) {
  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 pt-4">
      <SectionHeader
        title={t('recentTransactions')}
        icon={<Wallet className="w-5 h-5" />}
        action={
          <Link
            href={`/${lang}/transactions`}
            className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
          >
            {t('viewAll')} <ArrowRight className="w-3 h-3" aria-hidden="true" />
          </Link>
        }
      />
      <div className="app-shell rounded-2xl p-6 border border-white/[0.08]">
        {metrics.recentTransactions.length > 0 ? (
          <TransactionList
            transactions={metrics.recentTransactions}
            locale={locale}
            emptyMessage={t('noTransactions')}
          />
        ) : (
          <EmptyState
            icon={<Wallet className="w-12 h-12" />}
            title={t('noTransactions')}
            description={t('startRecordingToSeeHere')}
            action={
              <Link
                href={`/${lang}/transactions`}
                onClick={(event) => {
                  // Preferred flow: open the create modal in place (no broken
                  // `/transactions/new` route). Kept as a real link so it still
                  // works without JS and remains keyboard/screen-reader friendly.
                  event.preventDefault();
                  onNewTransaction();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('newTransaction')}
              </Link>
            }
          />
        )}
      </div>
    </section>
  );
}

interface DashboardModalsProps {
  readonly allAccounts: AccountBrief[];
  readonly accounts: AccountBrief[];
  readonly categories: CategoryBrief[];
  readonly creditCards: CreditCardModel[];
  readonly transactionsDictionary: Record<string, unknown>;
  readonly creditCardsDictionary: Record<string, unknown>;
  readonly lang: Locale;
  readonly locale: string;
  readonly userId: string;
  readonly isTransferOpen: boolean;
  readonly isPayCardOpen: boolean;
  readonly onCloseTransfer: () => void;
  readonly onClosePayCard: () => void;
}

function DashboardModals({
  allAccounts,
  accounts,
  categories,
  creditCards,
  transactionsDictionary,
  creditCardsDictionary,
  lang,
  locale,
  userId,
  isTransferOpen,
  isPayCardOpen,
  onCloseTransfer,
  onClosePayCard,
}: DashboardModalsProps) {
  return (
    <>
      <CreateTransactionModal
        accounts={allAccounts}
        categories={categories}
        dictionary={transactionsDictionary}
        lang={lang}
        locale={locale}
      />
      <TransferModal
        open={isTransferOpen}
        accounts={accounts}
        userId={userId}
        dictionary={transactionsDictionary}
        locale={locale}
        onClose={onCloseTransfer}
      />
      <PayCreditCardModal
        open={isPayCardOpen}
        cards={creditCards}
        dictionary={creditCardsDictionary}
        locale={locale}
        onClose={onClosePayCard}
      />
    </>
  );
}

// ============================================================================
// Orchestrator
// ============================================================================

export function DashboardContent({
  metrics,
  lang,
  dashboard,
  transactionsDictionary,
  creditCardsDictionary,
  accounts,
  creditCards,
  categories,
  userId,
  locale,
}: DashboardContentProps) {
  const [isMasked, setIsMasked] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isPayCardOpen, setIsPayCardOpen] = useState(false);
  const openModal = useUIStore((s) => s.openModal);
  const addNotification = useUIStore((s) => s.addNotification);

  const t: Translator = useCallback((key: string) => get(dashboard, key), [dashboard]);
  const money = useCallback((formatted: string) => (isMasked ? MASK : formatted), [isMasked]);

  // Credit cards are offered as EXPENSE accounts in the transaction modal but
  // NEVER as transfer sources (the server rejects cards there).
  const cardBriefs = useMemo<AccountBrief[]>(
    () =>
      creditCards.map((card) => ({
        id: card.id,
        name: card.name,
        currency: card.currency,
        type: 'CREDIT_CARD',
        parentAccountId: null,
        balanceCents: card.balanceCents,
        creditLimitCents: card.creditLimitCents,
        availableCreditCents: card.availableCreditCents,
      })),
    [creditCards]
  );
  const allAccounts = useMemo(() => [...accounts, ...cardBriefs], [accounts, cardBriefs]);
  const hasAccounts = accounts.length > 0;
  // A transfer requires at least one valid pair per the pocket contract (the
  // server is the source of truth; this hides the shortcut when no pair exists).
  const canTransfer = useMemo(() => hasAnyValidPair(accounts), [accounts]);

  const openPayCard = useCallback(() => {
    if (creditCards.length === 0) return;
    if (creditCards.every((card) => card.debtCents <= 0)) {
      addNotification('info', get(transactionsDictionary, 'noDebtsToPay'));
      return;
    }
    setIsPayCardOpen(true);
  }, [creditCards, transactionsDictionary, addNotification]);

  const openNewTransaction = useCallback(() => openModal('create-transaction'), [openModal]);
  const toggleMask = useCallback(() => setIsMasked((value) => !value), []);
  const openTransfer = useCallback(() => setIsTransferOpen(true), []);
  const closeTransfer = useCallback(() => setIsTransferOpen(false), []);
  const closePayCard = useCallback(() => setIsPayCardOpen(false), []);
  const { byCurrency } = metrics;

  return (
    <div className="space-y-4 sm:space-y-6">
      <DashboardAlerts alerts={metrics.alerts} lang={lang} t={t} money={money} locale={locale} />

      <NetWorthSection
        metrics={metrics}
        buckets={byCurrency.netWorth}
        t={t}
        isMasked={isMasked}
        onToggleMask={toggleMask}
      />

      <CriticalIndicatorsSection metrics={metrics} lang={lang} t={t} isMasked={isMasked} />

      <QuickActionsSection
        t={t}
        lang={lang}
        hasAccounts={hasAccounts}
        canTransfer={canTransfer}
        hasCreditCards={creditCards.length > 0}
        onNewTransaction={openNewTransaction}
        onTransfer={openTransfer}
        onPayCard={openPayCard}
      />

      <LiquiditySection
        metrics={metrics}
        byCurrency={byCurrency}
        lang={lang}
        t={t}
        isMasked={isMasked}
      />

      <DebtsSection
        metrics={metrics}
        byCurrency={byCurrency}
        lang={lang}
        t={t}
        isMasked={isMasked}
      />

      <InvestmentsSection
        metrics={metrics}
        lang={lang}
        locale={locale}
        t={t}
        isMasked={isMasked}
        money={money}
      />

      <LoansSection
        metrics={metrics}
        lang={lang}
        locale={locale}
        t={t}
        isMasked={isMasked}
        money={money}
      />

      <CreditCardsSection
        metrics={metrics}
        lang={lang}
        locale={locale}
        t={t}
        isMasked={isMasked}
        money={money}
      />

      <ExpensesSection
        metrics={metrics}
        byCurrency={byCurrency}
        lang={lang}
        locale={locale}
        t={t}
        isMasked={isMasked}
        money={money}
      />

      <FxSection metrics={metrics} t={t} />

      <SavingsGoalsSection
        metrics={metrics}
        lang={lang}
        locale={locale}
        t={t}
        isMasked={isMasked}
        money={money}
      />

      <DistributionSection metrics={metrics} t={t} locale={locale} />

      <RecentTransactionsSection
        metrics={metrics}
        lang={lang}
        locale={locale}
        t={t}
        onNewTransaction={openNewTransaction}
      />

      <DashboardModals
        allAccounts={allAccounts}
        accounts={accounts}
        categories={categories}
        creditCards={creditCards}
        transactionsDictionary={transactionsDictionary}
        creditCardsDictionary={creditCardsDictionary}
        lang={lang}
        locale={locale}
        userId={userId}
        isTransferOpen={isTransferOpen}
        isPayCardOpen={isPayCardOpen}
        onCloseTransfer={closeTransfer}
        onClosePayCard={closePayCard}
      />
    </div>
  );
}
