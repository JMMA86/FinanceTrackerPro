# FinanceTrackerPro

Enterprise-grade financial management system with **ACID transactions**, **high-precision decimal calculations**, and **audit trail** for tracking banks, cash, loans, and investments.

## Core Features

### Financial Precision

- ✅ **Decimal.js precision** - Banker's rounding (ROUND_HALF_EVEN)
- ✅ **Multi-currency support** - ISO 4217 codes with conversion tracking
- ✅ **Exchange rate audit** - Preserves original amount + rate for every conversion

### Banking-Grade Integrity

- ✅ **Idempotency** - Network retry protection via UUID keys
- ✅ **Source of Truth** - Balance reconciliation from transaction history
- ✅ **Atomic transfers** - Prisma transactions (ACID compliant)

### Security & Audit

- ✅ **Soft deletes** - Never lose financial data
- ✅ **Extended audit** - IP address, user agent, timestamps
- ✅ **Server-side validation** - Zero trust architecture
- ✅ **80% test coverage** - Financial calculations tested

## Getting Started

### Prerequisites

- Node.js 20+
- Docker Desktop (for local Postgres)

### Installation

Install dependencies:

```bash
npm install
```

Create environment file from `.env.example` and fill the required values:

```bash
cp .env.example .env
```

Fill in your credentials — defaults for local Docker are already in `.env.example`:

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=<your_user>
POSTGRES_PASSWORD=<your_password>
POSTGRES_DB=<your_db_name>
POSTGRES_SCHEMA=public
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}?schema=${POSTGRES_SCHEMA}
JWT_SECRET=<min_32_chars>
```

For E2E testing, create `.env.e2e` from the example (all credentials are pre-filled for the local Docker setup):

```bash
cp .env.e2e.example .env.e2e
```

`.env.e2e` points to the isolated E2E database (`financetracker-postgres-e2e` on port **5433**) — a completely separate Docker container from dev.

You do not need PostgreSQL installed locally; use Docker Compose to run it.

Start databases (Docker Compose):

```bash
# Dev database only
docker-compose -f docker-compose.postgres.yml up -d postgres

# E2E database only
docker-compose -f docker-compose.postgres.yml up -d postgres-e2e

# Both at once
docker-compose -f docker-compose.postgres.yml up -d
```

Set up the dev database (run once after first `docker-compose up`):

```bash
npm run db:migrate     # Apply all migrations to dev database (requires interactive terminal)
npm run db:generate    # Generate Prisma Client
```

Install Playwright browsers (first time only):

```bash
npx playwright install
```

Run development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Available Scripts

### Development

- `npm run dev` - Start dev server
- `npm run build` - Build production bundle
- `npm run start` - Start production server

### Database

- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push current schema directly (dev only, no migration history)
- `npm run db:migrate` - Create a new migration and apply it (dev, interactive)
- `npm run db:reset` - Wipe dev database, re-run all migrations
- `npm run db:setup:e2e` - Apply pending migrations to the E2E database (reads `.env.e2e`)
- `npm run db:reset:e2e` - Wipe and re-migrate the E2E database (dev database untouched)
- `npm run db:seed:e2e` - Seed the E2E database with test user and accounts (reads `.env.e2e`)
- `npm run db:studio` - Open Prisma Studio for the **dev** database
- `npm run db:studio:e2e` - Open Prisma Studio for the **E2E** database (reads `.env.e2e`)

### Testing

- `npm test` - Run unit/integration tests (CI mode)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:coverage` - Coverage report (80% minimum)

### E2E Testing (Playwright + Cucumber BDD)

**Setup (first time only):**

```bash
npm install -D playwright-bdd                                       # Install playwright-bdd
npx playwright install                                              # Install browser binaries
docker-compose -f docker-compose.postgres.yml up -d postgres-e2e   # Start E2E database
```

**Run E2E tests:**

> **Stop any running `npm run dev` before running E2E tests.** Playwright starts its own dev server on port 3000 pointed at the E2E database. If port 3000 is already in use, tests will fail.

