/**
 * Pie Chart Component - Client Component
 * Uses useState for hover interaction
 *
 * Enhanced with premium animations and better tooltip
 */

'use client';

import { useState, useMemo, useEffect, useId } from 'react';
import { addCents, centsToDecimal } from '@/lib/money';

interface PieChartData {
  readonly category: string;
  readonly amount: number;
  readonly percentage: number;
  readonly color: string;
}

interface PieChartComponentProps {
  readonly data: readonly PieChartData[];
  readonly size?: number;
  /** Localized label rendered in the center above the total. */
  readonly totalLabel?: string;
  /** Localized prefix for the legend buttons' accessible name. */
  readonly detailsLabel?: string;
  /** BCP 47 locale used to format the total and tooltip amounts. */
  readonly locale?: string;
  /** ISO 4217 currency of the distribution slices (never assumed). */
  readonly currency?: string;
  /**
   * Optional integer-cents value rendered in the chart center. Defaults to the
   * sum of `data` amounts so existing callers keep showing the slice total. The
   * net-worth composition passes the net worth so the center reflects what the
   * user actually owns (assets − liabilities).
   */
  readonly centerAmount?: number;
  /** Localized label for the center value. Defaults to `totalLabel`. */
  readonly centerLabel?: string;
  /**
   * When `true`, the internal legend (the category buttons) is NOT rendered.
   * Callers that already render their own breakdown lists use this to avoid the
   * legend overlapping the donut. Defaults to `false` so existing callers keep
   * their legend.
   */
  readonly hideLegend?: boolean;
  /**
   * Optional pre-formatted center value. When provided it replaces the internal
   * `Intl.NumberFormat` output, letting callers match the server-side
   * `formatMoney` representation exactly (e.g. "Total de activos").
   */
  readonly centerFormatted?: string;
}

