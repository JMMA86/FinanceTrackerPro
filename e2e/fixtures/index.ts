/**
 * E2E Test Fixtures
 * Shared test data and configuration
 */

export const TEST_USER = {
  email: process.env.E2E_TEST_USER ?? 'e2e@financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'E2E Test User',
};

/**
 * Isolated user for investments-accounts.feature — create/deposit/withdraw/buy
 * scenarios. This user is seeded with a COP bank account ("Cuenta Bancaria COP")
 * that acts as the deposit source.
 *
 * Kept SEPARATE from INVESTMENTS_VISUAL_USER below: the visual feature deletes
 * every INVESTMENT account to assert the empty state, which raced with the
 * create/deposit scenarios of this file when both shared the same seed user.
 */
export const INVESTMENTS_TEST_USER = {
  email: process.env.E2E_INVESTMENTS_USER ?? 'investments@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Investments E2E User',
};

/**
 * Isolated user for investments.feature (visual / modal / empty-state / mobile).
 * Has NO investment accounts. The empty-state scenario hard-deletes investment
 * accounts, so it must NEVER share the user with investments-accounts.feature
 * (they run in parallel workers).
 */
export const INVESTMENTS_VISUAL_USER = {
  email: process.env.E2E_INVESTMENTS_VISUAL_USER ?? 'investments-visual@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Investments Visual E2E User',
};

/** Isolated user for accounts.feature — accounts tests never touch the auth or dashboard users. */
export const ACCOUNTS_TEST_USER = {
  email: process.env.E2E_ACCOUNTS_USER ?? 'accounts@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Accounts E2E User',
};

/**
 * Isolated user for dashboard.feature — seeded with a deterministic, ledger-backed
 * patrimony (3 asset accounts + 1 credit card with debt + 1 receivable and 1
 * payable loan) so the redesigned "Distribución Patrimonial" (Option A) renders
 * its donut and Activos/Pasivos lists. This user is NOT empty; the empty-state
 * scenarios use DASHBOARD_EMPTY_USER below.
 */
export const DASHBOARD_TEST_USER = {
  email: process.env.E2E_DASHBOARD_USER ?? 'dashboard@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Dashboard E2E User',
};

/**
 * Isolated user for dashboard.feature @empty-state — has NO accounts, cards,
 * loans or transactions, so every KPI renders $0 and "Distribución Patrimonial"
 * renders its empty state ("Sin datos" / "Agrega cuentas para ver distribución").
 * Kept separate so non-empty distribution assertions never collide with it.
 */
export const DASHBOARD_EMPTY_USER = {
  email: process.env.E2E_DASHBOARD_EMPTY_USER ?? 'dashboard-empty@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Empty Dashboard E2E User',
};

/** Isolated user for savings.feature — savings tests need pre-seeded accounts and goals. */
export const SAVINGS_TEST_USER = {
  email: process.env.E2E_SAVINGS_USER ?? 'savings@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Savings E2E User',
};

/**
 * Isolated user for savings.feature @empty scenarios — this user has NO goals
 * and NO accounts, so the savings page must render the empty state. Never reuse
 * another feature's user (the old empty-state test coupled to the auth user).
 */
export const SAVINGS_EMPTY_USER = {
  email: process.env.E2E_SAVINGS_EMPTY_USER ?? 'savings-empty@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Empty Savings E2E User',
};

/**
 * Isolated user for credit-cards.feature — seeded with two bank accounts (funding
 * source + transfer pair) and two deterministic credit cards ("Visa E2E" with
 * debt, "Mastercard E2E" without debt). Consumption/payment/delete scenarios
 * create their own cards via the UI with unique names, so the seed cards remain
 * untouched for the whole run.
 */
export const CREDIT_CARDS_TEST_USER = {
  email: process.env.E2E_CARDS_USER ?? 'cards@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Credit Cards E2E User',
};

