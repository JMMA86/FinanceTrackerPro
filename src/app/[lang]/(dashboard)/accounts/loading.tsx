export default function AccountsLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Bank accounts section */}
      <div className="space-y-4">
        <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="app-shell rounded-2xl p-6">
              <div className="h-5 w-32 bg-white/5 rounded mb-3 animate-pulse" />
              <div className="h-8 w-40 bg-white/5 rounded mb-2 animate-pulse" />
              <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* Credit cards section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-7 w-44 bg-white/5 rounded-xl animate-pulse" />
          <div className="h-9 w-36 bg-white/5 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="rounded-2xl animate-pulse" style={{ aspectRatio: '1.586' }}>
              <div className="w-full h-full rounded-2xl bg-white/5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