> **Always run `npx bddgen` before `npx playwright test`** — it compiles `.feature` Gherkin files into Playwright test specs.

> The E2E database is **automatically wiped, re-migrated and re-seeded** by `globalSetup` (`e2e/global-setup.ts`) before each test run. No manual reset needed.

```bash
# CLI — headless (CI mode)
npx bddgen; npx playwright test

# CLI — headed (see browser while running) -- (recommended)
npx bddgen; npx playwright test --headed

# CLI — run a specific feature
npx bddgen; npx playwright test --grep "Autenticación"

# CLI — debug mode (step-by-step with Playwright Inspector)
npx bddgen; npx playwright test --debug

# Frontend — open interactive UI to pick and run individual tests
npx playwright test --ui

# Open HTML report after running tests
npx playwright show-report
```

### Code Quality

- `npm run lint` - ESLint with auto-fix
- `npm run format` - Prettier format all files
- `npm run format:check` - Check formatting

### SonarQube Analysis

- `npm run sonar` - Run sonar-scanner (`SONAR_TOKEN` must be set in the OS environment)
- `npm run sonar:check` - Verify SonarQube server is running

### Git Hooks

Pre-commit hook (Husky + lint-staged):

- ESLint on staged `.js`, `.jsx`, `.ts`, `.tsx`
- Prettier on all staged files

## SonarQube Setup

SonarQube provides static code analysis for code quality, security vulnerabilities, and technical debt detection. Results are accessed via the **SonarQube MCP server** configured in `opencode.jsonc` — no intermediate JSON file is generated.

### Local Setup

1. **Windows users**: Set vm.max_map_count in WSL2 (required for Elasticsearch):

```bash
wsl -d docker-desktop sysctl -w vm.max_map_count=262144
```

2. Start SonarQube server (Docker Compose):

```bash
docker-compose -f docker-compose.sonarqube.yml up -d
```

3. Verify server is running:

```bash
npm run sonar:check
```

4. Access SonarQube UI:
   - URL: http://localhost:9000
   - Default credentials: `admin` / `admin`
   - Change password on first login

5. Generate authentication token:
   - Go to: User menu → My Account → Security → Generate Tokens
   - Name: `financetrackerpro`
   - Type: User Token
   - Copy token for next step

6. Set the token in the OS environment:

```powershell
# PowerShell — add to your profile for persistence
$env:SONAR_TOKEN = "squ_your_token_here"
```

> `sonar-scanner` 5.x reads `SONAR_TOKEN` natively from the OS environment. The MCP server in `opencode.jsonc` uses the same variable (`{env:SONAR_TOKEN}`). No `.env` file is needed for the scanner. All other settings (`sonar.host.url`, `sonar.projectKey`, etc.) are in `sonar-project.properties`.

7. Run analysis:

```bash
npm run sonar
```

8. View results:
   - Web UI: http://localhost:9000/dashboard?id=financetrackerpro
   - Via MCP tools in OpenCode (agents query issues, quality gate, and metrics directly)

### MCP Integration

The SonarQube MCP server (`@sonarqube/mcp-server`) is pre-configured in `opencode.jsonc`. It connects to the local SonarQube instance and exposes tools that agents use to:

- Check Quality Gate status
- Search issues by severity, type, or rule
- Query coverage and duplication metrics
- Review Security Hotspots

This replaces the previous approach of fetching issues to `.opencode/sonar-issues.json`. Agents interact with SonarQube results in real time through MCP.

### Configuration

- **Project config**: `sonar-project.properties`
- **Docker setup**: `docker-compose.sonarqube.yml`
- **Coverage path**: `coverage/lcov.info`
- **MCP config**: `opencode.jsonc` → `mcp.sonarqube`

### Quality Gates

Default quality gate enforces:

- **Coverage**: 80% minimum (enforced via Vitest)
- **Bugs**: Zero tolerance (blocks merge)
- **Vulnerabilities**: Zero tolerance (blocks merge)
- **Security Hotspots**: Manual review required
- **Cognitive Complexity**: Max 15 per function
- **Code Duplication**: Max 3% across project
- **TypeScript Strictness**: Zero `any` types in production code

