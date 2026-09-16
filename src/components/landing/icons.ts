/**
 * Icon registry for the landing page.
 *
 * Translations reference icons by a stable string key (e.g. "PiggyBank") so the
 * JSON copy stays free of framework details. This module maps those keys to the
 * actual `lucide-react` components in a fully type-safe way.
 */

import {
  ArrowLeftRight,
  BarChart3,
  Calculator,
  Coins,
  CreditCard,
  FileCheck,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  Lock,
  PiggyBank,
  ReceiptText,
  ScrollText,
  Server,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Timer,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  ArrowLeftRight,
  BarChart3,
  Calculator,
  Coins,
  CreditCard,
  FileCheck,
  HandCoins,
  KeyRound,
  LayoutDashboard,
  Lock,
  PiggyBank,
  ReceiptText,
  ScrollText,
  Server,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  Timer,
  TrendingUp,
  Wallet,
};

/** Resolve an icon by key, falling back to a neutral icon when unknown. */
export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles;
}
