/**
 * Landing i18n parity tests.
 *
 * The Spanish and English dictionaries must expose exactly the same recursive
 * key set and the same array lengths, otherwise the landing page renders
 * partially empty in one locale. This test is intentionally strict: any drift
 * fails the suite.
 */
import { describe, it, expect } from 'vitest';
import es from '@/locales/es/landing.json';
import en from '@/locales/en/landing.json';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const esDict = es as unknown as Json;
const enDict = en as unknown as Json;

/** Collects every leaf path (including array indices) of a JSON tree. */
function collectPaths(value: Json, prefix = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectPaths(item, `${prefix}[${index}]`));
  }

  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      collectPaths(child, prefix ? `${prefix}.${key}` : key)
    );
  }

  return [prefix];
}

/** Resolves a dot-separated path and asserts the node is an array. */
function arrayLengthAt(dict: Json, path: string): number {
  let current: Json = dict;

  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(`Se esperaba un objeto en "${segment}" dentro de "${path}"`);
    }
    const next: Json | undefined = (current as { [key: string]: Json })[segment];
    if (next === undefined) {
      throw new Error(`Falta la clave "${segment}" dentro de "${path}"`);
    }
    current = next;
  }

  if (!Array.isArray(current)) {
    throw new Error(`Se esperaba un array en "${path}"`);
  }

  return current.length;
}

const ARRAY_PATHS = [
  'hero.trust',
  'hero.preview.accounts',
  'stats.items',
  'features.items',
  'benefits.items',
  'steps.items',
  'security.controls',
  'faq.items',
] as const;

describe('paridad de diccionarios landing es/en', () => {
  it('expone exactamente las mismas claves recursivas en ambos idiomas', () => {
    const esPaths = collectPaths(esDict).sort();
    const enPaths = collectPaths(enDict).sort();

    expect(enPaths).toEqual(esPaths);
  });

  it('no tiene diccionarios vacíos', () => {
    expect(collectPaths(esDict).length).toBeGreaterThan(0);
    expect(collectPaths(enDict).length).toBeGreaterThan(0);
  });

  it.each(ARRAY_PATHS)('mantiene la misma longitud de array en %s', (path) => {
    const esLength = arrayLengthAt(esDict, path);
    const enLength = arrayLengthAt(enDict, path);

    expect(esLength).toBeGreaterThan(0);
    expect(enLength).toBe(esLength);
  });
});
