/**
 * LoanDetailSkeleton — decorative loading placeholder for the loan detail route.
 *
 * `aria-hidden` so screen readers are not flooded with pulsing boxes; the
 * `role="status"` live region lives in the route's loading.tsx wrapper.
 */
export function LoanDetailSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn" aria-hidden="true">
      {/* Header skeleton */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-white/5 rounded-xl animate-pulse" />
          <div className="space-y-2">
            <div className="h-6 w-48 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-40 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-9 w-9 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-9 w-9 bg-white/5 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Summary skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-5">
            <div className="h-4 w-20 bg-white/5 rounded animate-pulse mb-3" />
            <div className="h-6 w-28 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Amortization table skeleton */}
      <div className="app-shell rounded-2xl p-5 space-y-3">
        <div className="h-5 w-40 bg-white/5 rounded animate-pulse" />
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />
        ))}
      </div>

      {/* Adjustments skeleton */}
      <div className="app-shell rounded-2xl p-5 space-y-3">
        <div className="h-5 w-28 bg-white/5 rounded animate-pulse" />
        <div className="h-16 bg-white/5 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}
