import type { LandingStatsContent } from './types';

interface LandingStatsProps {
  stats: LandingStatsContent;
}

export function LandingStats({ stats }: Readonly<LandingStatsProps>) {
  return (
    <section
      aria-labelledby="stats-title"
      className="border-y border-white/10 bg-slate-950/40 backdrop-blur-sm"
    >
      <h2 id="stats-title" className="sr-only">
        {stats.title}
      </h2>
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-8 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
        {stats.items.map((item) => (
          <div key={item.label} className="text-center">
            <p className="text-2xl font-bold tracking-tight text-theme-gradient sm:text-3xl">
              {item.value}
            </p>
            <p className="mt-2 text-xs leading-snug text-slate-400 sm:text-sm">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
