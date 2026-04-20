'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { registerAction } from '@/actions/auth.actions';
import RegisterForm from '@/components/auth/RegisterForm';
import { get } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';

const PASSWORD_REQUIREMENTS = [
  { id: 'min-length', test: (p: string) => p.length >= 8 },
  { id: 'uppercase', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lowercase', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', test: (p: string) => /\d/.test(p) },
];

interface RegisterClientProps {
  lang: Locale;
  auth: Record<string, unknown>;
}

export default function RegisterClient({ lang, auth }: Readonly<RegisterClientProps>) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });

  const isFormValid = useMemo(() => {
    const allPasswordChecksPassed = PASSWORD_REQUIREMENTS.every((req) =>
      req.test(formData.password)
    );
    return (
      formData.name.trim().length >= 2 &&
      formData.email.includes('@') &&
      formData.password.length > 0 &&
      allPasswordChecksPassed
    );
  }, [formData]);

  async function handleSubmit(event: React.BaseSyntheticEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const result = await registerAction(formData);

    if (result.success) {
      router.push(`/${lang}/login?registered=true`);
    } else {
      setError(result.error || get(auth, 'errors.registerError'));
      setLoading(false);
    }
  }

  function handleFieldChange(field: string, value: string) {
    setFormData({ ...formData, [field]: value });
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-400 via-purple-500 to-purple-800">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-purple-900/30 rounded-full blur-3xl" />
        <div className="absolute top-20 right-10 w-32 h-32 border-2 border-white/20 rounded-full" />
        <div className="absolute bottom-32 left-20 w-24 h-24 border-2 border-white/10 rounded-lg -rotate-45" />
      </div>

      {/* Content */}
      <div className="w-full max-w-6xl relative z-10">
        {/* Mobile View */}
        <div className="md:hidden">
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-2xl shadow-2xl p-6 mx-4 max-h-[90vh] overflow-y-auto">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl mb-4">
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
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">
                {get(auth, 'register.title')}
              </h1>
              <p className="text-gray-600 dark:text-gray-300">{get(auth, 'register.subtitle')}</p>
            </div>

            <RegisterForm
              loading={loading}
              error={error}
              formData={formData}
              isFormValid={isFormValid}
              isMobile={true}
              onSubmit={handleSubmit}
              onFieldChange={handleFieldChange}
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

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                {get(auth, 'register.hasAccount')}{' '}
                <Link
                  href={`/${lang}/login`}
                  className="text-purple-600 dark:text-purple-400 font-semibold hover:underline"
                >
                  {get(auth, 'register.login')}
                </Link>
              </p>
            </div>
          </div>
        </div>

        {/* Desktop View - Split Screen */}
        <div className="hidden md:block bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden">
          <div className="grid md:grid-cols-2 min-h-[700px]">
            {/* Left Panel - Invitation */}
            <div className="relative bg-gradient-to-br from-indigo-400 via-purple-500 to-purple-800 p-12 flex flex-col items-center justify-center text-white overflow-hidden">
              <div className="absolute inset-0 overflow-hidden">
                <div className="absolute top-10 left-10 w-72 h-72 bg-white/10 rounded-full blur-3xl" />
                <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-900/30 rounded-full blur-3xl" />
                <div className="absolute top-1/2 right-1/2 transform translate-x-1/2 -translate-y-1/2 w-64 h-64 border-4 border-white/20 rounded-full" />
                <div className="absolute bottom-20 left-20 w-32 h-32 border-4 border-white/10 rounded-lg -rotate-12" />
                <div className="absolute top-32 right-32 w-24 h-24 bg-white/5 rounded-2xl -rotate-45" />
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
                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                      />
                    </svg>
                  </div>
                  <h2 className="text-4xl font-black mb-4">{get(auth, 'register.inviteTitle')}</h2>
                  <p className="text-purple-50 text-lg leading-relaxed">
                    {get(auth, 'register.inviteDescription')}
                  </p>
                </div>

                <Link
                  href={`/${lang}/login`}
                  className="inline-block w-full max-w-xs bg-white text-purple-700 hover:bg-purple-50 font-bold py-3.5 px-8 rounded-xl transition-all transform hover:scale-105 shadow-xl"
                >
                  {get(auth, 'register.inviteButton')}
                </Link>
              </div>
            </div>

            {/* Right Panel - Form */}
            <div className="p-12 flex flex-col justify-center bg-white dark:bg-gray-800">
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl mb-6">
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
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </div>
                <h1 className="text-4xl font-black text-gray-900 dark:text-white mb-2">
                  {get(auth, 'register.title')}
                </h1>
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  {get(auth, 'register.subtitleDesktop')}
                </p>
              </div>

              <RegisterForm
                loading={loading}
                error={error}
                formData={formData}
                isFormValid={isFormValid}
                isMobile={false}
                onSubmit={handleSubmit}
                onFieldChange={handleFieldChange}
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
  );
}
