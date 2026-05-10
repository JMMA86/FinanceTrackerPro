import { ArrowUpDown } from 'lucide-react';
import { SparklineChart } from '@/components/dashboard/SparklineChart';

type Trend = 'up' | 'down' | 'neutral';

interface InlineMetricProps {
  readonly label: string;
  readonly value: string;
  readonly subValue?: string;
  readonly icon: React.ReactNode;
  readonly accent: string;
  readonly trend?: Trend;
  readonly sparklineData?: readonly number[];
  readonly masked?: boolean;
  readonly sublabel?: string;
}

export function InlineMetric({
  label,
  value,
  subValue,
  icon,
  accent,
  trend = 'neutral',
  sparklineData,
  masked = false,
  sublabel,
}: InlineMetricProps) {
  const trendColorMap: Record<Trend, string> = {
    up: 'text-emerald-400',
    down: 'text-rose-400',
    neutral: 'text-slate-400',
  };
  const trendColor = trendColorMap[trend];

  return (
    <div className="flex-1 min-w-0 px-3 sm:px-4 py-3 sm:py-4">
      {/* Label row */}
      <div className="flex items-start justify-between gap-1 mb-1">
        <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider leading-tight">
          {label}
        </span>
        <span className={`flex-shrink-0 ${accent} [&>svg]:w-3.5 [&>svg]:h-3.5 sm:[&>svg]:w-4 sm:[&>svg]:h-4`}>
          {icon}
        </span>
      </div>

      {/* Sublabel */}
      {sublabel && (
        <span className="text-[10px] text-slate-500 block mb-1.5">{sublabel}</span>
      )}

      {/* Value + sparkline */}
      <div className="flex items-end justify-between gap-1 mb-1 sm:mb-2">
        <p className="text-base sm:text-xl font-bold text-white tracking-tight leading-none">
          {masked ? '***' : value}
        </p>
        {sparklineData && <SparklineChart data={sparklineData} color={accent} />}
      </div>

      {/* Sub-value badge */}
      {subValue && (
        <div className={`inline-flex items-center gap-1 text-[10px] sm:text-xs font-medium ${trendColor}`}>
          {trend === 'up' && <ArrowUpDown className="w-2.5 h-2.5 rotate-180" />}
          {trend === 'down' && <ArrowUpDown className="w-2.5 h-2.5" />}
          {trend === 'neutral' && <span className="w-1.5 h-1.5 rounded-full bg-slate-500 inline-block" />}
          <span>{subValue}</span>
        </div>
      )}
    </div>
  );
}
