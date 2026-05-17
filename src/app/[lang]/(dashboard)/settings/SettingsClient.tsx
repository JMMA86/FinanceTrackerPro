'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { changeLanguageAction } from '@/actions/language.actions';
import { logoutAction } from '@/actions/auth.actions';
import { get, SUPPORTED_LOCALES } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { Globe, LogOut } from 'lucide-react';

interface SettingsClientProps {
  lang: Locale;
  settings: Record<string, unknown>;
  languageLabels: Record<Locale, string>;
}

export default function SettingsClient({
  lang,
  settings,
  languageLabels,
}: Readonly<SettingsClientProps>) {
  const router = useRouter();
  const [changing, setChanging] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [success, setSuccess] = useState('');

  async function handleLanguageChange(newLocale: Locale) {
    setChanging(true);
    setSuccess('');

    const result = await changeLanguageAction({ locale: newLocale });

    if (result.success) {
      setSuccess(get(settings, 'language.changed'));
      // Redirect to new locale
      const currentPath = globalThis.location.pathname.replace(`/${lang}`, '');
      router.push(`/${newLocale}${currentPath}`);
    }

    setChanging(false);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await logoutAction(undefined);
    router.push(`/${lang}/login`);
  }

  return (
    <div className="space-y-6">
      {/* Language Settings */}
      <div className="app-shell rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-indigo-500/10 rounded-xl">
            <Globe className="w-6 h-6 text-indigo-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-1">
              {get(settings, 'language.title')}
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              {get(settings, 'language.description')}
            </p>

            <div className="space-y-3">
              <div className="text-sm text-gray-300">
                <span className="font-semibold">{get(settings, 'language.current')}:</span>{' '}
                {languageLabels[lang]}
              </div>

              <div className="flex flex-wrap gap-3">
                {SUPPORTED_LOCALES.map((locale) => (
                  <button
                    key={locale}
                    onClick={() => handleLanguageChange(locale)}
                    disabled={changing || locale === lang}
                    className={`
                      px-6 py-3 rounded-xl font-medium transition-all
                      ${
                        locale === lang
                          ? 'bg-indigo-500 text-white cursor-default'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }
                      disabled:opacity-50 disabled:cursor-not-allowed
                    `}
                  >
                    {changing && locale !== lang ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
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
                        {languageLabels[locale]}
                      </span>
                    ) : (
                      languageLabels[locale]
                    )}
                  </button>
                ))}
              </div>

              {success && (
                <div className="bg-green-900/20 border border-green-800 rounded-xl p-3">
                  <p className="text-sm text-green-200 font-medium">
                    {success}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Account Settings - Logout */}
      <div className="app-shell rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-red-500/10 rounded-xl">
            <LogOut className="w-6 h-6 text-red-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-white mb-1">
              {get(settings, 'account.title')}
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              {get(settings, 'account.logoutDescription')}
            </p>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="
                flex items-center gap-3 px-6 py-3 rounded-xl font-medium transition-all
                bg-red-500 hover:bg-red-600 text-white
                disabled:opacity-50 disabled:cursor-not-allowed
                shadow-lg hover:shadow-xl
              "
            >
              {loggingOut ? (
                <>
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
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
                  {get(settings, 'account.loggingOut')}
                </>
              ) : (
                <>
                  <LogOut className="w-5 h-5" />
                  {get(settings, 'account.logout')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
