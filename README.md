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
- PostgreSQL 14+

### Installation

Install dependencies:

```bash
npm install
```

Configure environment (`.env`):

```env
DATABASE_URL="postgresql://user:password@localhost:5432/financetracker"
```

Setup database:

```bash
npm run db:push        # Dev: Quick schema sync
npm run db:migrate     # Prod: Traceable migrations
npm run db:generate    # Generate Prisma Client
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
- `npm run db:push` - Push schema (dev only - no migration history)
- `npm run db:migrate` - Create migration (prod - traceable changes)
- `npm run db:studio` - Open Prisma Studio GUI

### Testing

- `npm test` - Run tests (CI mode)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:ui` - Run tests with Vitest UI
- `npm run test:coverage` - Coverage report (80% minimum)

### Code Quality

- `npm run lint` - ESLint with auto-fix
- `npm run format` - Prettier format all files
- `npm run format:check` - Check formatting
- `npm run sonar` - Run SonarQube analysis

### Git Hooks

Pre-commit hook (Husky + lint-staged):

- ESLint on staged `.js`, `.jsx`, `.ts`, `.tsx`
- Prettier on all staged files

## SonarQube Setup

SonarQube provides static code analysis for code quality, security vulnerabilities, and technical debt detection.

### Local Setup

1. **Windows users**: Set vm.max_map_count in WSL2 (required for Elasticsearch):

```bash
wsl -d docker-desktop sysctl -w vm.max_map_count=262144
```

2. Start SonarQube server (Docker Compose):

```bash
docker-compose -f docker-compose.sonarqube.yml up -d
```

2. Access SonarQube UI:
   - URL: http://localhost:9000
   - Default credentials: `admin` / `admin`
   - Change password on first login

3. Generate authentication token:
   - Go to: User menu → My Account → Security → Generate Tokens
   - Name: `financetrackerpro`
   - Copy token for next step

4. Configure token in `.env`:

```bash
# Add to .env file
SONAR_TOKEN=your_token_here
```

5. Run analysis:

```bash
# Generate coverage report first
npm run test:coverage

# Run SonarQube scan
npm run sonar
```

6. View results:
   - Open http://localhost:9000
   - Navigate to `financetrackerpro` project

### Configuration

- **Project config**: `sonar-project.properties`
- **Docker setup**: `docker-compose.sonarqube.yml`
- **Coverage path**: `coverage/lcov.info`

### Quality Gates

Default quality gate enforces:

- 80% minimum coverage
- 0 security vulnerabilities
- 0 bugs
- Maintainability rating A

### CI/CD Integration

For production CI/CD:

1. Set `SONAR_HOST_URL` and `SONAR_TOKEN` environment variables
2. Run `npm run sonar` in CI pipeline after tests
3. Configure quality gate to block PRs with issues

### Running Analysis Workflow

Complete workflow for code quality check:

```bash
# 1. Run tests with coverage (generates lcov.info)
npm run test:coverage

# 2. Run SonarQube analysis (requires server + SONAR_TOKEN in .env)
npm run sonar

# 3. View results at http://localhost:9000/dashboard?id=financetrackerpro
```

**Note**: The scanner automatically reads `SONAR_TOKEN` from the environment via `dotenv-cli`.

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

- **Testing**: Vitest + React Testing Library
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
