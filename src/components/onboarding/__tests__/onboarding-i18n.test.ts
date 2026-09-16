/**
 * Onboarding dictionary parity tests.
 *
 * Guarantees the `es` and `en` onboarding namespaces stay structurally in sync
 * (same keys, same array lengths) so a missing translation can never silently
 * fall back to a raw key at runtime. Also guards against leftover `transaction`
 * keys copied from another namespace.
 */

import { describe, it, expect } from 'vitest';
import es from '@/locales/es/onboarding.json';
import en from '@/locales/en/onboarding.json';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertParity(esNode: unknown, enNode: unknown, path: string): void {
  if (Array.isArray(esNode) || Array.isArray(enNode)) {
    expect(Array.isArray(esNode), `${path} should be an array in es`).toBe(true);
    expect(Array.isArray(enNode), `${path} should be an array in en`).toBe(true);
    const esItems = esNode as unknown[];
    const enItems = enNode as unknown[];
    expect(esItems.length, `${path} array length`).toBe(enItems.length);
    esItems.forEach((item, index) => assertParity(item, enItems[index], `${path}[${index}]`));
    return;
  }

  if (isRecord(esNode) || isRecord(enNode)) {
    expect(isRecord(esNode), `${path} should be an object in es`).toBe(true);
    expect(isRecord(enNode), `${path} should be an object in en`).toBe(true);
    const esKeys = Object.keys(esNode as JsonRecord).sort();
    const enKeys = Object.keys(enNode as JsonRecord).sort();
    expect(enKeys, `${path} keys`).toEqual(esKeys);
    for (const key of esKeys) {
      assertParity(
        (esNode as JsonRecord)[key],
        (enNode as JsonRecord)[key],
        path ? `${path}.${key}` : key
      );
    }
  }
}

function collectPaths(node: unknown, prefix = ''): string[] {
  if (Array.isArray(node)) {
    return node.flatMap((item, index) => collectPaths(item, `${prefix}[${index}]`));
  }
  if (isRecord(node)) {
    return Object.entries(node).flatMap(([key, value]) =>
      collectPaths(value, prefix ? `${prefix}.${key}` : key)
    );
  }
  return [prefix];
}

function collectLeaves(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(collectLeaves);
  if (isRecord(node)) return Object.values(node).flatMap(collectLeaves);
  return [String(node)];
}

describe('onboarding dictionaries (es/en)', () => {
  it('has the exact same recursive key structure', () => {
    assertParity(es, en, 'onboarding');
  });

  it('has the same number of translated leaves', () => {
    const esLeaves = collectLeaves(es);
    const enLeaves = collectLeaves(en);
    expect(esLeaves.length).toBeGreaterThan(0);
    expect(enLeaves).toHaveLength(esLeaves.length);
  });

  it('keeps every leaf non-empty in both locales', () => {
    for (const leaf of [...collectLeaves(es), ...collectLeaves(en)]) {
      expect(leaf.trim().length).toBeGreaterThan(0);
    }
  });

  it('does not leave any transaction key behind', () => {
    const paths = [...collectPaths(es), ...collectPaths(en)];
    const legacy = paths.filter((path) => /transaction/i.test(path));
    expect(legacy).toEqual([]);
  });

  it('exposes the keys the wizard resolves at runtime', () => {
    const paths = collectPaths(es);
    const required = [
      'title',
      'subtitle',
      'buttons.next',
      'buttons.back',
      'buttons.skip',
      'buttons.finishing',
      'stepper.welcome',
      'stepper.account',
      'stepper.modules',
      'stepper.finish',
      'skip.title',
      'skip.confirm',
      'splash.brand',
      'steps.account.successMessage',
      'steps.finish.cta',
      'currency.COP',
      'accountTypes.CHECKING',
    ];
    for (const key of required) {
      expect(paths, `missing ${key}`).toContain(key);
    }
  });
});
