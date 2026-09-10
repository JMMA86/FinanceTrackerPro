'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { RefreshCw, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { getInvestmentPerformance } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';
import { formatMoney } from '@/lib/money';

interface PortfolioPerformanceChartProps {
  accountId: string;
  dictionary: Record<string, unknown>;
  locale?: string;
}

interface PerformanceData {
  accountId: string;
  name: string;
  currency: string;
  totalInvestedCents: number;
  cashBalanceCents: number;
  holdingsMarketValueCents: number;
  totalValueCents: number;
  totalReturnCents: number;
  totalReturnPct: number;
  series: Array<{ date: Date | string; investedCents: number }>;
}

// Chart geometry (viewBox units, not pixels).
// Wide 1000x320 viewBox + `w-full h-auto` lets the SVG fill the card width while
// keeping a comfortable visual height (~h-64/h-72 on desktop). The default
// preserveAspectRatio matches the box because `h-auto` derives the height from
// the viewBox aspect ratio.
const W = 1000;
const H = 320;
const PAD = { top: 24, right: 20, bottom: 40, left: 78 };
const CHART_W = W - PAD.left - PAD.right;
const CHART_H = H - PAD.top - PAD.bottom;
const GRID_COUNT = 5;
const TICK_COUNT = 6;

interface ChartPoint {
  x: number;
  y: number;
  date: Date | string;
  investedCents: number;
  ts: number;
}

interface ChartGeometry {
  points: ChartPoint[];
  linePath: string;
  areaPath: string;
  currentY: number;
  yMax: number;
  gridlines: Array<{ y: number; value: number }>;
  ticks: Array<{ x: number; ts: number }>;
  hasMultiplePoints: boolean;
}

