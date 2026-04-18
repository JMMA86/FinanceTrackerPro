export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-theme-gradient">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric Cards */}
        <div className="app-shell rounded-2xl p-6">
          <p className="text-sm text-gray-400 mb-1">Balance Total</p>
          <p className="text-2xl font-bold text-white">$2,850,000</p>
          <p className="text-xs text-green-400 mt-2">+12.5%</p>
        </div>

        <div className="app-shell rounded-2xl p-6">
          <p className="text-sm text-gray-400 mb-1">Ingresos</p>
          <p className="text-2xl font-bold text-white">$5,000,000</p>
          <p className="text-xs text-green-400 mt-2">Este mes</p>
        </div>

        <div className="app-shell rounded-2xl p-6">
          <p className="text-sm text-gray-400 mb-1">Gastos</p>
          <p className="text-2xl font-bold text-white">$2,150,000</p>
          <p className="text-xs text-red-400 mt-2">-43% vs mes pasado</p>
        </div>

        <div className="app-shell rounded-2xl p-6">
          <p className="text-sm text-gray-400 mb-1">Inversiones</p>
          <p className="text-2xl font-bold text-white">$1,500 USD</p>
          <p className="text-xs text-blue-400 mt-2">Binance</p>
        </div>
      </div>

      {/* Placeholder for charts/transactions */}
      <div className="app-shell rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white mb-4">Transacciones Recientes</h2>
        <p className="text-gray-400">Conectando con la base de datos...</p>
      </div>
    </div>
  );
}
