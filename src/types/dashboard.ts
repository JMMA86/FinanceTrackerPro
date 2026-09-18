/**
 * Shared Dashboard Domain Types
 *
 * Central contract consumed by the dashboard read path (`data.ts`) and reused by
 * the frontend so the metrics payload is NEVER cast with `as unknown as`.
 *
 * Money fields are integer cents (Rule 2) and each single-currency KPI carries
 * its own `currency` (Rule 4) — currencies are never mixed in one aggregate.
 *
 * MULTI-CURRENCY INTEGRITY (Fase 2):
 * - Every monetary KPI is provided BOTH as a scalar `{ amount, formatted, currency }`
 *   (the PRIMARY bucket: `user.baseCurrency` when it holds a NON-ZERO amount,
 *   otherwise the bucket with the largest absolute amount — always with its real
 *   currency) and as an explicit per-currency breakdown in `byCurrency`, so no
 *   aggregate ever sums different currencies and the UI can render every
 *   currency faithfully.
 * - `dollarRate`/`euroRate` carry their provenance (`live` | `fallback` |
 *   `unavailable`).
 */

import type { Currency } from '@prisma/client';

/**
 * Asset slices of the base-currency net-worth composition.
 *
 * `receivables` is an ASSET (money the user lent out: `direction: RECEIVABLE`
 * with a positive outstanding balance) and therefore participates in
 * `netWorthDistribution` alongside the account-derived categories.
 */
export type DistributionAssetCategoryKey =
  | 'checking'
  | 'cash'
  | 'savings'
  | 'pocket'
  | 'investments'
  | 'receivables';

/**
 * Liability slices of the base-currency net-worth composition.
 *
 * `creditCards` = Σ |negative CREDIT_CARD balance| and `loansPayable` =
 * outstanding `direction: PAYABLE` balance. Liabilities never render inside the
 * asset pie (a pie cannot express a negative proportion) and are reported
 * through `netWorthLiabilities` instead.
 */
export type DistributionLiabilityCategoryKey = 'creditCards' | 'loansPayable';

/**
 * Canonical union of every distribution bucket (assets + liabilities). Kept as
 * the union of the two families for backwards compatibility; the asset pie uses
 * {@link DistributionAssetCategoryKey} and the liability list uses
 * {@link DistributionLiabilityCategoryKey}.
 */
export type DistributionCategoryKey =
  | DistributionAssetCategoryKey
  | DistributionLiabilityCategoryKey;

export interface DistributionItem {
  categoryKey: DistributionCategoryKey;
  amount: number;
  percentage: number;
  color: string;
}

/** One liability slice of the base-currency net-worth composition. */
export interface DistributionLiabilityItem {
  categoryKey: DistributionLiabilityCategoryKey;
  amount: number;
  percentage: number;
  color: string;
}

/**
 * A single-currency money aggregate (Rule 2/4). `amount` is integer cents and
 * `formatted` is the locale-aware display string for THAT currency.
 */
export interface MoneyBucket {
  currency: Currency;
  amount: number;
  formatted: string;
}

/** Where a live FX rate came from. */
export type ExchangeRateSource = 'live' | 'fallback' | 'unavailable';

/**
 * One FX rate actually applied while composing the base-currency patrimony
 * (Rule 9 — traceability). Keyed by the SOURCE (foreign) currency in
 * {@link DashboardMetrics.exchangeRatesUsed}.
 *
 * `rate` = units of the base currency per 1 unit of the source currency — i.e.
 * the multiplier applied to convert the source cents into base cents.
 * A currency whose balances could not be converted is reported with `rate: 0`
 * and `source: 'unavailable'` (never a silent gap).
 */
export interface ExchangeRateUsed {
  /** Units of base currency per 1 unit of the source currency. */
  rate: number;
  source: ExchangeRateSource;
}

/**
 * Additive context for {@link DashboardMetrics.netWorthUnconverted}: how much
 * (in the ORIGINAL currency) could not be converted, and for how many balances.
 * Keyed by the source (foreign) currency. Empty when everything converted.
 */
export interface UnconvertedCurrencyBucket {
  /** Number of non-zero balances that failed to convert. */
  count: number;
  /** Σ |amount| in the ORIGINAL currency that could not be converted. */
  amountCents: number;
}

/** Which calendar window a projection covers. */
export type ProjectionPeriodKey = 'month' | 'year';