function buildChart(
  series: Array<{ date: Date | string; investedCents: number }>,
  currentValue: number
): ChartGeometry {
  const t0 = new Date(series[0].date).getTime();
  const t1 = new Date(series.at(-1)!.date).getTime();
  const span = Math.max(t1 - t0, 1);

  const investedMax = Math.max(...series.map((p) => p.investedCents), 0);
  const yMax = Math.max(investedMax, currentValue, 1);
  const yMin = 0;

  // X is proportional to the real timestamp so the dates "line up" with the data.
  const points: ChartPoint[] = series.map((p) => {
    const ts = new Date(p.date).getTime();
    const x = PAD.left + ((ts - t0) / span) * CHART_W;
    const y = PAD.top + CHART_H - ((p.investedCents - yMin) / (yMax - yMin)) * CHART_H;
    return { x, y, date: p.date, investedCents: p.investedCents, ts };
  });

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points.at(-1)!.x.toFixed(2)} ${(PAD.top + CHART_H).toFixed(
          2
        )} L ${points[0].x.toFixed(2)} ${(PAD.top + CHART_H).toFixed(2)} Z`
      : '';

  const currentY =
    PAD.top + CHART_H - ((Math.min(currentValue, yMax) - yMin) / (yMax - yMin)) * CHART_H;

  // 5 horizontal gridlines (0 … yMax) with money labels.
  const gridlines = Array.from({ length: GRID_COUNT }, (_, i) => {
    const fraction = i / (GRID_COUNT - 1);
    return {
      y: PAD.top + CHART_H - fraction * CHART_H,
      value: yMin + fraction * (yMax - yMin),
    };
  });

  // 6 date ticks, evenly spaced in time.
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const ts = t0 + (span * i) / (TICK_COUNT - 1);
    return { x: PAD.left + ((ts - t0) / span) * CHART_W, ts };
  });

  return {
    points,
    linePath,
    areaPath,
    currentY,
    yMax,
    gridlines,
    ticks,
    hasMultiplePoints: points.length > 1,
  };
}

export function PortfolioPerformanceChart({
  accountId,
  dictionary,
  locale = 'es-CO',
}: Readonly<PortfolioPerformanceChartProps>) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PerformanceData | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      setHoverIndex(null);
      try {
        const res = await getInvestmentPerformance({ accountId });
        if (cancelled) return;
        if (res.success && res.data) {
          setData(res.data as PerformanceData);
        } else {
          setError(get(dictionary, 'errors.loadFailed'));
        }
      } catch {
        if (!cancelled) setError(get(dictionary, 'errors.loadFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accountId, dictionary]);

  const chart = useMemo(() => {
    if (!data || data.series.length === 0) return null;
    return buildChart(data.series, data.totalValueCents);
  }, [data]);

  // Convert the pointer position to viewBox coordinates and select the closest point.
  const handlePointerMove = useCallback(
    (clientX: number) => {
      const svgEl = svgRef.current;
      if (!svgEl || !chart || chart.points.length === 0) return;
      const rect = svgEl.getBoundingClientRect();
      if (rect.width <= 0) return;
      const vbX = ((clientX - rect.left) / rect.width) * W;
      let nearest = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let i = 0; i < chart.points.length; i++) {
        const dist = Math.abs(chart.points[i].x - vbX);
        if (dist < best) {
          best = dist;
          nearest = i;
        }
      }
      setHoverIndex(nearest);
    },
    [chart]
  );

  const handleMouseMove = useCallback(
    (e: ReactMouseEvent<SVGSVGElement>) => handlePointerMove(e.clientX),
    [handlePointerMove]
  );

  const handleTouchMove = useCallback(
    (e: ReactTouchEvent<SVGSVGElement>) => {
      const touch = e.touches[0];
      if (touch) handlePointerMove(touch.clientX);
    },
    [handlePointerMove]
  );

  const handleMouseLeave = useCallback(() => setHoverIndex(null), []);

  if (loading) {
    return (
      <div className="app-shell rounded-2xl py-8 flex items-center justify-center gap-2 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin" aria-hidden="true" />
        <span className="text-sm">{get(dictionary, 'loadingPerformance')}</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="app-shell rounded-2xl py-8 flex items-center justify-center gap-2 text-red-400">
        <AlertCircle className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm">{error ?? get(dictionary, 'errors.loadFailed')}</span>
      </div>
    );
  }

  const isPositive = data.totalReturnCents >= 0;
  const ReturnIcon = isPositive ? TrendingUp : TrendingDown;
  const hovered = hoverIndex !== null && chart ? (chart.points[hoverIndex] ?? null) : null;

  return (
    <div className="app-shell rounded-2xl p-5">
      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
            {get(dictionary, 'totalInvested')}
          </p>
          <p className="text-base font-bold text-white tabular-nums">
            {formatMoney(data.totalInvestedCents, data.currency, locale)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
            {get(dictionary, 'totalMarketValue')}
          </p>
          <p className="text-base font-bold text-white tabular-nums">
            {formatMoney(data.totalValueCents, data.currency, locale)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
            {get(dictionary, 'totalReturn')}
          </p>
          <p
            className={`text-base font-bold tabular-nums inline-flex items-center gap-1.5 ${
              isPositive ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            <ReturnIcon className="w-4 h-4" aria-hidden="true" />
            {isPositive ? '+' : ''}
            {formatMoney(data.totalReturnCents, data.currency, locale)}
            <span className="text-xs font-semibold opacity-80">
              ({isPositive ? '+' : ''}
              {data.totalReturnPct.toFixed(2)}%)
            </span>
          </p>
        </div>
      </div>

      {/* SVG area chart */}
      {chart && chart.points.length > 0 ? (
        <div className="relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            role="img"
            aria-label={get(dictionary, 'performance')}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onTouchMove={handleTouchMove}
            onTouchStart={handleTouchMove}
          >
            <defs>
              <linearGradient id={`perf-grad-${accountId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.45" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Horizontal gridlines + amount labels */}
            {chart.gridlines.map((gl) => (
              <g key={gl.value}>
                <line
                  x1={PAD.left}
                  y1={gl.y}
                  x2={PAD.left + CHART_W}
                  y2={gl.y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <text
                  x={PAD.left - 10}
                  y={gl.y + 3.5}
                  textAnchor="end"
                  className="fill-slate-500 text-[11px] font-medium tabular-nums"
                >
                  {formatMoney(Math.round(gl.value), data.currency, locale)}
                </text>
              </g>
            ))}

            {/* Area */}
            <path d={chart.areaPath} fill={`url(#perf-grad-${accountId})`} />
            {/* Invested line */}
            <path
              d={chart.linePath}
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Current value dashed line */}
            <line
              x1={PAD.left}
              y1={chart.currentY}
              x2={PAD.left + CHART_W}
              y2={chart.currentY}
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
            <text
              x={PAD.left + CHART_W - 6}
              y={chart.currentY - 6}
              textAnchor="end"
              className="fill-white/60 text-[11px] font-semibold tabular-nums"
            >
              {formatMoney(data.totalValueCents, data.currency, locale)}
            </text>

            {/* Endpoint dots */}
            <circle
              cx={chart.points[0].x}
              cy={chart.points[0].y}
              r="3.5"
              fill="#8b5cf6"
              stroke="#fff"
              strokeWidth="1"
            />
            <circle
              cx={chart.points.at(-1)!.x}
              cy={chart.points.at(-1)!.y}
              r="3.5"
              fill="#a78bfa"
              stroke="#fff"
              strokeWidth="1"
            />

            {/* Hover guide line + highlighted point */}
            {hovered && (
              <g>
                <line
                  x1={hovered.x}
                  y1={PAD.top}
                  x2={hovered.x}
                  y2={PAD.top + CHART_H}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <circle
                  cx={hovered.x}
                  cy={hovered.y}
                  r="5"
                  fill="#a78bfa"
                  stroke="#fff"
                  strokeWidth="1.5"
                />
              </g>
            )}

            {/* Date ticks (proportional to time) */}
            {chart.hasMultiplePoints &&
              chart.ticks.map((tick, i) => {
                let textAnchor: 'start' | 'middle' | 'end' = 'middle';
                if (i === 0) {
                  textAnchor = 'start';
                } else if (i === chart.ticks.length - 1) {
                  textAnchor = 'end';
                }
                return (
                  <text
                    key={`${tick.ts}-${i}`}
                    x={tick.x}
                    y={H - 12}
                    textAnchor={textAnchor}
                    className="fill-slate-400 text-[10px] font-medium"
                  >
                    {new Date(tick.ts).toLocaleDateString(locale, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </text>
                );
              })}
          </svg>

          {/* Hover tooltip (date + invested amount) */}
          {hovered && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg border border-white/10 bg-slate-900/95 px-2.5 py-1.5 shadow-xl -translate-x-1/2 -translate-y-full"
              style={{
                left: `${Math.min(Math.max((hovered.x / W) * 100, 14), 86)}%`,
                top: `${Math.min(Math.max((hovered.y / H) * 100, 20), 80)}%`,
              }}
            >
              <p className="text-[11px] font-medium text-slate-300">
                {new Date(hovered.date).toLocaleDateString(locale, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </p>
              <p className="text-xs font-bold text-white tabular-nums">
                {get(dictionary, 'investedLabel')}:{' '}
                {formatMoney(hovered.investedCents, data.currency, locale)}
              </p>
            </div>
          )}

          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 px-1 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500" aria-hidden="true" />
              {get(dictionary, 'totalInvested')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 border-t-2 border-dashed border-white/50" aria-hidden="true" />
              {get(dictionary, 'totalMarketValue')}:{' '}
              <span className="text-white font-medium tabular-nums">
                {formatMoney(data.totalValueCents, data.currency, locale)}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="py-6 text-center text-sm text-slate-500">
          {get(dictionary, 'noTransactions')}
        </div>
      )}
    </div>
  );
}
