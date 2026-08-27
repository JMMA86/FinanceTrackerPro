/**
 * Dashboard Skeleton Loading Component
 * Used with Suspense for Partial Prerendering (PPR)
 *
 * Provides instant static shell while financial data loads
 */

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Metric Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['metric-1', 'metric-2', 'metric-3', 'metric-4'].map((key) => (
          <div key={key} className="app-shell rounded-2xl p-6 animate-pulse">
            <div className="h-4 bg-gray-700 rounded w-24 mb-2" />
            <div className="h-8 bg-gray-700 rounded w-32 mb-2" />
            <div className="h-3 bg-gray-700 rounded w-16 mt-2" />
          </div>
        ))}
      </div>

      {/* Recent Transactions Skeleton */}
      <div className="app-shell rounded-2xl p-6">
        <div className="h-6 bg-gray-700 rounded w-48 mb-4" />
        <div className="space-y-3">
          {['tx-1', 'tx-2', 'tx-3', 'tx-4', 'tx-5'].map((key) => (
            <div key={key} className="flex justify-between py-2 border-b border-gray-700/50">
              <div>
                <div className="h-4 bg-gray-700 rounded w-32 mb-1" />
                <div className="h-3 bg-gray-700 rounded w-20" />
              </div>
              <div className="h-5 bg-gray-700 rounded w-20" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
