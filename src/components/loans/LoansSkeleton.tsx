/**
 * LoansSkeleton — reusable loading placeholder for the loans module.
 *
 * Used by `src/app/[lang]/(dashboard)/loans/loading.tsx` for the route-level
 * loading state. Decorative content is `aria-hidden` so screen readers are not
 * flooded with pulsing boxes; the `aria-live` wrapper (role="status") belongs in
 * the consumer (see loading.tsx).
 */
export function LoansSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn" aria-hidden="true">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 bg-white/5 rounded-xl animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-32 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-56 bg-white/5 rounded animate-pulse" />
        </div>
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-5">
            <div className="h-4 w-20 bg-white/5 rounded animate-pulse mb-3" />
            <div className="h-7 w-28 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Loans grid skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
          <div className="h-7 w-32 bg-white/5 rounded-lg animate-pulse" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="app-shell rounded-2xl p-5 space-y-4">
              <div className="h-1.5 bg-white/5 rounded-full animate-pulse" />
              <div className="h-5 w-40 bg-white/5 rounded animate-pulse" />
              <div className="h-2.5 bg-white/5 rounded-full animate-pulse" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-8 bg-white/5 rounded animate-pulse" />
                <div className="h-8 bg-white/5 rounded animate-pulse" />
              </div>
              <div className="h-4 w-28 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
