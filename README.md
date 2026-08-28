# FinanceTrackerPro

Enterprise-grade financial management system with **ACID transactions**, **high-precision decimal calculations**, and an **immutable audit trail** for multi-currency asset tracking.

![Node Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=flat&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-16-%23000000?logo=nextdotjs)
![Prisma](https://img.shields.io/badge/Prisma-ORM-%232D3748?logo=prisma)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4-%2338B2AC?logo=tailwindcss)
![SonarQube](https://img.shields.io/badge/SonarQube-Quality%20Gate-005A9C?logo=sonarqube)
![Coverage](https://img.shields.io/badge/Coverage-%3E%3D80%25-green)

---

## 🏗️ Core Architecture Principles

To guarantee absolute financial integrity, FinanceTrackerPro adheres to strict banking-grade constraints:

1. **Money as Integers:** All monetary values are processed and stored as **integer cents** (e.g., `$10.00` = `1000`) to eliminate IEEE 754 floating-point rounding errors.
2. **High-Precision Calculations:** Complex math (conversions, interest) is handled via **Decimal.js** utilizing Banker's Rounding (`ROUND_HALF_EVEN`).
3. **Single Source of Truth:** The transaction history is the **only** immutable source of truth. The `account.balanceCents` field acts strictly as a transaction-isolated cache optimized for read performance.
4. **Double-Entry Accounting:** Internal transfers write symmetric `TRANSFER_OUT` (negative) and `TRANSFER_IN` (positive) entries wrapped in an atomic Prisma transaction (`$transaction`). Both share a unique `transferId`.
5. **Soft Deletes Only:** Financial records are never physically purged. Deletions use the `deletedAt` timestamp to maintain historical audit continuity.

> See [`CLAUDE.md`](CLAUDE.md) for all 14 Financial Integrity Rules and Banking-Grade Integrity Pillars enforced across the codebase.

---

## ⚡ Quick Start

Get your local development environment up and running in under two minutes.

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/JMMA86/financetrackerpro.git
cd financetrackerpro
npm install
npx playwright install
```

### 2. Configure Environment Variables

Copy the pre-filled local Docker configurations:

```bash
cp .env.example .env          # Dev database (port 5432)
cp .env.e2e.example .env.e2e  # E2E database (port 5433) — credentials pre-filled
```

Fill in your credentials in `.env`:

```env
POSTGRES_USER=<your_user>
POSTGRES_PASSWORD=<your_password>
POSTGRES_DB=<your_db_name>        # e.g. financetracker-postgres
JWT_SECRET=<min_32_chars_secret>
```

> `.env.e2e` is pre-filled for the local Docker setup. Copy and use as-is.

### 3. Spin Up Infrastructure & Initialize

```bash
# Start both Postgres containers (dev on 5432, E2E on 5433)
docker-compose -f docker-compose.postgres.yml up -d

# Apply migrations to dev database (requires interactive terminal)
npm run db:migrate

# Generate Prisma Client
npm run db:generate
```

> The E2E database is initialized automatically by `globalSetup` on the first `npx playwright test` run.

### 4. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

---

## 🗄️ Database Architecture

FinanceTrackerPro uses **three fully isolated PostgreSQL containers** — dev data never leaks into tests.

| Container                      | Host Port | Database                      | Purpose                  |
| ------------------------------ | --------- | ----------------------------- | ------------------------ |
| `financetracker-postgres`      | `5432`    | Configurable via `.env`       | Development & production |
| `financetracker-postgres-e2e`  | `5433`    | `financetracker-postgres-e2e` | E2E tests only           |
| `financetracker-postgres-test` | `5434`    | `financetrackerpro_test`      | Integration tests only   |

Both use the `public` schema. There is no schema-based isolation — the E2E container is a fully independent PostgreSQL instance.

**Prisma Studio access:**

```bash
npm run db:studio        # Dev database  → http://localhost:5555
npm run db:studio:e2e    # E2E database  → http://localhost:5556
```

> See [`DATABASE.md`](DATABASE.md) for the complete entity relationship diagram, double-entry bookkeeping implementation, reconciliation logic, and query examples.

---

## 🛠️ CLI Reference

### Database Management

| Command                 | Environment | Description                                               |
| ----------------------- | ----------- | --------------------------------------------------------- |
| `npm run db:generate`   | Dev / E2E   | Generates the type-safe Prisma Client.                    |
| `npm run db:migrate`    | Dev         | Creates a new migration and applies it (interactive).     |
| `npm run db:push`       | Dev         | Directly pushes schema changes without migration history. |
| `npm run db:reset`      | Dev         | Wipes the dev database and re-runs all migrations.        |
| `npm run db:setup:e2e`  | E2E         | Applies pending migrations to the E2E database.           |
| `npm run db:reset:e2e`  | E2E         | Wipes and re-migrates the E2E database.                   |
| `npm run db:seed:e2e`   | E2E         | Seeds the E2E database with test user and accounts.       |
| `npm run db:studio`     | Dev         | Opens Prisma Studio for the dev database (port 5555).     |
| `npm run db:studio:e2e` | E2E         | Opens Prisma Studio for the E2E database (port 5556).     |

### Quality Assurance & Testing

| Command                 | Scope              | Description                                                            |
| ----------------------- | ------------------ | ---------------------------------------------------------------------- |
| `npm test`              | Unit / Integration | Runs tests in headless CI mode.                                        |
| `npm run test:watch`    | Unit / Integration | Launches interactive Vitest watch runner.                              |
| `npm run test:ui`       | Unit / Integration | Opens the Vitest graphical interface.                                  |
| `npm run test:coverage` | Code Coverage      | Generates coverage report (enforces **80%** global floor).             |
| `npm run test:e2e`      | E2E                | Compiles Gherkin features and runs the full Playwright suite headless. |
| `npm run test:e2e:ui`   | E2E                | Compiles Gherkin features and opens the Playwright interactive UI.     |
| `npm run lint`          | Code Style         | Validates code standards via ESLint with auto-fix.                     |
| `npm run format:check`  | Code Style         | Verifies formatting via Prettier without writing.                      |

---

## 🧪 Testing Workflows

### End-to-End (Playwright + Cucumber BDD)

> ⚠️ **Important:** Shut down any active `npm run dev` before launching E2E tests. Playwright builds and mounts its own **production server** on port `3000` pointed at the isolated E2E database (port `5433`).

The E2E database is **automatically wiped, re-migrated, and re-seeded** before each test run via `e2e/global-setup.ts`. No manual reset needed.

```bash
# Headless (CI mode) — compiles features + runs suite
npm run test:e2e

# Interactive Playwright UI — compiles features + opens UI runner
npm run test:e2e:ui

# Headed mode (visual browser walkthrough)
npx bddgen && npx playwright test --headed

# Target specific feature by string match
npx bddgen && npx playwright test --grep "Autenticación"

# Step-by-step debug
npx bddgen && npx playwright test --debug

# View last test report
npx playwright show-report
```

**First-time E2E setup:**

```bash
docker-compose -f docker-compose.postgres.yml up -d postgres-e2e
npm run test:e2e
```

### Static Analysis via SonarQube

SonarQube handles full-scope code safety gates through the native **SonarQube MCP Server** (`@sonarqube/mcp-server`) configured in `opencode.jsonc`.

```bash
# 1. Start SonarQube container
docker-compose -f docker-compose.sonarqube.yml up -d

# 2. Verify connectivity
npm run sonar:check

# 3. Generate coverage reports (required for Quality Gate)
npm run test:coverage

# 4. Trigger analysis (requires OS-level $env:SONAR_TOKEN)
npm run sonar
```

- **Web Dashboard:** [http://localhost:9000/dashboard?id=financetrackerpro](http://localhost:9000/dashboard?id=financetrackerpro)
- **Default credentials:** `admin` / `admin` _(password change forced on first login)_

**Quality Gate blocks merge if:**

- Quality Gate status is `ERROR`
- Coverage drops below `80%` on new code
- TypeScript strict `any` count rises above zero
- Any `BLOCKER` or `CRITICAL` vulnerability is detected

---

## 🤖 Agent System

FinanceTrackerPro uses a **hierarchical agent orchestration model** for AI-assisted development. A single primary agent (`tech-lead`) coordinates all work and delegates to specialized subagents.

```
tech-lead (primary — orchestrator)
  ├── dev-backend    → Server Actions, Prisma, Zod validation
  ├── dev-frontend   → Next.js UI, Tailwind, accessibility
  ├── dev-tester     → Vitest unit/integration, coverage ≥ 80%
  ├── dev-e2e        → Playwright + Cucumber BDD, isolated E2E DB
  ├── qa-lead        → 14 financial integrity rules, SonarQube gates
  ├── sec-ops        → OWASP Top 10 audit, dependency scan
  └── audit-finance  → Decimal.js usage, ledger integrity (read-only)
```

> See [`AGENTS.md`](AGENTS.md) for full agent responsibilities, workflows, and quality gate criteria.

---

## 🗂️ Directory Layout

```
src/
├── actions/          # Server Actions (Zod-validated mutation layer)
├── app/              # Next.js App Router (pages & layouts)
├── components/       # Component library
│   └── ui/           # Atomic reusable presentation elements
├── db/               # Database seed scripts
├── hooks/            # Encapsulated stateful React UI hooks
├── lib/              # Core singletons & framework setup
│   ├── db/           # Prisma Client instantiation & schema
│   ├── money.ts      # Decimal.js financial arithmetic wrappers
│   └── validations/  # Centralized Zod schema models
├── services/         # Pure business logic (server-only)
├── store/            # UI state machines via Zustand (no business logic)
├── types/            # Global TypeScript type declarations
└── utils/            # Stateless pure functional helpers

e2e/                  # Playwright BDD suite
├── features/         # Gherkin Cucumber business criteria (.feature)
├── steps/            # TypeScript BDD step definitions
├── helpers/          # Shared auth and navigation helpers
├── fixtures/         # Test data constants
└── global-setup.ts   # Auto reset + seed E2E DB before each run
```

---

## 🔒 CI/CD Pipeline

The full quality suite runs on **every push or PR to `main`/`dev`** using a **self-hosted GitHub Actions runner** (Windows, on the developer machine) because SonarQube runs locally — not in the cloud.

### Workflow: `.github/workflows/quality.yml`

```yaml
on:
  push:
    branches: [main, dev]
  pull_request:
    branches: [main, dev]
runs-on: [self-hosted, windows, x64]
```

| Step                 | Command / Action                                                                     |
| -------------------- | ------------------------------------------------------------------------------------ |
| Env setup            | Creates `.env`, `.env.e2e`, `.env.test` from secrets                                 |
| Infrastructure       | `docker compose` up: Postgres dev (5432), e2e (5433), test (5434) + SonarQube (9000) |
| Dependencies         | `npm ci` + `npx prisma generate`                                                     |
| Migrations (test DB) | `prisma migrate deploy` against `financetrackerpro_test`                             |
| Lint                 | `eslint . --max-warnings=0`                                                          |
| Format               | `npm run format:check`                                                               |
| TypeScript           | `npm run type-check`                                                                 |
| Unit + coverage      | `vitest run --coverage` (excludes integration)                                       |
| Integration          | `vitest run integration` → DB test (5434)                                            |
| E2E                  | `npm run test:e2e` (Playwright + BDD, DB e2e 5433)                                   |
| SonarQube            | `npm run sonar` + Quality Gate API check                                             |
| Build                | `npm run build`                                                                      |

### Self-hosted runner setup

1. GitHub → **Settings → Actions → Runners → New self-hosted runner** → Windows x64.
2. Extract to e.g. `C:\actions-runner` and register:
   ```powershell
   .\config.cmd --url https://github.com/JMMA86/FinanceTrackerPro --token <REG_TOKEN> --labels self-hosted,windows,x64 --name financetracker-runner
   .\svc.cmd install   # run as a user account with Docker Desktop access
   ```
3. Add repository **variables** (Settings → Variables) and **secrets** (Settings → Secrets):

   | Type     | Name                | Value (local defaults)    |
   | -------- | ------------------- | ------------------------- |
   | Variable | `POSTGRES_HOST`     | `localhost`               |
   | Variable | `POSTGRES_PORT`     | `5432`                    |
   | Variable | `POSTGRES_USER`     | `postgres`                |
   | Variable | `POSTGRES_DB`       | `financetracker-postgres` |
   | Variable | `POSTGRES_SCHEMA`   | `public`                  |
   | Secret   | `POSTGRES_PASSWORD` | `admin`                   |
   | Secret   | `JWT_SECRET`        | random (see below)        |
   | Secret   | `SONAR_TOKEN`       | generated in SonarQube    |

   `DATABASE_URL` is **computed by the workflow** from the values above — no need to store it.

   Generate a strong `JWT_SECRET` with Python:

   ```powershell
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

### Prerequisites on the runner machine

- Node.js 22, Docker Desktop running, Java (sonar-scanner), Playwright browsers (`npx playwright install`)
- **Port 3000 free** while the pipeline runs (the E2E suite builds and starts its own production server; stop `npm run dev` first)
- SonarQube container up with a valid `SONAR_TOKEN` (generate at SonarQube → My Account → Security)

> ⚠️ **Security**: fork PRs are skipped (`head.repo.full_name` guard) — never run untrusted code on a self-hosted runner.
