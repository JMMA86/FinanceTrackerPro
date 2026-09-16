/**
 * Redirect Sanitization (Fix S1)
 * Prevents open-redirect attacks via ?redirect= parameter
 * Isomorphic — safe to use on server and client
 */

const SAFE_REDIRECT_PATTERN = /^\/(?!\/)[a-zA-Z0-9\-/]*$/;

export function sanitizeRedirect(path: string | undefined, lang: string): string {
  if (!path || typeof path !== 'string') return `/${lang}/dashboard`;
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    path.includes('://')
  ) {
    return `/${lang}/dashboard`;
  }
  return SAFE_REDIRECT_PATTERN.test(path) ? path : `/${lang}/dashboard`;
}
