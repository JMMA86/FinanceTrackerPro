import { get } from '@/lib/i18n';

interface MobileFormInputsProps {
  mode: 'login' | 'register';
  loading: boolean;
  loginData: { email: string; password: string };
  registerData: { name: string; email: string; password: string };
  auth: Record<string, unknown>;
  onLoginDataChange: (data: { email: string; password: string }) => void;
  onRegisterDataChange: (data: { name: string; email: string; password: string }) => void;
}

export default function MobileFormInputs({
  mode,
  loading,
  loginData,
  registerData,
  auth,
  onLoginDataChange,
  onRegisterDataChange,
}: Readonly<MobileFormInputsProps>) {
  return (
    <>
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
          onChange={(e) => onRegisterDataChange({ ...registerData, name: e.target.value })}
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
              ? onLoginDataChange({ ...loginData, email: e.target.value })
              : onRegisterDataChange({ ...registerData, email: e.target.value })
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
              ? onLoginDataChange({ ...loginData, password: e.target.value })
              : onRegisterDataChange({ ...registerData, password: e.target.value })
          }
          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder:text-gray-400 focus:bg-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:opacity-50"
          placeholder={get(auth, 'login.passwordPlaceholder')}
        />
      </div>
    </>
  );
}