/**
 * ONE explainable projection line. The frontend can render the full calculation
 * without re-deriving anything:
 *
 * - `key`          stable component slug (cash, investments, salary, bonus,
 *                  fixed, loan-principal, loan-interest,
 *                  loan-receivable-principal, loan-receivable-interest,
 *                  variable, savings-target).
 * - `source`       origin system (CURRENT_CASH, SALARY_SCHEDULE, …) used to
 *                  group/label lines.
 * - `amountCents`  ALWAYS a NON-NEGATIVE magnitude in COP cents (0 when the item
 *                  could not be converted). `buildComponent` never emits a sign:
 *                  the DIRECTION (inflow vs outflow) is derived from `key`/
 *                  `source`, not from the sign of this field.
 * - `sourceCurrency` / `originalAmountCents` / `exchangeRate`  Rule 9 FX
 *                  traceability: `originalAmountCents` is ALWAYS expressed in
 *                  `sourceCurrency` (never a cross-currency sum); `exchangeRate`
 *                  is the COP-per-unit multiplier actually applied (null for COP).
 * - `count`        how many underlying items produced the line (occurrences,
 *                  payments, installments, months).
 * - `detail`       human-readable explanation (machine-parseable prose).
 *
 * Lines are emitted per component AND per source currency, so a multi-currency
 * component yields one line per currency and `originalAmountCents` never mixes
 * currencies.
 */
export interface ProjectionBreakdownLine {
  key: string;
  amountCents: number;
  currency: 'COP';
  sourceCurrency: Currency;
  originalAmountCents: number;
  exchangeRate: number | null;
  source: string;
  count: number;
  detail: string;
}

/**
 * Salary status for ONE projection window. "Pending" only ever refers to
 * occurrences STILL AHEAD (from today to the end of the window): a payday that
 * already passed is never reported as pending.
 *
 * - `NOT_CONFIGURED`: no ACTIVE `SalaryConfiguration` exists.
 * - `PENDING`: future occurrences remain and NONE was received yet.
 * - `PARTIAL`: future occurrences remain and SOME salary was already received.
 * - `RECEIVED`: no occurrence remains pending and at least one was received.
 * - `NO_PENDING`: no occurrence remains pending and none was received (e.g. the
 *   account was created after this window's payday). Prevents rendering a
 *   misleading "pending $0" or a false "received".
 */
export type ProjectionSalaryStatus =
  | 'NOT_CONFIGURED'
  | 'RECEIVED'
  | 'PARTIAL'
  | 'PENDING'
  | 'NO_PENDING';

/**
 * ONE expected salary occurrence of the window with its received flag. Only
 * occurrences from TODAY to the end of the window are exposed (past paydays are
 * omitted), so a stale payday never shows up as pending.
 *
 * `amountCents`/`currency` are the ORIGINAL expected amount (Rules 2/4) so the UI
 * can format each payment faithfully; the COP aggregates live in the period
 * (`salaryReceivedCents`/`salaryPendingCents`/`nextSalaryAmountCents`).
 */
export interface ProjectionSalaryOccurrence {
  date: Date;
  amountCents: number;
  currency: Currency;
  /**
   * `true` when a real salary INCOME transaction was matched to this occurrence
   * by NEAREST-OCCURRENCE proximity (smallest absolute calendar-day distance,
   * within a 15-day tolerance). Each occurrence is matched at most once; see
   * `matchSalaryOccurrences` in `projection.service.ts`.
   */
  received: boolean;
}

/**
 * End-of-period projection for ONE calendar window (`month` = current calendar
 * month, `year` = current calendar year). Every amount is COP cents (product
 * decision) after explicit, traceable FX conversion.
 */
