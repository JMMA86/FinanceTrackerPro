export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Loading Header */}
      <div className="h-10 w-48 bg-white/5 rounded-xl animate-pulse" />

      {/* Loading Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-6">
            <div className="h-4 w-20 bg-white/5 rounded mb-2 animate-pulse" />
            <div className="h-8 w-32 bg-white/5 rounded mb-2 animate-pulse" />
            <div className="h-3 w-16 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>

      {/* Loading Content Block */}
      <div className="app-shell rounded-2xl p-6">
        <div className="h-6 w-40 bg-white/5 rounded mb-4 animate-pulse" />
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
