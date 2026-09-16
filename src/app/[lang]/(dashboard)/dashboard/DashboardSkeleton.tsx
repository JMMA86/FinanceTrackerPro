/**
 * Dashboard Skeleton Loading Component
 * Used with Suspense for Partial Prerendering (PPR)
 *
 * Mirrors the real dashboard layout (alerts → hero → metric cards → module
 * sections → distribution chart → recent transactions) to minimise CLS while
 * financial data streams in.
 */

export function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-hidden="true">
      {/* TIER 1: Patrimonio (hero) */}
      <div className="app-shell h-48 sm:h-56 rounded-2xl sm:rounded-3xl animate-pulse" />

      {/* TIER 2: Indicadores críticos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
        {['metric-1', 'metric-2', 'metric-3', 'metric-4'].map((key) => (
          <div key={key} className="app-shell rounded-xl sm:rounded-2xl p-3 sm:p-5 animate-pulse">
            <div className="h-3 bg-gray-700 rounded w-20 mb-3" />
            <div className="h-6 bg-gray-700 rounded w-24 mb-3" />
            <div className="h-3 bg-gray-700 rounded w-14" />
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 animate-pulse">
        {['action-1', 'action-2', 'action-3', 'action-4'].map((key) => (
          <div key={key} className="h-9 w-32 rounded-xl bg-gray-700/70" />
        ))}
      </div>

      {/* Module sections */}
      {['section-1', 'section-2', 'section-3'].map((key) => (
        <div key={key} className="app-shell rounded-xl sm:rounded-2xl animate-pulse">
          <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5">
            <div className="h-8 w-8 rounded-md bg-gray-700" />
            <div className="h-4 w-32 rounded bg-gray-700" />
          </div>
          <div className="border-t border-white/6 px-4 py-4">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-gray-700" />
                <div className="h-5 w-28 rounded bg-gray-700" />
              </div>
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-gray-700" />
                <div className="h-5 w-28 rounded bg-gray-700" />
              </div>
              <div className="hidden sm:block flex-1 space-y-2">
                <div className="h-3 w-24 rounded bg-gray-700" />
                <div className="h-5 w-28 rounded bg-gray-700" />
              </div>
            </div>
          </div>
        </div>
      ))}

      {/* Distribución patrimonial */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 pt-4">
        <div className="lg:col-span-3 app-shell rounded-2xl p-6 min-h-[340px] flex items-center justify-center animate-pulse">
          <div className="h-[280px] w-[280px] rounded-full bg-gray-700/60" />
        </div>
        <div className="lg:col-span-2 app-shell rounded-2xl p-4 animate-pulse">
          <div className="h-4 w-28 rounded bg-gray-700 mb-4" />
          {['cat-1', 'cat-2', 'cat-3'].map((key) => (
            <div key={key} className="flex items-center justify-between py-2">
              <div className="h-3 w-24 rounded bg-gray-700" />
              <div className="h-3 w-10 rounded bg-gray-700" />
            </div>
          ))}
        </div>
      </div>

      {/* Transacciones recientes */}
      <div className="app-shell rounded-2xl p-6 animate-pulse">
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
