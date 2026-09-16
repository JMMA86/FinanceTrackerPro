export function InvestmentsLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-9 w-40 bg-white/5 rounded-xl animate-pulse" />
        <div className="flex gap-3">
          <div className="h-10 w-36 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-10 w-44 bg-white/5 rounded-xl animate-pulse" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-5">
            <div className="h-4 w-24 bg-white/5 rounded animate-pulse mb-3" />
            <div className="h-7 w-32 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Account cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl overflow-hidden">
            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between">
                <div className="h-5 w-28 bg-white/5 rounded animate-pulse" />
                <div className="h-4 w-16 bg-white/5 rounded-full animate-pulse" />
              </div>
              <div className="h-8 w-36 bg-white/5 rounded animate-pulse" />
              <div className="h-3 w-20 bg-white/5 rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default InvestmentsLoading;