export function PieChartComponent({
  data,
  size = 220,
  totalLabel = 'Total',
  detailsLabel = 'Mostrar detalles de',
  locale = 'es-CO',
  currency = 'COP',
  centerAmount,
  centerLabel,
  hideLegend = false,
  centerFormatted,
}: PieChartComponentProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);

  // Stable, collision-free base for the legend buttons' accessible descriptions.
  const legendDescriptionIdBase = useId();

  const radius = size / 2 - 20;
  const innerRadius = radius * 0.55;

  // Calculate pie segments - use scan pattern with initial angle in accumulator
  const segments = useMemo(() => {
    // Use reduce with tuple accumulator: [results, currentAngle]
    const initialAngle = -90;

    return data.reduce<
      [
        Array<{
          category: string;
          amount: number;
          percentage: number;
          color: string;
          path: string;
          index: number;
        }>,
        number,
      ]
    >(
      ([segmentsAcc, currentAngle], item, index) => {
        const angle = (item.percentage / 100) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;

        // Calculate SVG arc path
        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const x1 = size / 2 + radius * Math.cos(startRad);
        const y1 = size / 2 + radius * Math.sin(startRad);
        const x2 = size / 2 + radius * Math.cos(endRad);
        const y2 = size / 2 + radius * Math.sin(endRad);

        const largeArc = angle > 180 ? 1 : 0;

        const path = `M ${size / 2} ${size / 2} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;

        segmentsAcc.push({ ...item, path, index });
        return [segmentsAcc, endAngle];
      },
      [[], initialAngle]
    )[0];
  }, [data, radius, size]);

  // Center text. Rule 1: integer cents are aggregated through Decimal.js —
  // never with native `+` (avoids IEEE-754 drift).
  const total = data.reduce((sum, item) => addCents(sum, item.amount), 0);

  // Optional overrides let callers show a semantic aggregate (e.g. net worth)
  // while the slices still describe the asset composition.
  const centerValue = centerAmount ?? total;
  const resolvedCenterLabel = centerLabel ?? totalLabel;

  // Trigger animation on mount (isAnimating starts as true; the timer ends it)
  useEffect(() => {
    if (data.length === 0) return;
    const timer = setTimeout(() => setIsAnimating(false), 600);
    return () => clearTimeout(timer);
  }, [data.length]);

  const formatCurrency = (cents: number) => {
    // Rule 1: convert cents → currency through Decimal.js, never `cents / 100`.
    const amount = centsToDecimal(cents).toNumber();
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Center value: callers may pass a pre-formatted string (server `formatMoney`)
  // so the donut center and the side panels/hero read identically.
  const centerDisplay = centerFormatted ?? formatCurrency(centerValue);

  return (
    <div className="relative flex items-center justify-center">
      <svg
        role="img"
        aria-label={`${resolvedCenterLabel}: ${centerDisplay}`}
        width={size}
        height={size}
        className="overflow-visible"
        style={{
          transform: isAnimating ? 'scale(0.8)' : 'scale(1)',
          opacity: isAnimating ? 0 : 1,
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
        }}
      >
        <title>{`${resolvedCenterLabel}: ${centerDisplay}`}</title>
        {/* Background circle with subtle glow */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={innerRadius + 10}
          fill="rgba(13, 28, 58, 0.6)"
          className="transition-all duration-300"
        />
        <circle cx={size / 2} cy={size / 2} r={innerRadius} fill="rgba(13, 28, 58, 0.85)" />

        {/* Segments with premium hover effects */}
        {segments.map((segment) => (
          <g key={segment.category}>
            {/* Glow effect behind segment */}
            {hoveredIndex === segment.index && (
              <path
                d={segment.path}
                fill={segment.color}
                opacity={0.2}
                r={2}
                style={{
                  filter: `blur(8px)`,
                }}
              />
            )}
            {/* Main segment */}
            <path
              d={segment.path}
              fill={segment.color}
              opacity={hoveredIndex === null || hoveredIndex === segment.index ? 1 : 0.6}
              className="transition-all duration-300 cursor-pointer"
              style={{
                filter:
                  hoveredIndex === segment.index
                    ? `drop-shadow(0 0 16px ${segment.color})`
                    : 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))',
              }}
              onMouseEnter={() => setHoveredIndex(segment.index)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          </g>
        ))}

        {/* Center text — high-contrast by default (not hover-dependent) */}
        <text
          x={size / 2}
          y={size / 2 - 6}
          textAnchor="middle"
          fill="#cbd5e1"
          className="text-[10px] font-medium uppercase tracking-wider"
        >
          {resolvedCenterLabel}
        </text>
        <text
          x={size / 2}
          y={size / 2 + 14}
          textAnchor="middle"
          fill="#f8fafc"
          className="text-base font-semibold"
        >
          {centerDisplay}
        </text>
      </svg>

      {/* Enhanced Tooltip */}
      {hoveredIndex !== null && (
        <div
          className="absolute top-full mt-3 left-1/2 -translate-x-1/2 bg-slate-900/98 border border-slate-700/50 rounded-xl px-4 py-3 shadow-2xl z-20 min-w-[140px]"
          style={{
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-2.5 h-2.5 rounded-full shadow-sm"
              style={{ backgroundColor: segments[hoveredIndex].color }}
            />
            <p className="text-white text-sm font-semibold">{segments[hoveredIndex].category}</p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-slate-200 text-xs tabular-nums">
              {formatCurrency(segments[hoveredIndex].amount)}
            </p>
            <p className="text-blue-300 text-sm font-bold tabular-nums">
              {segments[hoveredIndex].percentage.toFixed(1)}%
            </p>
          </div>
        </div>
      )}

      {/* Improved Legend - Positioned below on smaller screens.
          Hidden when the caller renders its own breakdown lists. */}
      {!hideLegend && (
        <div className="lg:absolute lg:-right-4 lg:top-1/2 lg:-translate-y-1/2 flex flex-wrap lg:flex-col gap-2 max-w-full lg:max-w-[140px] mt-4 lg:mt-0 px-2">
          {data.map((item, index) => {
            // WCAG 4.1.2: the accessible NAME stays exactly
            // "${detailsLabel} ${category}"; the amount/percentage travel in the
            // accessible DESCRIPTION so screen readers still announce them
            // without altering the button's name.
            const descriptionId = `${legendDescriptionIdBase}-legend-${index}`;
            return (
              <button
                type="button"
                key={item.category}
                aria-label={`${detailsLabel} ${item.category}`}
                aria-describedby={descriptionId}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all duration-200 cursor-pointer ${
                  hoveredIndex === index
                    ? 'bg-slate-800/90 scale-105 shadow-lg'
                    : 'hover:bg-slate-800/50'
                }`}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full shadow-sm"
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className={`text-xs truncate ${hoveredIndex === index ? 'text-white' : 'text-slate-300'}`}
                >
                  {item.category}
                </span>
                <span id={descriptionId} className="sr-only">
                  {formatCurrency(item.amount)}, {item.percentage.toFixed(1)}%
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
