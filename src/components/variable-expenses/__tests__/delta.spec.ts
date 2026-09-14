/**
 * Variable-expenses delta presentation helpers.
 */
import { describe, it, expect } from 'vitest';
import {
  EXPENSE_DELTA_COLORS,
  EXPENSE_DELTA_LABEL_KEYS,
  formatExpenseDelta,
  getExpenseDeltaTone,
} from '../delta';

describe('expense delta helpers', () => {
  it('maps spend up/down/flat/no-base to a tone', () => {
    // Spending more than last month is unfavorable ('up').
    expect(getExpenseDeltaTone(12.5)).toBe('up');
    expect(getExpenseDeltaTone(-3)).toBe('down');
    expect(getExpenseDeltaTone(0)).toBe('flat');
    expect(getExpenseDeltaTone(null)).toBe('none');
  });

  it('formats the percentage with an explicit sign for increases', () => {
    expect(formatExpenseDelta(25)).toBe('+25.0%');
    expect(formatExpenseDelta(-12.34)).toBe('-12.3%');
    expect(formatExpenseDelta(0)).toBe('0.0%');
  });

  it('exposes a color and a label key for every tone', () => {
    for (const tone of ['up', 'down', 'flat', 'none'] as const) {
      expect(EXPENSE_DELTA_COLORS[tone]).toBeTruthy();
      expect(EXPENSE_DELTA_LABEL_KEYS[tone]).toBeTruthy();
    }
  });
});
