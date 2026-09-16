/**
 * Validation message translation — Unit Tests
 *
 * Locks the mapping between Zod English messages / `validation.*` keys and the
 * active locale dictionary (with the nested `validation` namespace used by the
 * loans page).
 */

import { describe, it, expect } from 'vitest';
import { getDictionary } from '@/lib/i18n';
import { translateValidationMessage } from '../validation';

async function buildDictionary(locale: 'es' | 'en') {
  const validation = await getDictionary(locale, 'validation');
  return { validation } as Record<string, unknown>;
}

describe('lib/i18n/validation', () => {
  describe('translateValidationMessage (es)', () => {
    it('traduce una clave directa validation.*', async () => {
      const dictionary = await buildDictionary('es');
      expect(translateValidationMessage('validation.nameRequired', dictionary)).toBe(
        'El nombre es obligatorio'
      );
    });

    it('quita el prefijo de campo "campo: validation.*"', async () => {
      const dictionary = await buildDictionary('es');
      expect(translateValidationMessage('name: validation.nameRequired', dictionary)).toBe(
        'El nombre es obligatorio'
      );
      expect(
        translateValidationMessage('customTotals.0: validation.amountPositive', dictionary)
      ).toBe('El monto debe ser mayor que cero');
    });

    it('hace fallback desde el mensaje inglés al español', async () => {
      const dictionary = await buildDictionary('es');
      expect(translateValidationMessage('Name is required', dictionary)).toBe(
        'El nombre es obligatorio'
      );
      expect(translateValidationMessage('Amount must be positive', dictionary)).toBe(
        'El monto debe ser mayor que cero'
      );
    });

    it('devuelve un mensaje desconocido tal cual', async () => {
      const dictionary = await buildDictionary('es');
      expect(translateValidationMessage('Mensaje totalmente desconocido', dictionary)).toBe(
        'Mensaje totalmente desconocido'
      );
    });

    it('devuelve cadena vacía para undefined y null', async () => {
      const dictionary = await buildDictionary('es');
      expect(translateValidationMessage(undefined, dictionary)).toBe('');
      expect(translateValidationMessage(null, dictionary)).toBe('');
    });
  });

  describe('translateValidationMessage (en)', () => {
    it('traduce al inglés cuando el diccionario es inglés', async () => {
      const dictionary = await buildDictionary('en');
      expect(translateValidationMessage('validation.nameRequired', dictionary)).toBe(
        'Name is required'
      );
      expect(translateValidationMessage('Name is required', dictionary)).toBe('Name is required');
    });
  });

  describe('fallbacks estructurales', () => {
    it('usa el mensaje inglés original si el diccionario no resuelve la clave', () => {
      // Diccionario vacío: la clave no existe y cae al mapa KEY_TO_EN.
      expect(translateValidationMessage('validation.nameRequired', {})).toBe('Name is required');
    });

    it('conserva el mensaje original si no hay traducción conocida', () => {
      expect(translateValidationMessage('Name is required', {})).toBe('Name is required');
    });
  });
});
