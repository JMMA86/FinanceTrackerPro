export default function TransactionsLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="h-10 w-48 bg-white/5 rounded-xl animate-pulse" />
      <div className="app-shell rounded-2xl p-6">
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-20 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
