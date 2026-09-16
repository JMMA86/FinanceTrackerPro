/**
 * Constant lists for the variable-expenses module: currencies, color presets
 * and the allow-listed lucide icons selectable for a monitored definition.
 */

import {
  Dumbbell,
  PartyPopper,
  Beer,
  Coffee,
  Film,
  ShoppingBag,
  Shirt,
  Plane,
  Gamepad2,
  Music,
  Gift,
  Utensils,
  Sparkles,
  Repeat,
  type LucideIcon,
} from 'lucide-react';

/** Currencies supported by the finance module (ISO 4217). */
export const VARIABLE_EXPENSE_CURRENCIES = ['COP', 'USD', 'EUR'] as const;

export type VariableExpenseCurrency = (typeof VARIABLE_EXPENSE_CURRENCIES)[number];

export const DEFAULT_VARIABLE_EXPENSE_COLOR = '#14b8a6';
export const DEFAULT_VARIABLE_EXPENSE_ICON = 'dumbbell';

export interface VariableExpenseColorPreset {
  value: string;
  labelKey: string;
}

export const VARIABLE_EXPENSE_COLOR_PRESETS: VariableExpenseColorPreset[] = [
  { value: '#14b8a6', labelKey: 'colorNames.teal' },
  { value: '#3b82f6', labelKey: 'colorNames.blue' },
  { value: '#8b5cf6', labelKey: 'colorNames.violet' },
  { value: '#10b981', labelKey: 'colorNames.emerald' },
  { value: '#f59e0b', labelKey: 'colorNames.amber' },
  { value: '#f43f5e', labelKey: 'colorNames.rose' },
  { value: '#ec4899', labelKey: 'colorNames.pink' },
  { value: '#f97316', labelKey: 'colorNames.orange' },
];

export interface VariableExpenseIconOption {
  name: string;
  labelKey: string;
  Icon: LucideIcon;
}

/** Allow-listed icons selectable for a monitored definition. */
export const VARIABLE_EXPENSE_ICONS: VariableExpenseIconOption[] = [
  { name: 'dumbbell', labelKey: 'iconNames.dumbbell', Icon: Dumbbell },
  { name: 'party', labelKey: 'iconNames.party', Icon: PartyPopper },
  { name: 'beer', labelKey: 'iconNames.beer', Icon: Beer },
  { name: 'coffee', labelKey: 'iconNames.coffee', Icon: Coffee },
  { name: 'film', labelKey: 'iconNames.film', Icon: Film },
  { name: 'shoppingBag', labelKey: 'iconNames.shoppingBag', Icon: ShoppingBag },
  { name: 'shirt', labelKey: 'iconNames.shirt', Icon: Shirt },
  { name: 'plane', labelKey: 'iconNames.plane', Icon: Plane },
  { name: 'gamepad', labelKey: 'iconNames.gamepad', Icon: Gamepad2 },
  { name: 'music', labelKey: 'iconNames.music', Icon: Music },
  { name: 'gift', labelKey: 'iconNames.gift', Icon: Gift },
  { name: 'utensils', labelKey: 'iconNames.utensils', Icon: Utensils },
  { name: 'sparkles', labelKey: 'iconNames.sparkles', Icon: Sparkles },
  { name: 'repeat', labelKey: 'iconNames.repeat', Icon: Repeat },
];

/** Resolve a stored color to a safe CSS value (default teal when absent). */
export function getVariableExpenseColor(color: string | null | undefined): string {
  return color ?? DEFAULT_VARIABLE_EXPENSE_COLOR;
}

/** Format a Date as the local `YYYY-MM-DD` value expected by <input type="date">. */
export function toDateInputValue(date?: Date | null): string {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
