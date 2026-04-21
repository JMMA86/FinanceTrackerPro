/**
 * Register Form Component
 * Shared form fields for mobile and desktop layouts
 */

interface PasswordRequirement {
  id: string;
  label: string;
  test: (password: string) => boolean;
}

interface RegisterFormProps {
  loading: boolean;
  error: string;
  formData: { name: string; email: string; password: string };
  isFormValid: boolean;
  isMobile?: boolean;
  onSubmit: (event: React.BaseSyntheticEvent) => void;
  onFieldChange: (field: string, value: string) => void;
  labels: {
    name: string;
    namePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    passwordRequirements: string;
    passwordMinLength: string;
    passwordUppercase: string;
    passwordLowercase: string;
    passwordNumber: string;
    submit: string;
    submitting: string;
  };
}

export default function RegisterForm({
  loading,
  error,
  formData,
  isFormValid,
  isMobile = false,
  onSubmit,
  onFieldChange,
  labels,
}: Readonly<RegisterFormProps>) {
  const suffix = isMobile ? '-mobile' : '-desktop';
  const inputBgClass = isMobile
    ? 'bg-white/70 dark:bg-gray-700/70 border-gray-300'
    : 'bg-gray-50 dark:bg-gray-700 border-gray-200';
  const checklistBgClass = isMobile
    ? 'bg-gray-50/90 dark:bg-gray-700/50 border-gray-200'
    : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200';
  const errorBgClass = isMobile
    ? 'bg-red-50/90 dark:bg-red-900/30'
    : 'bg-red-50 dark:bg-red-900/20';

  const passwordRequirements: PasswordRequirement[] = [
    { id: 'min-length', label: labels.passwordMinLength, test: (p) => p.length >= 8 },
    { id: 'uppercase', label: labels.passwordUppercase, test: (p) => /[A-Z]/.test(p) },
    { id: 'lowercase', label: labels.passwordLowercase, test: (p) => /[a-z]/.test(p) },
    { id: 'number', label: labels.passwordNumber, test: (p) => /\d/.test(p) },
  ];

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor={`name${suffix}`}
          className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
        >
          {labels.name}
        </label>
        <input
          type="text"
          id={`name${suffix}`}
          name="name"
          required
          minLength={2}
          maxLength={100}
          disabled={loading}
          value={formData.name}
          onChange={(e) => onFieldChange('name', e.target.value)}
          className={`w-full px-4 py-3 ${inputBgClass} border dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50`}
          placeholder={labels.namePlaceholder}
        />
      </div>

      <div>
        <label
          htmlFor={`email${suffix}`}
          className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
        >
          {labels.email}
        </label>
        <input
          type="email"
          id={`email${suffix}`}
          name="email"
          required
          disabled={loading}
          value={formData.email}
          onChange={(e) => onFieldChange('email', e.target.value)}
          className={`w-full px-4 py-3 ${inputBgClass} border dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50`}
          placeholder={labels.emailPlaceholder}
        />
      </div>

      <div>
        <label
          htmlFor={`password${suffix}`}
          className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2"
        >
          {labels.password}
        </label>
        <input
          type="password"
          id={`password${suffix}`}
          name="password"
          required
          minLength={8}
          disabled={loading}
          value={formData.password}
          onChange={(e) => onFieldChange('password', e.target.value)}
          className={`w-full px-4 py-3 ${inputBgClass} border dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:text-white transition-all disabled:opacity-50`}
          placeholder={labels.passwordPlaceholder}
        />

        {formData.password && (
          <div className={`mt-3 p-3 ${checklistBgClass} rounded-lg border dark:border-gray-600`}>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {labels.passwordRequirements}
            </p>
            <ul className="space-y-1.5">
              {passwordRequirements.map((req) => (
                <li key={req.id} className="flex items-center text-xs">
                  {req.test(formData.password) ? (
                    <svg
                      className="h-4 w-4 text-green-500 mr-2 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  <span
                    className={
                      req.test(formData.password)
                        ? 'text-green-700 dark:text-green-400 font-medium'
                        : 'text-gray-600 dark:text-gray-400'
                    }
                  >
                    {req.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <div
          className={`${errorBgClass} border border-red-200 dark:border-red-800 rounded-xl ${isMobile ? 'p-3' : 'p-4'}`}
        >
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
        disabled={loading || !isFormValid}
        className={`w-full bg-gradient-to-br from-blue-800 to-blue-950 hover:from-blue-700 hover:to-blue-900 text-white font-semibold ${isMobile ? 'py-3' : 'py-3.5'} px-4 rounded-xl transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed shadow-lg mt-6`}
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
            {labels.submitting}
          </span>
        ) : (
          labels.submit
        )}
      </button>
    </form>
  );
}
