export function SavingsLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 bg-white/5 rounded-xl animate-pulse" />
        <div className="space-y-2">
          <div className="h-6 w-32 bg-white/5 rounded animate-pulse" />
          <div className="h-4 w-48 bg-white/5 rounded animate-pulse" />
        </div>
      </div>

      {/* Summary cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-5">
            <div className="h-4 w-20 bg-white/5 rounded animate-pulse mb-3" />
            <div className="h-7 w-28 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Goals grid skeleton */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            <div className="h-7 w-28 bg-white/5 rounded-lg animate-pulse" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="app-shell rounded-2xl p-5 space-y-4">
                <div className="h-1.5 bg-white/5 rounded-full animate-pulse" />
                <div className="h-5 w-32 bg-white/5 rounded animate-pulse" />
                <div className="h-2.5 bg-white/5 rounded-full animate-pulse" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-8 bg-white/5 rounded animate-pulse" />
                  <div className="h-8 bg-white/5 rounded animate-pulse" />
                </div>
                <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar skeleton */}
        <div className="space-y-4">
          <div className="app-shell rounded-2xl p-5">
            <div className="h-4 w-36 bg-white/5 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-8 bg-white/5 rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SavingsLoading;
