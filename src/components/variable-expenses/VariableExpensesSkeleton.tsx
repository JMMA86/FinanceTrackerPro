/**
 * VariableExpensesSkeleton — loading placeholder for the variable-expenses
 * module. Decorative content is `aria-hidden`; the polite live region lives in
 * the consumer (loading.tsx).
 */
export function VariableExpensesSkeleton() {
  return (
    <div className="space-y-6 animate-fadeIn" aria-hidden="true">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 bg-white/5 rounded-xl animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-40 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-56 bg-white/5 rounded animate-pulse" />
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-5">
            <div className="h-4 w-24 bg-white/5 rounded animate-pulse mb-3" />
            <div className="h-7 w-28 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Definitions list */}
      <div className="app-shell rounded-2xl p-5 space-y-3">
        <div className="h-4 w-32 bg-white/5 rounded animate-pulse" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
