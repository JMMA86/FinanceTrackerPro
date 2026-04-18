export default function AccountsLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="app-shell rounded-2xl p-6">
            <div className="h-5 w-32 bg-white/5 rounded mb-3 animate-pulse" />
            <div className="h-8 w-40 bg-white/5 rounded mb-2 animate-pulse" />
            <div className="h-4 w-24 bg-white/5 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