export interface ProjectionPeriod {
  period: ProjectionPeriodKey;
  asOf: Date;
  periodStart: Date;
  periodEnd: Date;
  /** Liquid cash today (CHECKING + CASH + SAVINGS + POCKET) from the ledger. */
  currentCashCents: number;
  /**
   * Current value of the INVESTMENT accounts, in COP cents: ledger cash of the
   * account + market value of its active holdings (Σ quantity ×
   * currentPriceCents). Reuses `getInvestmentPerformance`'s `totalValueCents`
   * formula (Rule 13 — cash from the ledger) with a traceable FX conversion to
   * COP; an investment account without a usable rate is excluded and flagged.
   *
   * It participates ONLY in `projectedEndCents` (end-of-period net worth) and
   * NEVER in `remainingToSpendCents`/`projectedSurplusCents`: the value is not
   * spendable until liquidated.
   */
  investmentValueCents: number;
  /**
   * Salary already RECEIVED inside the window, in COP cents (Σ real salary INCOME
   * transactions converted with a traceable FX rate). It is already inside
   * `currentCashCents` and is NEVER added to `remainingIncomeCents`.
   */
  salaryReceivedCents: number;
  /**
   * Salary expected but NOT yet received, in COP cents. Pending = ONLY the FUTURE
   * occurrences inside the window (from today to the period end); paydays that
   * already passed are never generated and therefore never counted. It IS part of
   * `remainingIncomeCents`.
   */
  salaryPendingCents: number;
  /** Derived salary state for the window (see {@link ProjectionSalaryStatus}). */
  salaryStatus: ProjectionSalaryStatus;
  /**
   * First NOT-received salary occurrence at/after `asOf`. Every pending
   * occurrence is >= today; if none qualifies, the OLDEST pending one. Null when
   * nothing is pending.
   */
  nextSalaryDate: Date | null;
  /** COP cents of `nextSalaryDate`'s occurrence (null when unconvertible/none). */
  nextSalaryAmountCents: number | null;
  /** Every expected occurrence of the window with its received flag (sorted). */
  salaryOccurrences: ProjectionSalaryOccurrence[];
  /**
   * Expected INFLOWS still ahead in the window: salary occurrences NOT yet
   * received + bonus occurrences + the RECEIVABLE loan collections
   * (`remainingLoanReceivableCents`). Salary already received is EXCLUDED to
   * avoid double counting it (it is already in `currentCashCents`).
   */
  remainingIncomeCents: number;
  /** Unpaid fixed-expense payments due in the window. */
  remainingFixedCents: number;
  /** Remaining PAYABLE loan installments (principal + interest) — OUTFLOW. */
  remainingLoanPaymentsCents: number;
  remainingLoanPrincipalCents: number;
  remainingLoanInterestCents: number;
  /**
   * Remaining RECEIVABLE loan collections (principal + interest) — INFLOW. Money
   * the user lent out and will COLLECT. Its principal is not accounting "income"
   * (it is the return of an asset) but it IS real cash flow, so it is added to
   * `remainingIncomeCents` by product decision.
   */
  remainingLoanReceivableCents: number;
  /** Capital por cobrar de cuotas RECEIVABLE (entrada de caja). */
  remainingLoanReceivablePrincipalCents: number;
  /** Interés por cobrar de cuotas RECEIVABLE (entrada de caja). */
  remainingLoanReceivableInterestCents: number;
  /** Prorated variable-spend estimate for the rest of the window. */
  remainingVariableBudgetCents: number;
  /** Monthly savings target × remaining months of the window. */
  remainingSavingsTargetCents: number;
  /**
   * `currentCash + investmentValue + income − fixed − loans − variable −
   * savings`. Investment value is included here (end-of-period net position)
   * but NOT in `remainingToSpendCents` (not spendable).
   */
  projectedEndCents: number;
  /** `income − fixed − loans − savings` (what is left to spend). */
  remainingToSpendCents: number;
  /** `remainingToSpend − variable` (positive = target met with margin). */
  projectedSurplusCents: number;
  /** `true` when `projectedSurplusCents < 0`. */
  overBudget: boolean;
  breakdown: ProjectionBreakdownLine[];
}

/**
 * End-of-period projection exposed to the dashboard. `configured`/`targetConfigured`
 * distinguish "no salary configured"/"no savings target set" from a genuine zero,
 * so the UI can prompt the user instead of rendering a misleading flat result.
 */
export interface DashboardProjection {
  /** An ACTIVE `SalaryConfiguration` exists for the user. */
  configured: boolean;
  /** An ACTIVE `ProjectionSettings` (monthly savings target) exists. */
  targetConfigured: boolean;
  currency: 'COP';
  month: ProjectionPeriod;
  year: ProjectionPeriod;
  /** Rule 9 traceability: rates actually applied, keyed by SOURCE currency. */
  exchangeRatesUsed: Partial<Record<Currency, ExchangeRateUsed>>;
  /** `true` when at least one amount could not be converted (excluded). */
  unconverted: boolean;
  unconvertedByCurrency: Partial<Record<Currency, UnconvertedCurrencyBucket>>;
}

