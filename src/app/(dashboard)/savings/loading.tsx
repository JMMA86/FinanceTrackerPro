export default function SavingsLoading() {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse" />
      <div className="app-shell rounded-2xl p-6">
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-white/5 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