**Merge blocked if**:

- Quality Gate status is `ERROR`
- Any BLOCKER or CRITICAL issues exist
- Coverage on new code drops below 80%
- New security vulnerabilities introduced

### CI/CD Integration

For production CI/CD:

1. Set environment variables:

   ```bash
   SONAR_HOST_URL=https://sonarqube.yourdomain.com
   SONAR_TOKEN=your_production_token
   ```

2. Add to CI pipeline (GitHub Actions example):

```yaml
# .github/workflows/quality.yml
- name: Run Tests with Coverage
  run: npm run test:coverage

- name: SonarQube Analysis
  run: npm run sonar
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}

- name: Check Quality Gate
  run: |
    STATUS=$(curl -s -u $SONAR_TOKEN: \
      "$SONAR_HOST_URL/api/qualitygates/project_status?projectKey=financetrackerpro" \
      | jq -r '.projectStatus.status')
    if [ "$STATUS" != "OK" ]; then
      echo "❌ Quality gate failed: $STATUS"
      exit 1
    fi
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
```

3. Configure quality gate in SonarQube UI to block PRs with issues

### Running Analysis Workflow

```bash
# 1. Verify SonarQube is running
npm run sonar:check

# 2. Run tests with coverage (generates lcov.info)
npm run test:coverage

# 3. Trigger scanner analysis
npm run sonar

# 4. Results available in:
#    - SonarQube UI: http://localhost:9000/dashboard?id=financetrackerpro
#    - OpenCode agents: via MCP SonarQube tools
```

**Severity levels**:

- **BLOCKER**: Merge blocked (security vulnerabilities)
- **CRITICAL**: Review required (bugs, type safety)
- **MAJOR**: Should be fixed (code smells)
- **MINOR**: Optional improvement
- **INFO**: Informational only

**Issue types**:

- **BUG**: Runtime error risk
- **VULNERABILITY**: Security risk
- **CODE_SMELL**: Maintainability issue
- **SECURITY_HOTSPOT**: Manual security review needed

### Database Connection Test

Validate database connectivity:

```bash
# Check if app can reach database
npx dotenv -e .env -- tsx src/lib/db-check.ts
```

This queries user, account, and transaction counts via Prisma.

## Tech Stack

### Core

- **Framework**: Next.js 16 + React 19 (App Router)
- **Language**: TypeScript 5 (strict mode)
- **Database**: PostgreSQL + Prisma ORM

### Financial Precision

