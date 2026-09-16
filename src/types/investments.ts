/**
 * Shared Investment Domain Types
 *
 * Central contract consumed by the backend (investment.actions) and reused by
 * the frontend so responses are NEVER cast with `as unknown as`.
 *
 * Money fields are integer cents (Rule 2) and bounded by MAX_SAFE_CENTS so they
 * safely serialize to JS numbers after BigInt conversion (see bigintToNumber).
 */

/**
 * One investment holding (asset) DTO returned by getInvestmentAccounts.
 * Monetary BigInt fields are already converted to JS numbers on the server.
 */
export interface InvestmentHoldingDTO {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  avgCostCents: number;
  currentPriceCents: number;
  currency: string;
  originalCostCents: number | null;
  exchangeRate: number | null;
  lastPriceUpdate: Date | string | null;
  createdAt: Date | string;
}

/**
 * Investment account DTO returned by getInvestmentAccounts.
 * Monetary BigInt fields are already converted to JS numbers on the server.
 */
export interface InvestmentAccountDTO {
  id: string;
  name: string;
  type: string;
  currency: string;
  balanceCents: number;
  creditLimitCents: number | null;
  interestRateEA: number | null;
  assetHoldings: InvestmentHoldingDTO[];
  createdAt: Date | string;
}

/**
 * View (subset) type consumed by the UI for a single holding.
 *
 * Components only read the fields they render; the full DTO remains the
 * backend contract. The DTO is structurally assignable to this Pick subset
 * (superset → subset), so legacy fixtures and action responses flow without
 * casts.
 */
export type InvestmentHoldingSummary = Pick<
  InvestmentHoldingDTO,
  'id' | 'symbol' | 'name' | 'quantity' | 'avgCostCents' | 'currentPriceCents' | 'currency'
>;

/**
 * View (subset) type consumed by the UI for an investment account.
 *
 * `assetHoldings` is optional because account cards render fine without a
 * populated portfolio (e.g. empty-state accounts), and every field is a Pick
 * of the full DTO so responses remain assignable.
 */
export type InvestmentAccountSummary = Pick<
  InvestmentAccountDTO,
  'id' | 'name' | 'currency' | 'balanceCents' | 'createdAt'
> & { assetHoldings?: InvestmentHoldingSummary[] };
