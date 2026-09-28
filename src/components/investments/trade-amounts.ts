/**
 * Shared price-per-share ⇄ base-cost derivation for the investment trade
 * modals (buy form and trade editor).
 *
 * Both amounts are integer cents (Rule 2) and every conversion goes through
 * `@/lib/money` (Decimal.js + banker's rounding, Rule 1) — never native floats.
 */

import { divideCents, multiplyCents } from '@/lib/money';

/** Which of the two coupled fields the user edited last. */
export type PriceAnchor = 'price' | 'base';

export interface TradeAmounts {
  pricePerShareCents: number;
  baseCostCents: number;
}

/**
 * Derive the coupled amounts from the edited anchor:
 * - anchor `'price'`: base cost = price × quantity.
 * - anchor `'base'`:  price = base cost ÷ quantity.
 *
 * A quantity of 0 (or empty) never divides by zero: the derived field becomes 0
 * while the anchor field keeps the user's value.
 */
export function deriveTradeAmounts(
  anchor: PriceAnchor,
  current: TradeAmounts,
  quantity: number
): TradeAmounts {
  if (anchor === 'base') {
    return {
      pricePerShareCents: quantity > 0 ? divideCents(current.baseCostCents, quantity) : 0,
      baseCostCents: current.baseCostCents,
    };
  }
  return {
    pricePerShareCents: current.pricePerShareCents,
    baseCostCents: quantity > 0 ? multiplyCents(current.pricePerShareCents, quantity) : 0,
  };
}
