'use client';

import { get } from '@/lib/i18n';

interface DesktopAuthPanelProps {
  mode: 'login' | 'register';
  auth: Record<string, unknown>;
  onSwitchMode: (newMode: 'login' | 'register') => void;
}

export default function DesktopAuthPanel({
  mode,
  auth,
  onSwitchMode,
}: Readonly<DesktopAuthPanelProps>) {
  return (
    <div
      className="absolute top-0 w-1/2 h-full overflow-hidden z-20 pointer-events-auto bg-gradient-to-br from-blue-800 to-blue-950"
      style={{
        right: 0,
        transform: mode === 'register' ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 700ms cubic-bezier(0.4, 0.0, 0.2, 1)',
      }}
    >
      <div className="absolute inset-0 p-12 flex flex-col items-center justify-center text-white">
        <div className="relative z-10 text-center max-w-sm w-full">
          {/* Content wrapper for proper stacking */}
          <div className="relative h-80 mb-8">
            {/* Login mode content */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500"
              style={{
                opacity: mode === 'login' ? 1 : 0,
                pointerEvents: mode === 'login' ? 'auto' : 'none',
              }}
            >
              <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full mb-6">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <h2 className="text-4xl font-bold mb-4">{get(auth, 'register.newUserTitle')}</h2>
              <p className="text-gray-200 text-lg leading-relaxed">
                {get(auth, 'register.newUserDescription')}
              </p>
            </div>

            {/* Register mode content */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500"
              style={{
                opacity: mode === 'register' ? 1 : 0,
                pointerEvents: mode === 'register' ? 'auto' : 'none',
              }}
            >
              <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-sm rounded-full mb-6">
                <svg
                  className="w-10 h-10 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
              <h2 className="text-4xl font-bold mb-4">{get(auth, 'register.inviteTitle')}</h2>
              <p className="text-gray-200 text-lg leading-relaxed">
                {get(auth, 'register.inviteDescription')}
              </p>
            </div>
          </div>

          <button
            onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
            className="inline-block w-full max-w-xs bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3.5 px-8 rounded-xl transition-all duration-500 transform hover:scale-105 shadow-xl"
          >
            {mode === 'login'
              ? get(auth, 'register.newUserButton')
              : get(auth, 'register.inviteButton')}
          </button>
        </div>
      </div>
      {/* <FloatingSymbols /> */}
    </div>
  );
}