- **Calculations**: Decimal.js (20-digit precision, Banker's rounding)
- **Storage**: Integer cents (no float precision issues)
- **Currency**: Multi-currency with ISO 4217 codes

### Validation & Security

- **Validation**: Zod (server-side + client hints)
- **Server Actions**: `server-only` package
- **ACID Transactions**: Prisma `$transaction`

### State & Styling

- **State**: Zustand (UI state only - NO business logic)
- **Styling**: Tailwind CSS 4

### Quality & Testing

- **Unit/Integration Testing**: Vitest + React Testing Library
- **E2E Testing**: Playwright + `playwright-bdd` + Cucumber (Gherkin `.feature` files)
- **Coverage**: 80% minimum enforced
- **Linting**: ESLint + TypeScript ESLint
- **Formatting**: Prettier
- **Git Hooks**: Husky + lint-staged
- **Static Analysis**: SonarQube (code quality, security, coverage)
- **Logging**: Pino (structured JSON in production)

## Project Structure

```
src/
├── actions/          # Server Actions (validated mutations)
│   ├── account.actions.ts
│   └── transfer.actions.ts
├── app/              # Next.js App Router (pages)
├── components/
│   └── ui/           # Reusable UI components
├── db/
│   └── seed/         # Database seed scripts
├── hooks/            # Custom React hooks
├── lib/
│   ├── db/           # Prisma client + schema
│   │   ├── index.ts      # Singleton client
│   │   └── schema.prisma # Database schema
│   ├── money.ts      # Decimal.js financial utils
│   └── validations/  # Zod schemas
│       └── finance.ts
├── services/         # Business logic (server-only)
│   └── financial.service.ts
├── store/            # Zustand stores (UI state only)
│   ├── useAccountStore.ts
│   └── useTransactionStore.ts
├── types/            # TypeScript definitions
│   └── finance.d.ts
├── utils/            # Pure helper functions
│   └── formatCurrency.ts
└── __tests__/        # Test files (co-located)
    └── unit/

e2e/                  # Playwright E2E tests (Cucumber BDD)
├── features/         # Gherkin .feature files (human-readable scenarios)
│   ├── auth.feature
│   ├── dashboard.feature
│   ├── accounts.feature
│   └── transactions.feature
├── steps/            # Step definitions (TypeScript)
│   ├── auth.steps.ts
│   ├── dashboard.steps.ts
│   ├── accounts.steps.ts
│   ├── transactions.steps.ts
│   └── common.steps.ts
├── helpers/
│   └── auth.ts       # Shared login helper
└── fixtures/
    └── index.ts      # Playwright fixtures
```

## Database Architecture

See [DATABASE.md](DATABASE.md) for complete entity relationship diagram, reconciliation logic, query examples, and architecture details.

### Double-Entry Bookkeeping

**Transfer Logic**: Transfers implemented using double-entry accounting principles.

When transferring money between accounts:

1. **Transaction 1** (Source Account):
   - Type: `TRANSFER_OUT`
   - Amount: Negative (debit)
   - Account: Source

2. **Transaction 2** (Destination Account):
   - Type: `TRANSFER_IN`
   - Amount: Positive (credit)
   - Account: Destination

Both transactions share same `transferId` (UUID) for audit trail. This ensures:

- ✅ Balance integrity (sum always zero across paired transactions)
- ✅ Audit trail (both entries linked)
- ✅ Reconciliation accuracy (each account has complete history)
- ✅ Rollback safety (delete both or neither)

**Example**:

```typescript
// Transfer $100 from Savings to Investment
const transferId = crypto.randomUUID();

// Debit source (TRANSFER_OUT)
await prisma.transaction.create({
  data: {
    accountId: savingsId,
    type: 'TRANSFER_OUT',
    amountCents: -10000, // Negative
    transferId,
    transferToAccountId: investmentId,
  },
});

// Credit destination (TRANSFER_IN)
await prisma.transaction.create({
  data: {
    accountId: investmentId,
    type: 'TRANSFER_IN',
    amountCents: 10000, // Positive
    transferId,
    transferFromAccountId: savingsId,
  },
});
```

### Precision & Rounding

All monetary calculations use:

- **Storage**: Integer cents (no floats)
- **Calculations**: Decimal.js with Banker's rounding
- **Exchange rates**: `Decimal(20, 8)` precision
- **Interest rates**: `Decimal(20, 8)` for compound interest accuracy

## Architecture Rules

See `CLAUDE.md` for complete financial integrity rules.

### Key Principles

1. **Money = Integers (cents)** - Store as cents, calculate with Decimal.js
2. **Multi-currency by design** - Every amount has ISO 4217 currency code
3. **Atomic transactions** - Use `prisma.$transaction()` for transfers
4. **Soft deletes only** - Financial records never physically deleted
5. **Server-side validation** - Never trust client input
6. **Banker's rounding** - IEEE 754 ROUND_HALF_EVEN standard
7. **Audit trail** - Track `createdBy`, `lastModifiedBy`, `deletedAt`

### Example: Atomic Transfer

```typescript
// src/actions/transfer.actions.ts
await prisma.$transaction(async (tx) => {
  // Deduct from source
  await tx.account.update({
    where: { id: fromId },
    data: { balanceCents: subtract(balance, amount) },
  });

  // Add to destination
  await tx.account.update({
    where: { id: toId },
    data: { balanceCents: add(balance, amount) },
  });

  // Audit trail
  await tx.transfer.create({ data: transferRecord });
});
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
