/**
 * decimal-input unit tests — localized quantity helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeQuantityInput,
  toDecimalString,
  parseQuantity,
  formatQuantity,
} from '../decimal-input';

describe('sanitizeQuantityInput', () => {
  it('keeps digits and a single dot separator', () => {
    expect(sanitizeQuantityInput('12.34')).toBe('12.34');
  });

  it('keeps digits and a single comma separator', () => {
    expect(sanitizeQuantityInput('12,34')).toBe('12,34');
  });

  it('drops every character after the first separator', () => {
    expect(sanitizeQuantityInput('1,2,3')).toBe('1,23');
    expect(sanitizeQuantityInput('1.2.3')).toBe('1.23');
  });

  it('strips non-numeric characters', () => {
    expect(sanitizeQuantityInput('a1b2c,3d')).toBe('12,3');
  });

  it('allows a trailing separator while typing', () => {
    expect(sanitizeQuantityInput('2,')).toBe('2,');
    expect(sanitizeQuantityInput('2.')).toBe('2.');
  });
});

describe('toDecimalString', () => {
  it('normalizes a comma separator to a dot', () => {
    expect(toDecimalString('2,24')).toBe('2.24');
  });

  it('removes a trailing separator', () => {
    expect(toDecimalString('2,')).toBe('2');
    expect(toDecimalString('2.')).toBe('2');
  });

  it('trims surrounding whitespace', () => {
    expect(toDecimalString('  2,5  ')).toBe('2.5');
  });
});

describe('parseQuantity', () => {
  it('parses a dot decimal', () => {
    expect(parseQuantity('2.5')).toBe(2.5);
  });

  it('parses a comma decimal', () => {
    expect(parseQuantity('2,5')).toBe(2.5);
  });

  it('returns 0 for an empty string', () => {
    expect(parseQuantity('')).toBe(0);
  });

  it('returns 0 for a malformed value', () => {
    expect(parseQuantity('abc')).toBe(0);
    expect(parseQuantity('--1')).toBe(0);
  });

  it('parses full precision input without float drift', () => {
    expect(parseQuantity('2.243695838')).toBe(2.243695838);
  });
});

describe('formatQuantity', () => {
  it('keeps integer quantities without trailing zeros', () => {
    expect(formatQuantity(10)).toBe('10');
    expect(formatQuantity(5)).toBe('5');
  });

  it('renders up to 12 decimals and trims trailing zeros', () => {
    expect(formatQuantity(2.243695838)).toBe('2.243695838');
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(2.25)).toBe('2.25');
  });

  it('returns "0" for non-finite values', () => {
    expect(formatQuantity(Number.NaN)).toBe('0');
    expect(formatQuantity(Number.POSITIVE_INFINITY)).toBe('0');
  });
});
