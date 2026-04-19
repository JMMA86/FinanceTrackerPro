'use client';

/**
 * Login Page
 * Mobile-first with glassmorphism, desktop split-screen
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { loginAction } from '@/actions/auth.actions';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRegistered = searchParams.get('registered') === 'true';
  const success = isRegistered ? '¡Cuenta creada exitosamente! Por favor inicia sesión.' : '';

  async function handleSubmit(event: React.BaseSyntheticEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(event.currentTarget);
    const input = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    };

    const result = await loginAction(input);

    if (result.success) {
      const redirect = searchParams.get('redirect') || '/dashboard';
      router.push(redirect);
    } else {
      setError(result.error || 'Error al iniciar sesión');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradient with Geometric Shapes */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-400 via-blue-500 to-blue-800">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-900/30 rounded-full blur-3xl" />
        <div className="absolute top-20 left-10 w-32 h-32 border-2 border-white/20 rounded-full" />
        <div className="absolute bottom-32 right-20 w-24 h-24 border-2 border-white/10 rounded-lg rotate-45" />
      </div>

      {/* Content Container - Mobile glassmorphism, Desktop split */}
      <div className="w-full max-w-6xl relative z-10">
        {/* Mobile View - Glassmorphism Card */}
        <div className="md:hidden">
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-2xl shadow-2xl p-6 mx-4">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl mb-4">
                <svg
                  className="w-6 h-6 text-white"
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
              <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">
                Inicia Sesión
              </h1>
              <p className="text-gray-600 dark:text-gray-300">¡Bienvenido de nuevo!</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email-mobile"
                  className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                >
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  id="email-mobile"
                  name="email"
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 bg-white/70 dark:bg-gray-700/70 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50"
                  placeholder="Ingresa tu correo"
                />
              </div>

              <div>
                <label
                  htmlFor="password-mobile"
                  className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                >
                  Contraseña
                </label>
                <input
                  type="password"
                  id="password-mobile"
                  name="password"
                  required
                  disabled={loading}
                  className="w-full px-4 py-3 bg-white/70 dark:bg-gray-700/70 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50"
                  placeholder="Ingresa tu contraseña"
                />
              </div>

              {success && (
                <div className="bg-green-50/90 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-3">
                  <div className="flex items-start">
                    <svg
                      className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 mr-2 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                      {success}
                    </p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-50/90 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3">
                  <div className="flex items-start">
                    <svg
                      className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 mr-2 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <p className="text-sm text-red-800 dark:text-red-200 font-medium">{error}</p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Iniciando sesión...
                  </span>
                ) : (
                  'Iniciar Sesión'
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                ¿Eres nuevo?{' '}
                <Link
                  href="/register"
                  className="text-cyan-600 dark:text-cyan-400 font-semibold hover:underline"
                >
                  Crea una cuenta
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Desktop View - Split Screen */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden">
          <div className="grid md:grid-cols-2 min-h-[600px]">
            {/* Left Panel - Form */}
            <div className="p-12 flex flex-col justify-center bg-white dark:bg-gray-800">
              <div className="mb-8">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl mb-6">
                  <svg
                    className="w-7 h-7 text-white"
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
                <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-2">
                  Inicia Sesión en tu Cuenta
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  ¡Bienvenido de nuevo! Ingresa tus datos
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="email-desktop"
                    className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Correo Electrónico
                  </label>
                  <input
                    type="email"
                    id="email-desktop"
                    name="email"
                    required
                    disabled={loading}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50"
                    placeholder="Ingresa tu correo"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password-desktop"
                    className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Contraseña
                  </label>
                  <input
                    type="password"
                    id="password-desktop"
                    name="password"
                    required
                    disabled={loading}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50"
                    placeholder="Ingresa tu contraseña"
                  />
                </div>

                {success && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                    <div className="flex items-start">
                      <svg
                        className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5 mr-3 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                        {success}
                      </p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                    <div className="flex items-start">
                      <svg
                        className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 mr-3 flex-shrink-0"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p className="text-sm text-red-800 dark:text-red-200 font-medium">{error}</p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                >
                  {loading ? (
                    <span className="flex items-center justify-center">
                      <svg
                        className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Iniciando sesión...
                    </span>
                  ) : (
                    'Iniciar Sesión'
                  )}
                </button>
              </form>
            </div>

            {/* Right Panel - Invitation */}
            <div className="relative bg-gradient-to-br from-cyan-400 via-blue-500 to-blue-800 p-12 flex flex-col items-center justify-center text-white overflow-hidden">
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-10 right-10 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 left-10 w-96 h-96 bg-blue-900/30 rounded-full blur-3xl" />
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-white/20 rounded-full" />
                <div className="absolute top-20 left-20 w-32 h-32 border-4 border-white/10 rounded-lg rotate-12" />
                <div className="absolute bottom-32 right-32 w-24 h-24 bg-white/5 rounded-2xl rotate-45" />
              </div>

              <div className="relative z-10 text-center max-w-sm">
                <div className="mb-8">
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
                  <h2 className="text-4xl font-black mb-4">¿Eres Nuevo?</h2>
                  <p className="text-blue-50 text-lg leading-relaxed">
                    Regístrate y descubre una gran cantidad de oportunidades para gestionar tus
                    finanzas
                  </p>
                </div>

                <Link
                  href="/register"
                  className="inline-block w-full max-w-xs bg-white text-blue-700 hover:bg-blue-50 font-bold py-3.5 px-8 rounded-xl transition-all transform hover:scale-105 shadow-xl"
                >
                  Registrarse
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
