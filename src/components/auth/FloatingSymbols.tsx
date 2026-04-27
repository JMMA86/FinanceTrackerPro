'use client';

export default function FloatingSymbols() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      <div className="absolute text-6xl text-white/20 top-10 left-10 animate-float-vertical font-bold blur-sm">
        $
      </div>
      <div
        className="absolute text-6xl text-white/20 top-20 right-20 animate-float-vertical font-bold blur-sm"
        style={{ animationDelay: '1s' }}
      >
        €
      </div>
      <div
        className="absolute text-6xl text-white/20 bottom-20 left-20 animate-float-vertical font-bold blur-sm"
        style={{ animationDelay: '2s' }}
      >
        £
      </div>
      <div
        className="absolute text-6xl text-white/20 top-1/2 right-1/3 animate-float-vertical font-bold blur-sm"
        style={{ animationDelay: '3s' }}
      >
        ¥
      </div>
      <div
        className="absolute text-6xl text-white/20 bottom-1/3 right-10 animate-float-vertical font-bold blur-sm"
        style={{ animationDelay: '0.5s' }}
      >
        ₿
      </div>
      <div
        className="absolute text-5xl text-white/20 top-1/3 left-1/2 animate-float-vertical font-bold blur-sm"
        style={{ animationDelay: '1.5s' }}
      >
        ₹
      </div>
      <div
        className="absolute text-6xl text-white/20 top-1/4 left-1/4 animate-float-vertical font-bold blur-sm"
        style={{ animationDelay: '2.5s' }}
      >
        ¢
      </div>
      <div
        className="absolute text-5xl text-white/20 bottom-1/4 right-1/4 animate-float-vertical font-bold blur-sm"
        style={{ animationDelay: '3s' }}
      >
        ₩
      </div>
    </div>
  );
}
