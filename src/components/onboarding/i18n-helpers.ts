import { get } from '@/lib/i18n';

/**
 * Read a nested onboarding dictionary value by dot-path.
 * Thin re-export so every onboarding component shares one accessor.
 */
export function t(dictionary: Record<string, unknown>, key: string): string {
  return get(dictionary, key);
}

/**
 * Minimal `{placeholder}` interpolation for the few localized strings that carry
 * a runtime value (user name, step counters, account name). Kept local to the
 * onboarding feature to avoid pulling a new dependency into the bundle.
 */
export function interpolate(
  template: string,
  values: Readonly<Record<string, string | number>>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = values[key];
    return value === undefined ? match : String(value);
  });
}
