/**
 * Icon registry tests.
 *
 * `resolveIcon` maps the stable string keys used by the landing dictionaries to
 * real `lucide-react` components, with a neutral `Sparkles` fallback so copy can
 * never crash the page.
 */
import { describe, it, expect } from 'vitest';
import { ArrowLeftRight, PiggyBank, Sparkles, Wallet } from 'lucide-react';
import { resolveIcon } from '../icons';

describe('resolveIcon', () => {
  it('devuelve el icono registrado para una clave conocida', () => {
    expect(resolveIcon('PiggyBank')).toBe(PiggyBank);
    expect(resolveIcon('Wallet')).toBe(Wallet);
    expect(resolveIcon('ArrowLeftRight')).toBe(ArrowLeftRight);
  });

  it('devuelve el fallback Sparkles cuando la clave es desconocida', () => {
    expect(resolveIcon('NotARealIcon')).toBe(Sparkles);
  });

  it('es sensible a mayúsculas: una clave mal capitalizada cae al fallback', () => {
    expect(resolveIcon('piggybank')).toBe(Sparkles);
  });
});