/** Per-currency bucket of a single investment account performance report. */
export interface InvestmentBreakdownAccount {
  accountId: string;
  name: string;
  currency: Currency;
  /** Cached cash balance of the investment account. */
  cashBalanceCents: number;
  /** Σ (quantity × currentPriceCents) over active holdings. */
  holdingsMarketValueCents: number;
  /** cash + holdings (market value). */
  totalValueCents: number;
  /** Net cash-in − cash-out (Rule 11). */
  totalInvestedCents: number;
  /** totalValue − totalInvested. */
  totalReturnCents: number;
  /** (totalReturn / totalInvested) × 100, 0 when totalInvested = 0. */
  totalReturnPct: number;
}

/** Per-currency loan aggregate exposed to the dashboard. */
export interface DashboardLoanBucket {
  currency: Currency;
  /** Outstanding PAYABLE balance (money the user owes). */
  externalDebts: number;
  /** Outstanding RECEIVABLE balance (money the user lent out). */
  receivables: number;
  /** Installments due in the current month (PENDING/PARTIAL remainder). */
  monthlyDueCents: number;
  activeCount: number;
  /** Loans with at least one overdue unpaid installment. */
  overdueCount: number;
  /** Earliest unpaid installment due date across the currency's loans. */
  nextDueDate: Date | null;
}

/** Per-currency credit card aggregate exposed to the dashboard. */
export interface DashboardCreditCardBucket {
  currency: Currency;
  debtCents: number;
  availableCreditCents: number;
  cardsCount: number;
  dueSoonCount: number;
  overdueCount: number;
  nextDueDate: Date | null;
}

/** Per-currency fixed-expense aggregate exposed to the dashboard. */
export interface DashboardFixedExpenseBucket {
  currency: Currency;
  pendingCents: number;
  overdueCents: number;
  activeCount: number;
}

/** A single upcoming fixed-expense payment (~30 day window). */
export interface DashboardUpcomingFixedExpense {
  id: string;
  fixedExpenseId: string;
  name: string;
  dueDate: Date;
  expectedAmountCents: number;
  currency: Currency;
}

/** Per-currency variable-expense aggregate exposed to the dashboard. */
export interface DashboardVariableExpenseBucket {
  currency: Currency;
  /** Sum of monitored EXPENSE magnitudes of the month. */
  totalCents: number;
  transactionCount: number;
  definitionsCount: number;
  /** Σ expectedTotalCents of the definitions with a target configured. */
  expectedTotalCents: number;
  /** Top definitions by totalCents (desc). */
  topExpenses: Array<{
    id: string;
    name: string;
    currency: Currency;
    totalCents: number;
    expectedTotalCents: number | null;
    deltaAmountPct: number | null;
    count: number;
  }>;
}

/** An active savings goal summarized for the dashboard. */
export interface DashboardSavingsGoal {
  id: string;
  name: string;
  currency: Currency;
  currentAmountCents: number;
  targetAmountCents: number;
  /** 0-100 (Decimal ROUND_HALF_EVEN, clamped). */
  progressPercentage: number;
  deadline: Date | null;
  /** Locale-aware projected completion date, or null when not projectable. */
  projectedCompletion: string | null;
  /** Deadlines that are unreachable (past due or no achievable projection). */
  atRisk: boolean;
}

/**
 * Aggregated, data-only alert. The frontend resolves the text/i18n from
 * `kind` + `severity`; the backend never ships user-facing copy.
 */
export interface DashboardAlert {
  severity: 'info' | 'warning' | 'critical';
  kind: string;
  count: number;
  amount?: { amount: number; currency: Currency };
}

/** Per-currency breakdown for every monetary KPI (Rule 2/4 — never mixed). */
export interface DashboardCurrencyBuckets {
  netWorth: MoneyBucket[];
  totalCash: MoneyBucket[];
  savings: MoneyBucket[];
  receivables: MoneyBucket[];
  creditCardDebt: MoneyBucket[];
  creditAvailable: MoneyBucket[];
  externalDebts: MoneyBucket[];
  monthlyExpenses: MoneyBucket[];
  monthlyIncome: MoneyBucket[];
  investments: MoneyBucket[];
  maxSpendable: MoneyBucket[];
  pendingFixedExpenses: MoneyBucket[];
  totalSavedCents: MoneyBucket[];
}

