'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { loginAction, registerAction } from '@/actions/auth.actions';
import { AnimatedBackground } from '@/components/auth/AnimatedBackground';
import MobileAuthForm from '@/components/auth/MobileAuthForm';
import DesktopAuthPanel from '@/components/auth/DesktopAuthPanel';
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
  const [successMessage, setSuccessMessage] = useState('');
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [registerData, setRegisterData] = useState({ name: '', email: '', password: '' });

  const success =
    (isRegistered || successMessage) && mode === 'login'
      ? successMessage || get(auth, 'login.successMessage')
      : '';

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

  async function handleLoginSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
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

  async function handleRegisterSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const result = await registerAction(registerData);

    if (result.success) {
      setLoading(false);
      setMode('login');
      setSuccessMessage(get(auth, 'login.successMessage'));
      setRegisterData({ name: '', email: '', password: '' });
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
          <div className="hidden md:block bg-gray-800 rounded-3xl shadow-2xl shadow-black/50 border border-white/10 overflow-hidden backdrop-blur-sm">
            <div className="relative h-[800px] overflow-hidden">
              {/* Layer 1: Fixed Forms (z-10) */}
              {/* Login Form - Fixed Left */}
              <div
                className="absolute left-0 top-0 w-1/2 h-full bg-gray-800 z-10 transition-opacity duration-500"
                style={{ opacity: mode === 'login' ? 1 : 0.3 }}
              >
                <div className="absolute inset-0 p-12 overflow-y-auto flex flex-col justify-center">
                  <div className="mb-8">
                    <h1 className="text-4xl font-bold text-white mb-2">
                      {get(auth, 'login.subtitleDesktop')}
                    </h1>
                    <p className="text-gray-400 text-lg">
                      {get(auth, 'login.subtitleDescDesktop')}
                    </p>
                  </div>

                  <form onSubmit={handleLoginSubmit} className="space-y-5">
                    <div>
                      <label className="block text-sm font-semibold text-gray-300 mb-2">
                        {get(auth, 'login.email')}
                      </label>
                      <input
                        type="email"
                        required
                        disabled={loading}
                        value={loginData.email}
                        onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white transition-all disabled:opacity-50"
                        placeholder={get(auth, 'login.emailPlaceholder')}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-300 mb-2">
                        {get(auth, 'login.password')}
                      </label>
                      <input
                        type="password"
                        required
                        disabled={loading}
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-white transition-all disabled:opacity-50"
                        placeholder={get(auth, 'login.passwordPlaceholder')}
                      />
                    </div>

                    {success && (
                      <div className="bg-green-900/20 border border-green-800 rounded-xl p-4">
                        <p className="text-sm text-green-200 font-medium">{success}</p>
                      </div>
                    )}

                    {error && mode === 'login' && (
                      <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
                        <p className="text-sm text-red-200 font-medium">{error}</p>
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
                      className="w-full bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3.5 px-4 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg flex items-center justify-center gap-2 mt-3"
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
                className="absolute right-0 top-0 w-1/2 h-full bg-gray-800 z-10 transition-opacity duration-500"
                style={{ opacity: mode === 'register' ? 1 : 0.3 }}
              >
                <div className="absolute inset-0 p-12 overflow-y-auto flex flex-col justify-center">
                  <div className="mb-6">
                    <h1 className="text-4xl font-bold text-white mb-2">
                      {get(auth, 'register.title')}
                    </h1>
                    <p className="text-gray-400 text-lg">{get(auth, 'register.subtitleDesktop')}</p>
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

              {/* Layer 2: Sliding Panel */}
              <DesktopAuthPanel mode={mode} auth={auth} onSwitchMode={switchMode} />
            </div>
          </div>

          {/* Mobile View */}
          <MobileAuthForm
            mode={mode}
            loading={loading}
            error={error}
            success={success}
            loginData={loginData}
            registerData={registerData}
            isRegisterValid={isRegisterValid}
            auth={auth}
            onLoginSubmit={handleLoginSubmit}
            onRegisterSubmit={handleRegisterSubmit}
            onLoginDataChange={setLoginData}
            onRegisterDataChange={setRegisterData}
            onSwitchMode={switchMode}
          />
        </div>
      </div>
    </div>
  );
}
