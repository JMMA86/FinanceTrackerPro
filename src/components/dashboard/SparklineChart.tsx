'use client';

import { useMemo } from 'react';

interface SparklineChartProps {
  readonly data: readonly number[];
  readonly color?: string;
  readonly height?: number;
}

export function SparklineChart({ data, color = 'text-emerald-400', height = 24 }: SparklineChartProps) {
  const { points } = useMemo(() => {
    if (data.length === 0) return { points: [] };

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = ((max - value) / range) * 100;
      return { x, y, value };
    });

    return { points };
  }, [data]);

  if (points.length === 0) return null;

  // Build SVG path
  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="relative inline-flex items-center">
      <svg
        width={64}
        height={height}
        viewBox={`0 0 100 100`}
        preserveAspectRatio="none"
        className={`${color} opacity-70`}
      >
        {/* Gradient fill area */}
        <defs>
          <linearGradient id="sparkline-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Area under curve */}
        <path
          d={`${pathData} L 100 100 L 0 100 Z`}
          fill="url(#sparkline-gradient)"
        />

        {/* Line */}
        <path d={pathData} stroke="currentColor" strokeWidth="1.5" fill="none" vectorEffect="non-scaling-stroke" />

        {/* End point accent */}
        <circle cx={points.at(-1)?.x ?? 0} cy={points.at(-1)?.y ?? 0} r="1.5" fill="currentColor" />
      </svg>
    </div>
  );
}
