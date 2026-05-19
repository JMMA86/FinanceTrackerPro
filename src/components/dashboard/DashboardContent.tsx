'use client';

import { useState } from 'react';
import Link from 'next/link';
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
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { PieChartComponent } from '@/components/dashboard/PieChartComponent';
import { ExpandableMetricSection } from '@/components/dashboard/ExpandableMetricSection';
import { InlineMetric } from '@/components/dashboard/InlineMetric';
import { SparklineChart } from '@/components/dashboard/SparklineChart';
import { TransactionList } from '@/components/transactions/TransactionList';
import { get } from '@/lib/i18n';
import type { DashboardMetrics } from '@/actions/dashboard.actions';
import type { Locale } from '@/lib/i18n';

interface DashboardContentProps {
  readonly metrics: DashboardMetrics;
  readonly lang: Locale;
  readonly dashboard: Record<string, unknown>;
}

const categoryColors: Record<string, {
  bg: string;
  border: string;
  glow: string;
  accent: string;
  accentBg: string;
}> = {
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

interface HeroMetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly subValue?: string;
  readonly trend?: 'up' | 'down' | 'neutral';
  readonly t: Translator;
  readonly masked?: boolean;
  readonly onToggleMask?: () => void;
}

function HeroMetricCard({ label, value, subValue, trend, t, masked = false, onToggleMask }: HeroMetricCardProps) {
  const getTrendStyles = (trendValue: 'up' | 'down' | 'neutral' | undefined) => {
    if (trendValue === 'up') return 'bg-emerald-500/15 text-emerald-300';
    if (trendValue === 'down') return 'bg-rose-500/15 text-rose-300';
    return 'bg-slate-500/10 text-slate-300';
  };
  const trendStyles = getTrendStyles(trend);

  return (
    <div className="
      group relative overflow-hidden rounded-2xl sm:rounded-3xl
      bg-gradient-to-br from-blue-600/25 via-blue-500/12 to-blue-700/8
      border border-blue-400/30
      p-5 sm:p-8 lg:p-12
      col-span-full
      hover:border-blue-300/40
      transition-all duration-700
      backdrop-blur-sm
    ">
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/15 rounded-full blur-[80px] group-hover:bg-blue-400/20 transition-all duration-1000" />
      <div className="absolute -bottom-32 -left-32 w-72 h-72 bg-blue-400/10 rounded-full blur-[60px]" />

      <div className="absolute top-0 right-0 w-32 h-32 opacity-30 group-hover:opacity-40 transition-opacity duration-500">
        <div className="absolute top-6 right-6 w-12 h-12 border-t-2 border-r-2 border-blue-400/60 rounded-tr-2xl" />
        <div className="absolute top-10 right-10 w-6 h-6 border-t border-r border-blue-300/40 rounded-tr" />
      </div>

      {onToggleMask && (
        <button
          onClick={onToggleMask}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20 p-2 sm:p-2.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 hover:text-blue-200 transition-all duration-200"
          aria-label={masked ? 'Show values' : 'Hide values'}
        >
          {masked ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
        </button>
      )}

      <div className="relative z-10">
        <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-5">
          <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl transition-all duration-300 ${categoryColors.executive.accentBg} ${categoryColors.executive.accent} group-hover:text-blue-300`}>
            <Wallet className="w-4 h-4 sm:w-6 sm:h-6" />
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
              {masked ? '***' : value}
            </p>
{subValue && (
              <div className={`inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-2 rounded-md sm:rounded-lg backdrop-blur-sm ${trendStyles}`}>
                {trend === 'up' && <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4" />}
                {trend === 'down' && <TrendingDown className="w-3 h-3 sm:w-4 sm:h-4" />}
                <span className="text-xs sm:text-sm font-semibold">{subValue}</span>
              </div>
            )}
          </div>

          <div className="hidden lg:flex flex-col items-end text-right">
            <div className="text-blue-400/60 text-sm font-medium mb-2">{t('estimatedWealth')}</div>
            <div className="flex items-center gap-2 text-blue-300">
              <Sparkles className="w-5 h-5 group-hover:animate-pulse" />
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
  readonly trend?: 'up' | 'down' | 'neutral';
  readonly sparklineData?: readonly number[];
  readonly t: Translator;
  readonly masked?: boolean;
}

function MetricCard({ label, value, subValue, category, icon, trend, sparklineData, t, masked = false }: MetricCardProps) {
  const colors = categoryColors[category] || categoryColors.executive;
  const trendColorMap: Record<string, string> = {
    up: 'emerald',
    down: 'rose',
    neutral: 'slate',
  };
  const trendColor = trendColorMap[trend ?? 'neutral'] ?? 'slate';

  return (
    <div className={`
      group relative overflow-hidden rounded-xl sm:rounded-2xl border ${colors.border} p-3 sm:p-5
      bg-gradient-to-br ${colors.bg} ${colors.glow}
      transition-all duration-400 ease-out
      transform hover:-translate-y-1
      backdrop-blur-sm
    `}>
      <div className="absolute -inset-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
        <div className={`absolute inset-0 rounded-2xl blur-2xl from-${trendColor}-500/20 to-transparent bg-gradient-to-br`} />
      </div>

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div className="flex-1 min-w-0 pr-2">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-0.5 truncate">
              {label}
            </span>
            <span className="text-[10px] sm:text-xs text-slate-500">{t('currentMonth')}</span>
          </div>
          <div className={`p-1.5 sm:p-2.5 rounded-lg sm:rounded-xl flex-shrink-0 transition-all duration-300 ${colors.accentBg} ${colors.accent} group-hover:scale-110`}>
            <span className="block [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-5 sm:[&>svg]:h-5">{icon}</span>
          </div>
        </div>

        <div className="mb-1 sm:mb-3">
          <div className="flex items-baseline justify-between mb-1 sm:mb-2">
            <p className="text-lg sm:text-2xl font-bold text-white tracking-tight leading-none">
              {masked ? '***' : value}
            </p>
            {sparklineData && <SparklineChart data={sparklineData} color={colors.accent} />}
          </div>

          {subValue && (
            <div className={`inline-flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1.5 rounded text-[10px] sm:text-xs font-semibold bg-${trendColor}-500/12 text-${trendColor}-300`}>
              {trend === 'up' && <TrendingUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
              {trend === 'down' && <TrendingDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
              {trend === 'neutral' && <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />}
              <span>{subValue}</span>
            </div>
          )}
        </div>
      </div>
    </div>
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
          <span className="block [&>svg]:w-4 [&>svg]:h-4 sm:[&>svg]:w-5 sm:[&>svg]:h-5">{icon}</span>
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
        <div className="relative p-4 rounded-2xl bg-blue-500/10 text-blue-400">
          {icon}
        </div>
      </div>
      <h4 className="text-lg font-medium text-white mb-2">{title}</h4>
      <p className="text-sm text-slate-400 max-w-xs mb-4">{description}</p>
      {action}
    </div>
  );
}

export function DashboardContent({ metrics, lang, dashboard }: DashboardContentProps) {
  const [isMasked, setIsMasked] = useState(false);
  const t = (key: string) => get(dashboard, key);

  const netWorthDistribution = metrics.netWorthDistribution.map((item) => ({
    ...item,
    category: t(item.categoryKey),
  }));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* TIER 1: Patrimonio */}
      <section className="animate-in fade-in slide-in-from-top-4 duration-700">
        <HeroMetricCard
          label={t('netWorth')}
          value={metrics.netWorth.formatted}
          subValue={metrics.savingsComparison.formatted}
          trend={metrics.savingsComparison.isPositive ? 'up' : 'down'}
          t={t}
          masked={isMasked}
          onToggleMask={() => setIsMasked(!isMasked)}
        />
      </section>
      {/* TIER 2: Indicadores Críticos */}
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
            sparklineData={metrics.sparklines.totalCash}
            masked={isMasked}
          />
          <MetricCard
            t={t}
            label={t('maxSpendable')}
            value={metrics.maxSpendable.formatted}
            category="executive"
            icon={<Calculator className="w-5 h-5" />}
            trend="neutral"
            subValue={t('thisMonth')}
            sparklineData={metrics.sparklines.maxSpendable}
            masked={isMasked}
          />
          <MetricCard
            t={t}
            label={t('savings')}
            value={metrics.savings.formatted}
            category="liquidity"
            icon={<PiggyBank className="w-5 h-5" />}
            trend="up"
            subValue={t('accumulated')}
            sparklineData={metrics.sparklines.savings}
            masked={isMasked}
          />
          <MetricCard
            t={t}
            label={t('debtsTotal')}
            value={metrics.creditCardDebt.formatted}
            category="debts"
            icon={<CreditCard className="w-5 h-5" />}
            trend={metrics.creditCardDebt.amount > 0 ? 'down' : 'neutral'}
            subValue={metrics.creditCardDebt.amount > 0 ? t('pending') : t('noDebts')}
            sparklineData={metrics.sparklines.creditCardDebt}
            masked={isMasked}
          />
        </div>
      </section>

      {/* TIER 3: Liquidez */}
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
            sparklineData={metrics.sparklines.savings}
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
            sparklineData={metrics.sparklines.receivables}
          />
        </div>
      </ExpandableMetricSection>

      {/* TIER 3: Deudas */}
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
            sparklineData={metrics.sparklines.creditCardDebt}
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
            sparklineData={metrics.sparklines.creditAvailable}
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
            sparklineData={metrics.sparklines.externalDebts}
          />
        </div>
      </ExpandableMetricSection>

      {/* TIER 3: Inversiones & Tasas */}
      <ExpandableMetricSection
        title={t('investments')}
        icon={<TrendingUp className="w-5 h-5" />}
        defaultOpen={false}
        category="investments"
      >
        <div className="flex">
          <InlineMetric
            label={t('investments')}
            value={metrics.investments.formatted}
            icon={<TrendingUp />}
            accent="text-violet-400"
            trend="up"
            subValue={t('invested')}
            sublabel={t('currentMonth')}
            sparklineData={metrics.sparklines.investments}
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
          <div className="flex-shrink-0 w-px bg-white/8 my-3" />
          <InlineMetric
            label={t('dollarRate')}
            value={metrics.dollarRate.formatted}
            icon={<DollarSign />}
            accent="text-violet-400"
            trend="neutral"
            subValue={t('currentRate')}
            sublabel={t('currentMonth')}
          />
        </div>
      </ExpandableMetricSection>

      {/* TIER 3: Gastos */}
      <ExpandableMetricSection
        title={t('expenses')}
        icon={<AlertCircle className="w-5 h-5" />}
        defaultOpen={false}
        category="expenses"
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
            sparklineData={metrics.sparklines.pendingFixedExpenses}
          />
        </div>
      </ExpandableMetricSection>

      {/* TIER 4: Distribución Patrimonial */}
      <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 pt-4">
        <SectionHeader
          title={t('netWorthDistribution')}
          icon={<PieChart className="w-5 h-5" />}
        />
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 app-shell rounded-2xl p-6 flex items-center justify-center min-h-[340px] border border-white/[0.08]">
            {netWorthDistribution.length > 0 ? (
              <PieChartComponent data={netWorthDistribution} size={280} />
            ) : (
              <EmptyState
                icon={<PieChart className="w-12 h-12" />}
                title={t('noData')}
                description={t('addAccountsToSeeDistribution')}
              />
            )}
          </div>

          <div className="lg:col-span-2 space-y-3">
            {netWorthDistribution.length > 0 && (
              <div className="app-shell rounded-2xl p-4 border border-white/[0.08]">
                <h4 className="text-xs font-semibold text-slate-400 mb-4 uppercase tracking-widest">
                  {t('byCategory')}
                </h4>
                <div className="space-y-3">
                  {netWorthDistribution.map((item) => (
                    <div
                      key={item.categoryKey}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-3 h-3 rounded-full shadow-sm group-hover:scale-125 transition-transform"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                          {item.category}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-white">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* TIER 5: Transacciones Recientes */}
      <section className="animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 pt-4">
        <SectionHeader
          title={t('recentTransactions')}
          icon={<Wallet className="w-5 h-5" />}
          action={
            <Link
              href={`/${lang}/transactions`}
              className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
            >
              {t('viewAll')} <ArrowRight className="w-3 h-3" />
            </Link>
          }
        />
        <div className="app-shell rounded-2xl p-6 border border-white/[0.08]">
          {metrics.recentTransactions.length > 0 ? (
            <TransactionList transactions={metrics.recentTransactions} />
          ) : (
            <EmptyState
              icon={<Wallet className="w-12 h-12" />}
              title={t('noTransactions')}
              description={t('startRecordingToSeeHere')}
              action={
                <Link
                  href={`/${lang}/transactions/new`}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  {t('newTransaction')}
                </Link>
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}
