'use client';

/**
 * Animated Background Component - Fintech Premium Style
 * Subtle grid, radial glow, floating financial symbols
 */

interface AnimatedBackgroundProps {
  minimal?: boolean;
}

export function AnimatedBackground({ minimal = false }: AnimatedBackgroundProps) {
  if (minimal) {
    return (
      <div className="absolute inset-0 overflow-hidden select-none">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(148, 163, 184, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.3) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }}
        />

        {/* Minimal financial symbols - very subtle */}
        <div className="absolute inset-0 text-white/10 font-light">
          <div className="absolute top-[15%] left-[20%] text-4xl animate-float-slower opacity-10">
            $
          </div>
          <div className="absolute top-[60%] right-[25%] text-3xl animate-float-slow opacity-8">
            €
          </div>
          <div className="absolute bottom-[30%] left-[70%] text-5xl animate-float-slower opacity-12">
            %
          </div>
          <div className="absolute top-[45%] left-[15%] text-3xl animate-float-slow opacity-10">
            ↑
          </div>
          <div className="absolute bottom-[20%] right-[20%] text-4xl animate-float-slower opacity-8">
            ₿
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-hidden select-none">
      {/* Grid pattern - subtle tech texture */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage: `linear-gradient(rgba(148, 163, 184, 0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(148, 163, 184, 0.3) 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
        }}
      />

      {/* Radial glow - electric blue behind main card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-blue-900/20 rounded-full blur-3xl" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-indigo-900/15 rounded-full blur-3xl" />

      {/* Financial symbols - elegant distribution */}
      <div className="absolute inset-0 font-light">
        {/* Layer 1 - Large symbols */}
        <div className="absolute top-[8%] left-[12%] text-6xl animate-float-slower text-blue-400/12">
          $
        </div>
        <div className="absolute top-[15%] right-[8%] text-7xl animate-float-slow text-blue-300/10">
          €
        </div>
        <div className="absolute bottom-[25%] left-[10%] text-6xl animate-float-slower text-white/15">
          £
        </div>
        <div className="absolute bottom-[15%] right-[15%] text-7xl animate-float-slow text-blue-400/12">
          ¥
        </div>

        {/* Layer 2 - Medium symbols */}
        <div className="absolute top-[35%] left-[25%] text-4xl animate-float-slow text-blue-300/10">
          ₿
        </div>
        <div className="absolute top-[25%] right-[30%] text-5xl animate-float-slower text-white/12">
          %
        </div>
        <div className="absolute bottom-[40%] left-[35%] text-4xl animate-float-slow text-blue-400/13">
          ↑
        </div>
        <div className="absolute bottom-[35%] right-[25%] text-5xl animate-float-slower text-blue-300/10">
          ↓
        </div>
        <div className="absolute top-[55%] right-[40%] text-4xl animate-float-slow text-white/10">
          ₹
        </div>

        {/* Layer 3 - Small symbols */}
        <div className="absolute top-[20%] left-[45%] text-3xl animate-float-slower text-white/8">
          $
        </div>
        <div className="absolute top-[65%] left-[15%] text-3xl animate-float-slow text-blue-300/8">
          €
        </div>
        <div className="absolute bottom-[50%] right-[10%] text-3xl animate-float-slower text-blue-400/8">
          %
        </div>
        <div className="absolute top-[45%] right-[50%] text-3xl animate-float-slow text-white/8">
          £
        </div>
        <div className="absolute bottom-[60%] left-[50%] text-3xl animate-float-slower text-blue-400/8">
          ¥
        </div>

        {/* Layer 4 - Extra small symbols for richness */}
        <div className="absolute top-[10%] left-[60%] text-2xl animate-float-slow text-white/5">
          ₿
        </div>
        <div className="absolute top-[70%] right-[45%] text-2xl animate-float-slower text-blue-400/6">
          ↑
        </div>
        <div className="absolute bottom-[20%] left-[70%] text-2xl animate-float-slow text-blue-300/5">
          $
        </div>
        <div className="absolute top-[40%] left-[5%] text-2xl animate-float-slower text-white/6">
          %
        </div>
        <div className="absolute bottom-[10%] right-[55%] text-2xl animate-float-slow text-blue-300/6">
          €
        </div>
        <div className="absolute top-[80%] left-[40%] text-2xl animate-float-slower text-white/5">
          ↓
        </div>
      </div>
    </div>
  );
}