export interface DashboardMetrics {
  // Resumen Ejecutivo
  /**
   * COMPLETE net worth (hero KPI) expressed in the user's base currency:
   * `netWorthAssetsTotal − netWorthLiabilitiesTotal` (assets include
   * `receivables`). Every foreign-currency balance is converted to the base
   * currency with a traceable FX rate (Rule 9) before aggregation, so this
   * scalar can legitimately differ from the per-currency `byCurrency.netWorth`
   * buckets (which are NEVER mixed and stay un-converted).
   */
  netWorth: { amount: number; formatted: string; currency: Currency };
  maxSpendable: { amount: number; formatted: string; currency: Currency };
  /**
   * @deprecated Semantic alias kept for the currently shipping UI (hero trend).
   * Prefer {@link DashboardMetrics.expensesComparison}. Both carry the same
   * month-over-month EXPENSE comparison, computed on a single currency.
   */
  savingsComparison: {
    amount: number;
    formatted: string;
    isPositive: boolean;
    percentage: number;
  };
  /** Month-over-month expense comparison (canonical field). */
  expensesComparison: {
    amount: number;
    formatted: string;
    isPositive: boolean;
    percentage: number;
  };
  /** Current-month income (single currency, primary bucket). */
  monthlyIncome: { amount: number; formatted: string; currency: Currency };

  // Liquidez
  totalCash: { amount: number; formatted: string; currency: Currency };
  savings: { amount: number; formatted: string; currency: Currency };
  receivables: { amount: number; formatted: string; currency: Currency };

  // Deudas
  creditCardDebt: { amount: number; formatted: string; currency: Currency };
  creditAvailable: { amount: number; formatted: string; currency: Currency };
  externalDebts: { amount: number; formatted: string; currency: Currency };

  // Inversiones
  investments: { amount: number; formatted: string; currency: Currency };
  maxInterestRate: { amount: number; formatted: string };
  /** COP per 1 USD with provenance. */
  dollarRate: { amount: number; formatted: string; source: ExchangeRateSource };
  /** COP per 1 EUR with provenance. */
  euroRate: { amount: number; formatted: string; source: ExchangeRateSource };

  // Gastos
  monthlyExpenses: { amount: number; formatted: string; currency: Currency };
  pendingFixedExpenses: { amount: number; formatted: string; currency: Currency };

  // Savings
  activeSavingsGoals: number;
  totalSavedCents: { amount: number; formatted: string; currency: Currency };
  savingsProgress: number;

  /**
   * ASSET composition of the household patrimony, in the user's base currency
   * (`netWorthDistributionCurrency`). It includes `receivables` (money lent out)
   * alongside checking/cash/savings/pocket/investments.
   *
   * FX TRACEABILITY (Rule 9): balances held in another currency are converted
   * EXPLICITLY to the base currency (each amount with its own resolved rate)
   * BEFORE they are aggregated. This is the documented exception to the "never
   * mix currencies in one aggregate" rule — it is not an implicit blend: every
   * converted amount carries a known source rate and unconvertible balances are
   * excluded and flagged via `netWorthUnconverted`.
   *
   * Liabilities are intentionally EXCLUDED from this pie (a pie cannot render a
   * negative proportion) and reported through `netWorthLiabilities` instead.
   * Percentages are Decimal-rounded (ROUND_HALF_EVEN, 1 decimal) over the sum of
   * the positive asset slices and always add up to 100 (empty when there is no
   * positive asset).
   */
  netWorthDistribution: DistributionItem[];

  /**
   * LIABILITY composition of the household patrimony, in the user's base
   * currency: `creditCards` (Σ |negative CREDIT_CARD balance|) and
   * `loansPayable` (outstanding PAYABLE loans). Same explicit FX conversion and
   * traceability contract as `netWorthDistribution`. Percentages are
   * Decimal-rounded over the sum of the positive liability slices and always add
   * up to 100 (empty when there is no liability).
   */
  netWorthLiabilities: DistributionLiabilityItem[];

  /**
   * Sum of every ASSET (including `receivables`) in the user's base currency,
   * AFTER explicit FX conversion (Rule 9).
   *
   * NOTE (pie denominator): this is the ECONOMIC asset total and is the value
   * that feeds the hero `netWorth`. It includes negative asset-category balances
   * (e.g. an overdrawn checking account) and positive credit-card credit balances
   * (treated as an asset but not rendered as a slice because there is no card
   * credit category in the pie). With only positive slices it equals the
   * denominator of `netWorthDistribution`; otherwise it can legitimately differ
   * from the sum of the rendered slices — a pie cannot render a negative
   * proportion, so `netWorthDistribution` emits positive slices only. This
   * difference is by design and is flagged here explicitly rather than hidden.
   * Unconvertible balances are excluded and flagged via `netWorthUnconverted`.
   */
  netWorthAssetsTotal: MoneyBucket;