/**
 * Isolated user for fixed-expenses.feature — seeded with a funded CHECKING/COP
 * account and four deterministic monthly templates (paid / pending / overdue).
 */
export const FIXED_EXPENSES_TEST_USER = {
  email: process.env.E2E_FIXED_EXPENSES_USER ?? 'fixed-expenses@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Fixed Expenses E2E User',
};

/**
 * Isolated user for fixed-expenses.feature @empty — has NO fixed expenses (and
 * no accounts) so the page renders the empty state.
 */
export const FIXED_EXPENSES_EMPTY_USER = {
  email:
    process.env.E2E_FIXED_EXPENSES_EMPTY_USER ?? 'fixed-expenses-empty@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Empty Fixed Expenses E2E User',
};

/**
 * Isolated user for variable-expenses.feature — seeded with a funded
 * CHECKING/COP account (ledger-backed), four monitored definitions with monthly
 * targets and 6 months of linked EXPENSE transactions, plus two fixed-expense
 * templates so the transaction form's Fijo nature can be exercised.
 */
export const VARIABLE_EXPENSES_TEST_USER = {
  email: process.env.E2E_VARIABLE_EXPENSES_USER ?? 'variable-expenses@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Variable Expenses E2E User',
};

/**
 * Isolated user for variable-expenses.feature @empty — has NO monitored
 * definitions (and no accounts) so the page renders the empty state.
 */
export const VARIABLE_EXPENSES_EMPTY_USER = {
  email:
    process.env.E2E_VARIABLE_EXPENSES_EMPTY_USER ??
    'variable-expenses-empty@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Empty Variable Expenses E2E User',
};

/**
 * Isolated user for loans.feature — seeded with a ledger-backed COP bank
 * account ("Bancolombia (Ahorros)"), a small-balance "Efectivo" account (for the
 * balance guard), a RECEIVABLE loan with 2 paid installments and a PAYABLE loan
 * with 1 paid installment, all generated with the real amortization engine.
 */
export const LOANS_TEST_USER = {
  email: process.env.E2E_LOANS_USER ?? 'loans@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Loans E2E User',
};

/**
 * Isolated user for loans.feature @empty — has NO loans (and no accounts) so the
 * loans page must render the empty state.
 */
export const LOANS_EMPTY_USER = {
  email: process.env.E2E_LOANS_EMPTY_USER ?? 'loans-empty@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Empty Loans E2E User',
};

/**
 * Isolated user for transfers.feature — seeded with two COP accounts
 * ("Efectivo" CASH and "Bancolombia Ahorros" SAVINGS) so the transfer
 * happy-path/error/validation scenarios own their balances.
 *
 * Kept SEPARATE from the transactions user: transfers.feature used to login as
 * `transactions@e2e...`, and its TRANSFER_OUT/TRANSFER_IN rows raced with
 * transactions.feature's fixed 20-row pagination assertions when both files ran
 * in parallel workers.
 */
export const TRANSFERS_TEST_USER = {
  email: process.env.E2E_TRANSFERS_USER ?? 'transfers@e2e.financetrackerpro.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'E2ePassword123',
  name: 'Transfers E2E User',
};

export const INVALID_CREDENTIALS = { email: 'nonexistent@test.com', password: 'WrongPass123' };

export const NEW_USER = {
  name: 'New Test User',
  email: 'newuser@financetrackerpro.com',
  password: 'NewUserPass1',
};

export const WEAK_PASSWORD = 'abc';
export const SHORT_PASSWORD = 'Ab1';
export const NO_UPPER_PASSWORD = 'abcdefgh1';
export const NO_LOWER_PASSWORD = 'ABCDEFG1';
export const NO_NUMBER_PASSWORD = 'Abcdefgh';

export const PASSWORD_REQUIREMENTS_LABELS = {
  es: ['Al menos 8 caracteres', 'Una letra mayúscula', 'Una letra minúscula', 'Un número'],
  en: ['At least 8 characters', 'One uppercase letter', 'One lowercase letter', 'One number'],
};
