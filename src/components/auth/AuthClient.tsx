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

      {/* Mobile overlay for readability */}
      <div className="md:hidden absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] z-0" />

      {/* Content */}
      <div className="w-full max-w-6xl relative z-10 pointer-events-none">
        <div className="pointer-events-auto">
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
                        <p className="text-sm text-red-800 dark:text-red-200 font-medium">
                          {error}
                        </p>
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
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
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

          {/* Mobile View - Containerless Glassmorphism */}
          <div className="md:hidden w-full px-6 flex flex-col justify-center min-h-[calc(100vh-100px)]">
            {/* Title with crossfade */}
            <div className="mb-8 text-center relative">
              <div className="relative h-20">
                <h1
                  className={`absolute inset-0 text-3xl font-bold text-white transition-opacity duration-300 ${
                    mode === 'login' ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {get(auth, 'login.title')}
                </h1>
                <h1
                  className={`absolute inset-0 text-3xl font-bold text-white transition-opacity duration-300 ${
                    mode === 'register' ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {get(auth, 'register.title')}
                </h1>
              </div>
              <div className="relative h-12 mt-2">
                <p
                  className={`absolute inset-0 text-gray-300 text-sm transition-opacity duration-300 ${
                    mode === 'login' ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {get(auth, 'login.subtitleDescDesktop')}
                </p>
                <p
                  className={`absolute inset-0 text-gray-300 text-sm transition-opacity duration-300 ${
                    mode === 'register' ? 'opacity-100' : 'opacity-0'
                  }`}
                >
                  {get(auth, 'register.subtitleDesktop')}
                </p>
              </div>
            </div>

            {/* Unified morphing form */}
            <div className="space-y-4">
              <form onSubmit={mode === 'login' ? handleLoginSubmit : handleRegisterSubmit}>
                {/* Name field - morphs in for register */}
                <div
                  className="transition-all duration-300 overflow-hidden"
                  style={{
                    maxHeight: mode === 'register' ? '100px' : '0',
                    opacity: mode === 'register' ? 1 : 0,
                    marginBottom: mode === 'register' ? '16px' : '0',
                  }}
                >
                  <label className="block text-sm font-semibold text-gray-200 mb-2">
                    {get(auth, 'register.name')}
                  </label>
                  <input
                    type="text"
                    required={mode === 'register'}
                    disabled={loading}
                    value={registerData.name}
                    onChange={(e) => setRegisterData({ ...registerData, name: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-400 focus:bg-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder={get(auth, 'register.namePlaceholder')}
                  />
                </div>

                {/* Email field */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-200 mb-2">
                    {get(auth, 'login.email')}
                  </label>
                  <input
                    type="email"
                    required
                    disabled={loading}
                    value={mode === 'login' ? loginData.email : registerData.email}
                    onChange={(e) =>
                      mode === 'login'
                        ? setLoginData({ ...loginData, email: e.target.value })
                        : setRegisterData({ ...registerData, email: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-400 focus:bg-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder={get(auth, 'login.emailPlaceholder')}
                  />
                </div>

                {/* Password field */}
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-200 mb-2">
                    {get(auth, 'login.password')}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={mode === 'register' ? 8 : undefined}
                    disabled={loading}
                    value={mode === 'login' ? loginData.password : registerData.password}
                    onChange={(e) =>
                      mode === 'login'
                        ? setLoginData({ ...loginData, password: e.target.value })
                        : setRegisterData({ ...registerData, password: e.target.value })
                    }
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-400 focus:bg-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
                    placeholder={get(auth, 'login.passwordPlaceholder')}
                  />
                </div>

                {/* Password requirements - morphs in for register */}
                {mode === 'register' && registerData.password && (
                  <div
                    className="mb-4 transition-all duration-300"
                    style={{
                      maxHeight: mode === 'register' && registerData.password ? '200px' : '0',
                      opacity: mode === 'register' && registerData.password ? 1 : 0,
                    }}
                  >
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 backdrop-blur-sm">
                      <p className="text-xs font-semibold text-gray-300 mb-2">
                        {get(auth, 'register.passwordRequirements')}
                      </p>
                      <ul className="space-y-1.5">
                        {[
                          {
                            id: 'min',
                            test: registerData.password.length >= 8,
                            label: get(auth, 'register.passwordMinLength'),
                          },
                          {
                            id: 'upper',
                            test: /[A-Z]/.test(registerData.password),
                            label: get(auth, 'register.passwordUppercase'),
                          },
                          {
                            id: 'lower',
                            test: /[a-z]/.test(registerData.password),
                            label: get(auth, 'register.passwordLowercase'),
                          },
                          {
                            id: 'num',
                            test: /\d/.test(registerData.password),
                            label: get(auth, 'register.passwordNumber'),
                          },
                        ].map((req) => (
                          <li key={req.id} className="flex items-center text-xs">
                            <span
                              className={`mr-2 ${req.test ? 'text-green-400' : 'text-gray-500'}`}
                            >
                              {req.test ? '✓' : '○'}
                            </span>
                            <span className={req.test ? 'text-green-300' : 'text-gray-400'}>
                              {req.label}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Success message */}
                {success && (
                  <div className="mb-4 bg-green-500/10 border border-green-500/30 rounded-xl p-3 backdrop-blur-sm">
                    <p className="text-sm text-green-300">{success}</p>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-xl p-3 backdrop-blur-sm">
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                {/* Submit button with crossfade text */}
                <button
                  type="submit"
                  disabled={loading || (mode === 'register' && !isRegisterValid)}
                  className="w-full bg-gradient-to-br from-blue-600 to-blue-800 hover:from-blue-500 hover:to-blue-700 text-white font-semibold py-3.5 rounded-xl disabled:opacity-50 shadow-xl mt-6 transition-all relative overflow-hidden"
                >
                  <span
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                      mode === 'login' && !loading ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {get(auth, 'login.submit')}
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                      mode === 'register' && !loading ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {get(auth, 'register.submit')}
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                      loading ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    {mode === 'login'
                      ? get(auth, 'login.submitting')
                      : get(auth, 'register.submitting')}
                  </span>
                  <span className="opacity-0">
                    {mode === 'login' ? get(auth, 'login.submit') : get(auth, 'register.submit')}
                  </span>
                </button>
              </form>

              {/* Toggle link with crossfade */}
              <div className="mt-6 text-center">
                <button
                  onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
                  className="text-sm text-gray-300 hover:text-white transition-colors"
                >
                  <span className="relative inline-block">
                    <span
                      className={`transition-opacity duration-300 ${
                        mode === 'login' ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      {get(auth, 'login.newUser')}{' '}
                      <span className="font-semibold text-blue-400">
                        {get(auth, 'register.title')}
                      </span>
                    </span>
                    <span
                      className={`absolute left-0 transition-opacity duration-300 ${
                        mode === 'register' ? 'opacity-100' : 'opacity-0'
                      }`}
                    >
                      {get(auth, 'register.hasAccount')}{' '}
                      <span className="font-semibold text-blue-400">
                        {get(auth, 'login.title')}
                      </span>
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