  /**
   * Sum of every LIABILITY (`creditCards` + `loansPayable`) in the user's base
   * currency, AFTER explicit FX conversion (Rule 9). Equals the denominator of
   * `netWorthLiabilities`.
   */
  netWorthLiabilitiesTotal: MoneyBucket;

  /**
   * `true` when at least one non-zero balance could NOT be converted to the base
   * currency (no live rate AND no usable stored fallback for that pair). Such a
   * balance is EXCLUDED from the totals above — a rate is never invented.
   */
  netWorthUnconverted: boolean;

  /**
   * FX TRACEABILITY (Rule 9) — the rate ACTUALLY applied to convert each foreign
   * currency into {@link DashboardMetrics.netWorthDistributionCurrency}, keyed by
   * the SOURCE currency. `rate` is the multiplier used (base units per 1 source
   * unit) and `source` its provenance. A currency that had a non-zero balance but
   * could not be converted appears with `rate: 0` and `source: 'unavailable'`,
   * mirroring {@link DashboardMetrics.netWorthUnconvertedByCurrency}.
   *
   * Additive (Fase 2); the existing `dollarRate`/`euroRate` KPIs remain the
   * COP-per-USD/EUR display rates.
   */
  exchangeRatesUsed: Partial<Record<Currency, ExchangeRateUsed>>;

  /**
   * Additive context for {@link DashboardMetrics.netWorthUnconverted}: per source
   * currency, the count and Σ |amount| (in the ORIGINAL currency) of the
   * balances that could not be converted, so the UI can warn with context
   * instead of a bare boolean. Empty when everything converted.
   */
  netWorthUnconvertedByCurrency: Partial<Record<Currency, UnconvertedCurrencyBucket>>;

  /**
   * Currency of `netWorthDistribution` / `netWorthLiabilities` slices: always the
   * user's `baseCurrency`. Exposing it lets the UI label the totals faithfully
   * instead of assuming a hard-coded currency (Rule 4 — currency traceability).
   */
  netWorthDistributionCurrency: Currency;

  /**
   * Sparkline series for trend visualization. Only keys backed by a REAL series
   * are emitted; a missing key means "no reliable series available" and the UI
   * must not render a sparkline for it.
   *
   * Populated keys:
   * - `monthlyExpenses` — last 6 months, the primary income/expense currency.
   * - `monthlyIncome`   — last 6 months, the primary income/expense currency.
   * - `investments`     — cumulative net invested from `getInvestmentPerformance`
   *                       (primary investments currency).
   *
   * Consumers treat an absent key as "no data" and never assume an empty array.
   */
  sparklines: Record<string, number[]>;

  // Transacciones recientes
  recentTransactions: Array<{
    id: string;
    description: string | null;
    amount: number;
    currency: Currency;
    type: string;
    date: Date;
  }>;

  // ── Fase 2 additions (all additive; no existing field was renamed/removed) ──

  /** Explicit per-currency breakdown for every monetary KPI. */
  byCurrency: DashboardCurrencyBuckets;

  /** Investment performance reusing `getInvestmentPerformance` per account. */
  investmentsBreakdown: {
    byCurrency: MoneyBucket[];
    accounts: InvestmentBreakdownAccount[];
  };

  /** Loans KPIs per currency (reconciled via `getLoansSummary`). */
  loans: {
    byCurrency: DashboardLoanBucket[];
    totalOverdueCount: number;
    nextDueDate: Date | null;
  };

  /** Credit card KPIs per currency. */
  creditCards: {
    byCurrency: DashboardCreditCardBucket[];
    totalDebt: MoneyBucket;
    totalAvailableCredit: MoneyBucket;
  };

  /** Fixed expenses KPIs per currency plus upcoming payments (~30 days). */
  fixedExpenses: {
    byCurrency: DashboardFixedExpenseBucket[];
    upcoming: DashboardUpcomingFixedExpense[];
  };

  /** Variable expenses KPIs per currency plus a top-of-month breakdown. */
  variableExpenses: {
    byCurrency: DashboardVariableExpenseBucket[];
  };

  /** Active savings goals with risk flag. */
  savingsGoals: DashboardSavingsGoal[];

  /** Aggregated, data-only alerts for the frontend to localize. */
  alerts: DashboardAlert[];

  /**
   * End-of-period projection (month + year) in COP, including the configurable
   * monthly savings target and the loan principal/interest split. See
   * {@link DashboardProjection}.
   */
  projection: DashboardProjection;
}
