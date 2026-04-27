'use client';

/**
 * Animated Background Component - Fintech Premium Style
 * Subtle grid, radial glow, floating financial symbols
 */

interface AnimatedBackgroundProps {
  minimal?: boolean;
}

export function AnimatedBackground({ minimal = false }: Readonly<AnimatedBackgroundProps>) {
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

      {/* Financial symbols - moving particles */}
      <div className="absolute inset-0 font-light pointer-events-none">
        {/* Horizontal drifting particles - evenly distributed via negative delays */}
        <div
          className="absolute top-[10%] left-[-8%] text-5xl text-blue-400/10 blur-[1px]"
          style={{ animation: 'float 36s infinite ease-in-out', animationDelay: '0s' }}
        >
          $
        </div>
        <div
          className="absolute top-[18%] left-[-8%] text-5xl text-blue-300/10 blur-[1px]"
          style={{ animation: 'float 37s infinite ease-in-out', animationDelay: '-2.5s' }}
        >
          €
        </div>
        <div
          className="absolute top-[26%] left-[-8%] text-5xl text-white/12 blur-[1px]"
          style={{ animation: 'float 35s infinite ease-in-out', animationDelay: '-5s' }}
        >
          £
        </div>
        <div
          className="absolute top-[34%] left-[-8%] text-5xl text-blue-400/11 blur-[1px]"
          style={{ animation: 'float 38s infinite ease-in-out', animationDelay: '-7.5s' }}
        >
          ¥
        </div>
        <div
          className="absolute top-[42%] left-[-8%] text-5xl text-blue-300/10 blur-[1px]"
          style={{ animation: 'float 36s infinite ease-in-out', animationDelay: '-10s' }}
        >
          ₿
        </div>
        <div
          className="absolute top-[50%] left-[-8%] text-5xl text-white/11 blur-[1px]"
          style={{ animation: 'float 39s infinite ease-in-out', animationDelay: '-12.5s' }}
        >
          %
        </div>
        <div
          className="absolute top-[58%] left-[-8%] text-5xl text-blue-400/10 blur-[1px]"
          style={{ animation: 'float 34s infinite ease-in-out', animationDelay: '-15s' }}
        >
          ↑
        </div>
        <div
          className="absolute top-[66%] left-[-8%] text-5xl text-blue-300/12 blur-[1px]"
          style={{ animation: 'float 40s infinite ease-in-out', animationDelay: '-17.5s' }}
        >
          ↓
        </div>
        <div
          className="absolute top-[74%] left-[-8%] text-5xl text-white/10 blur-[1px]"
          style={{ animation: 'float 37s infinite ease-in-out', animationDelay: '-20s' }}
        >
          ₹
        </div>
        <div
          className="absolute top-[82%] left-[-8%] text-5xl text-blue-400/11 blur-[1px]"
          style={{ animation: 'float 38s infinite ease-in-out', animationDelay: '-22.5s' }}
        >
          ¢
        </div>
        <div
          className="absolute top-[14%] left-[-8%] text-5xl text-blue-300/11 blur-[1px]"
          style={{ animation: 'float 36s infinite ease-in-out', animationDelay: '-25s' }}
        >
          $
        </div>
        <div
          className="absolute top-[22%] left-[-8%] text-5xl text-white/10 blur-[1px]"
          style={{ animation: 'float 35s infinite ease-in-out', animationDelay: '-27.5s' }}
        >
          €
        </div>
        <div
          className="absolute top-[30%] left-[-8%] text-5xl text-blue-400/12 blur-[1px]"
          style={{ animation: 'float 39s infinite ease-in-out', animationDelay: '-30s' }}
        >
          ₿
        </div>
        <div
          className="absolute top-[46%] left-[-8%] text-5xl text-blue-300/10 blur-[1px]"
          style={{ animation: 'float 37s infinite ease-in-out', animationDelay: '-32.5s' }}
        >
          %
        </div>
        <div
          className="absolute top-[62%] left-[-8%] text-5xl text-white/11 blur-[1px]"
          style={{ animation: 'float 38s infinite ease-in-out', animationDelay: '-35s' }}
        >
          ↑
        </div>
      </div>
    </div>
  );
}
