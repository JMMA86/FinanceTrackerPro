/**
 * i18n helpers unit tests: nested key lookup with key fallback and the local
 * `{placeholder}` interpolation used by the onboarding copy.
 */

import { describe, it, expect } from 'vitest';
import { t, interpolate } from '../i18n-helpers';

describe('t', () => {
  const dictionary = {
    title: 'Configura tu cuenta',
    steps: {
      welcome: {
        greeting: '¡Hola, {name}!',
      },
    },
  };

  it('reads a nested value by dot-path', () => {
    expect(t(dictionary, 'steps.welcome.greeting')).toBe('¡Hola, {name}!');
  });

  it('reads a top-level value', () => {
    expect(t(dictionary, 'title')).toBe('Configura tu cuenta');
  });

  it('falls back to the key itself when the path is missing', () => {
    expect(t(dictionary, 'steps.account.title')).toBe('steps.account.title');
  });

  it('falls back to the key when the resolved node is not a string', () => {
    expect(t(dictionary, 'steps.welcome')).toBe('steps.welcome');
  });
});

describe('interpolate', () => {
  it('replaces every known placeholder', () => {
    expect(
      interpolate('Paso {current} de {total}: {title}', {
        current: 1,
        total: 4,
        title: 'Bienvenida',
      })
    ).toBe('Paso 1 de 4: Bienvenida');
  });

  it('replaces a numeric value as a string', () => {
    expect(interpolate('{count} cuentas', { count: 3 })).toBe('3 cuentas');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(interpolate('Hola {name}', {})).toBe('Hola {name}');
    expect(interpolate('Hola {name}', { other: 'x' })).toBe('Hola {name}');
  });

  it('returns the template unchanged when there are no placeholders', () => {
    expect(interpolate('Texto plano', { name: 'Ana' })).toBe('Texto plano');
  });
});
