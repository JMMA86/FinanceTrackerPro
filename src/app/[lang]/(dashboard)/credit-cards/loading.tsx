export default function CreditCardsLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="h-10 w-40 bg-white/5 rounded-xl animate-pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="app-shell rounded-2xl p-6">
            <div className="h-6 w-32 bg-white/5 rounded mb-4 animate-pulse" />
            <div className="h-48 bg-white/5 rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
