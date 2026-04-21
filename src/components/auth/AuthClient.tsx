'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, registerAction } from '@/actions/auth.actions';
import { AnimatedBackground } from '@/components/auth/AnimatedBackground';
import FloatingSymbols from '@/components/auth/FloatingSymbols';
import RegisterForm from '@/components/auth/RegisterForm';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

const PASSWORD_REQUIREMENTS = [
  { id: 'min-length', test: (p: string) => p.length >= 8 },
  { id: 'uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', test: (p: string) => /\d/.test(p) },
];

interface AuthClientProps {
  lang: Locale;
  auth: Record<string, unknown>;
  common: Record<string, unknown>;
  initialMode: 'login' | 'register';
  isRegistered: boolean;
  redirectPath?: string;
}

export default function AuthClient({
  lang,
  auth,
  initialMode,
  isRegistered,
  redirectPath,
}: Readonly<AuthClientProps>) {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ name: '', email: '', password: '' });

  const success = isRegistered && mode === 'login' ? get(auth, 'login.successMessage') : '';

  const isRegisterValid = useMemo(() => {
    const allPasswordChecksPassed = PASSWORD_REQUIREMENTS.every((req) =>
      req.test(registerData.password)
    );
    return (
      registerData.name.trim().length >= 2 &&
      registerData.email.includes('@') &&
      registerData.password.length > 0 &&
      allPasswordChecksPassed
    );
  }, [registerData]);

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const result = await loginAction(loginData);

    if (result.success) {
      const redirect = redirectPath || `/${lang}/dashboard`;
      router.push(redirect);
    } else {
      setError(result.error || get(auth, 'errors.loginError'));
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const result = await registerAction(registerData);

    if (result.success) {
      router.push(`/${lang}/login?registered=true`);
    } else {
      setError(result.error || get(auth, 'errors.registerError'));
      setLoading(false);
    }
  }

  function switchMode(newMode: 'login' | 'register') {
    setMode(newMode);
    setError('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background - Fintech Premium */}
      <div className="absolute inset-0 bg-slate-950">
        {/* Grid texture layer */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `linear-gradient(rgba(37, 99, 235, 0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(37, 99, 235, 0.4) 1px, transparent 1px)`,
            backgroundSize: '50px 50px',
          }}
        />

        {/* Glow effects behind card */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-700/15 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-blue-900/12 rounded-full blur-[120px]" />

        <AnimatedBackground />
      </div>

      {/* Content */}
      <div className="w-full max-w-6xl relative z-10">
        {/* Desktop View - Overlapping Slide Animation */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl shadow-2xl shadow-black/50 border border-white/10 overflow-hidden backdrop-blur-sm">
          <div className="relative h-[800px] overflow-hidden">
            {/* Layer 1: Fixed Forms (z-10) */}
            {/* Login Form - Fixed Left */}
            <div
              className="absolute left-0 top-0 w-1/2 h-full bg-white dark:bg-gray-800 z-10 transition-opacity duration-500"
              style={{ opacity: mode === 'login' ? 1 : 0.3 }}
            >
              <div className="absolute inset-0 p-12 overflow-y-auto flex flex-col justify-center">
                <div className="mb-8">
                  <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                    {get(auth, 'login.subtitleDesktop')}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 text-lg">
                    {get(auth, 'login.subtitleDescDesktop')}
                  </p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {get(auth, 'login.email')}
                    </label>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50"
                      placeholder={get(auth, 'login.emailPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {get(auth, 'login.password')}
                    </label>
                    <input
                      type="password"
                      required
                      disabled={loading}
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50"
                      placeholder={get(auth, 'login.passwordPlaceholder')}
                    />
                  </div>

                  {success && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-4">
                      <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                        {success}
                      </p>
                    </div>
                  )}

                  {error && mode === 'login' && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                      <p className="text-sm text-red-800 dark:text-red-200 font-medium">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-br from-blue-800 to-blue-950 hover:from-blue-700 hover:to-blue-900 text-white font-semibold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg mt-6"
                  >
                    {loading ? get(auth, 'login.submitting') : get(auth, 'login.submit')}
                  </button>

                  <button
                    type="button"
                    className="w-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-semibold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2 mt-3"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                      />
                    </svg>
                    {get(auth, 'login.passkeyButton')}
                  </button>
                </form>
              </div>
            </div>

            {/* Register Form - Fixed Right */}
            <div
              className="absolute right-0 top-0 w-1/2 h-full bg-white dark:bg-gray-800 z-10 transition-opacity duration-500"
              style={{ opacity: mode === 'register' ? 1 : 0.3 }}
            >
              <div className="absolute inset-0 p-12 overflow-y-auto flex flex-col justify-center">
                <div className="mb-6">
                  <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                    {get(auth, 'register.title')}
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 text-lg">
                    {get(auth, 'register.subtitleDesktop')}
                  </p>
                </div>

                <RegisterForm
                  loading={loading}
                  error={mode === 'register' ? error : ''}
                  formData={registerData}
                  isFormValid={isRegisterValid}
                  isMobile={false}
                  onSubmit={handleRegisterSubmit}
                  onFieldChange={(field, value) =>
                    setRegisterData({ ...registerData, [field]: value })
                  }
                  labels={{
                    name: get(auth, 'register.name'),
                    namePlaceholder: get(auth, 'register.namePlaceholder'),
                    email: get(auth, 'register.email'),
                    emailPlaceholder: get(auth, 'register.emailPlaceholder'),
                    password: get(auth, 'register.password'),
                    passwordPlaceholder: get(auth, 'register.passwordPlaceholder'),
                    passwordRequirements: get(auth, 'register.passwordRequirements'),
                    passwordMinLength: get(auth, 'register.passwordMinLength'),
                    passwordUppercase: get(auth, 'register.passwordUppercase'),
                    passwordLowercase: get(auth, 'register.passwordLowercase'),
                    passwordNumber: get(auth, 'register.passwordNumber'),
                    submit: get(auth, 'register.submit'),
                    submitting: get(auth, 'register.submitting'),
                  }}
                />
              </div>
            </div>

            {/* Layer 2: Single Dynamic Panel (z-20) */}
            {/* Unified Panel - Slides from right to left, changes content */}
            <div
              className="absolute top-0 w-1/2 h-full overflow-hidden z-20 pointer-events-auto bg-gradient-to-br from-blue-800 to-blue-950"
              style={{
                right: 0,
                transform: mode === 'register' ? 'translateX(-100%)' : 'translateX(0)',
                transition: 'transform 700ms cubic-bezier(0.4, 0.0, 0.2, 1)',
              }}
            >
              <AnimatedBackground minimal />
              <FloatingSymbols />
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
                      <h2 className="text-4xl font-bold mb-4">
                        {get(auth, 'register.newUserTitle')}
                      </h2>
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
                      <h2 className="text-4xl font-bold mb-4">
                        {get(auth, 'register.inviteTitle')}
                      </h2>
                      <p className="text-gray-200 text-lg leading-relaxed">
                        {get(auth, 'register.inviteDescription')}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                    className="inline-block w-full max-w-xs bg-white hover:bg-gray-100 text-gray-900 font-semibold py-3.5 px-8 rounded-xl transition-all duration-500 transform hover:scale-105 shadow-xl"
                  >
                    {mode === 'login'
                      ? get(auth, 'register.newUserButton')
                      : get(auth, 'register.inviteButton')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile View - Animated toggle */}
        <div className="md:hidden bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-2xl shadow-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto">
          <div className="relative flex gap-2 mb-6 bg-gray-100 dark:bg-gray-700 p-1.5 rounded-xl">
            {/* Animated background */}
            <div
              className="absolute h-[calc(100%-12px)] bg-slate-700 rounded-lg transition-all duration-300 ease-in-out"
              style={{
                width: 'calc(50% - 6px)',
                left: mode === 'login' ? '6px' : 'calc(50% + 2px)',
              }}
            />

            <button
              onClick={() => switchMode('login')}
              className={`flex-1 py-2.5 px-4 rounded-lg font-semibold transition-colors duration-300 relative z-10 ${
                mode === 'login' ? 'text-white' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {get(auth, 'login.title')}
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`flex-1 py-2.5 px-4 rounded-lg font-semibold transition-colors duration-300 relative z-10 ${
                mode === 'register' ? 'text-white' : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {get(auth, 'register.title')}
            </button>
          </div>

          <div className="relative overflow-hidden">
            <div
              className="flex transition-transform duration-300 ease-in-out"
              style={{
                transform: mode === 'login' ? 'translateX(0)' : 'translateX(-100%)',
                width: '200%',
              }}
            >
              {/* Login form */}
              <div className="w-1/2 flex-shrink-0">
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {get(auth, 'login.email')}
                    </label>
                    <input
                      type="email"
                      required
                      disabled={loading}
                      value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                      className="w-full px-4 py-3 bg-white/70 dark:bg-gray-700/70 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-slate-500 dark:text-white"
                      placeholder={get(auth, 'login.emailPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                      {get(auth, 'login.password')}
                    </label>
                    <input
                      type="password"
                      required
                      disabled={loading}
                      value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                      className="w-full px-4 py-3 bg-white/70 dark:bg-gray-700/70 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-slate-500 dark:text-white"
                      placeholder={get(auth, 'login.passwordPlaceholder')}
                    />
                  </div>

                  {success && (
                    <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-xl p-3">
                      <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
                    </div>
                  )}

                  {error && (
                    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl p-3">
                      <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-br from-blue-800 to-blue-950 hover:from-blue-700 hover:to-blue-900 text-white font-semibold py-3 rounded-xl disabled:opacity-50 shadow-lg mt-6"
                  >
                    {loading ? get(auth, 'login.submitting') : get(auth, 'login.submit')}
                  </button>
                </form>
              </div>

              {/* Register form */}
              <div className="w-1/2 flex-shrink-0">
                <RegisterForm
                  loading={loading}
                  error={error}
                  formData={registerData}
                  isFormValid={isRegisterValid}
                  isMobile={true}
                  onSubmit={handleRegisterSubmit}
                  onFieldChange={(field, value) =>
                    setRegisterData({ ...registerData, [field]: value })
                  }
                  labels={{
                    name: get(auth, 'register.name'),
                    namePlaceholder: get(auth, 'register.namePlaceholder'),
                    email: get(auth, 'register.email'),
                    emailPlaceholder: get(auth, 'register.emailPlaceholder'),
                    password: get(auth, 'register.password'),
                    passwordPlaceholder: get(auth, 'register.passwordPlaceholder'),
                    passwordRequirements: get(auth, 'register.passwordRequirements'),
                    passwordMinLength: get(auth, 'register.passwordMinLength'),
                    passwordUppercase: get(auth, 'register.passwordUppercase'),
                    passwordLowercase: get(auth, 'register.passwordLowercase'),
                    passwordNumber: get(auth, 'register.passwordNumber'),
                    submit: get(auth, 'register.submit'),
                    submitting: get(auth, 'register.submitting'),
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
