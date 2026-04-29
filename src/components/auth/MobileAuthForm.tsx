'use client';

import { get } from '@/lib/i18n';
import MobileFormInputs from './MobileFormInputs';
import PasswordRequirements from './PasswordRequirements';

type FormSubmitEvent = (event: React.SyntheticEvent<HTMLFormElement>) => void;

interface MobileAuthFormProps {
  mode: 'login' | 'register';
  loading: boolean;
  error: string;
  success: string;
  loginData: { email: string; password: string };
  registerData: { name: string; email: string; password: string };
  isRegisterValid: boolean;
  auth: Record<string, unknown>;
  onLoginSubmit: FormSubmitEvent;
  onRegisterSubmit: FormSubmitEvent;
  onLoginDataChange: (data: { email: string; password: string }) => void;
  onRegisterDataChange: (data: { name: string; email: string; password: string }) => void;
  onSwitchMode: (newMode: 'login' | 'register') => void;
}

export default function MobileAuthForm({
  mode,
  loading,
  error,
  success,
  loginData,
  registerData,
  isRegisterValid,
  auth,
  onLoginSubmit,
  onRegisterSubmit,
  onLoginDataChange,
  onRegisterDataChange,
  onSwitchMode,
}: Readonly<MobileAuthFormProps>) {
  return (
    <div className="md:hidden w-full px-6 flex flex-col justify-center min-h-[calc(100vh-100px)]">
      {/* Title with crossfade */}
      <div className="mb-8 text-center relative">
        <div className="relative h-24">
          <h1
            className={`absolute inset-0 text-4xl font-bold text-white transition-opacity duration-300 ${
              mode === 'login' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {get(auth, 'login.title')}
          </h1>
          <h1
            className={`absolute inset-0 text-4xl font-bold text-white transition-opacity duration-300 ${
              mode === 'register' ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {get(auth, 'register.title')}
          </h1>
        </div>
        <div className="relative h-10">
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
        <form onSubmit={mode === 'login' ? onLoginSubmit : onRegisterSubmit}>
          <MobileFormInputs
            mode={mode}
            loading={loading}
            loginData={loginData}
            registerData={registerData}
            auth={auth}
            onLoginDataChange={onLoginDataChange}
            onRegisterDataChange={onRegisterDataChange}
          />

          {/* Password requirements - morphs in for register */}
          {mode === 'register' && registerData.password && (
            <PasswordRequirements password={registerData.password} auth={auth} />
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
              {mode === 'login' ? get(auth, 'login.submitting') : get(auth, 'register.submitting')}
            </span>
            <span className="opacity-0">
              {mode === 'login' ? get(auth, 'login.submit') : get(auth, 'register.submit')}
            </span>
          </button>
        </form>

        {/* Toggle link with crossfade */}
        <div className="mt-6 text-center">
          <button
            onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
            className="text-sm text-gray-300 hover:text-white transition-colors"
          >
            <span className="relative inline-block">
              <span
                className={`transition-opacity duration-300 ${
                  mode === 'login' ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {get(auth, 'login.newUser')}{' '}
                <span className="font-semibold text-blue-400">{get(auth, 'register.title')}</span>
              </span>
              <span
                className={`absolute left-0 transition-opacity duration-300 ${
                  mode === 'register' ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {get(auth, 'register.hasAccount')}{' '}
                <span className="font-semibold text-blue-400">{get(auth, 'login.title')}</span>
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
