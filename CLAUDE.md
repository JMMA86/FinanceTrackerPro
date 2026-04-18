@AGENTS.md

## Financial Integrity Rules

### 1. High-Precision Money Handling

- **CRITICAL: Use `decimal.js` for ALL financial calculations**
- Store amounts as **integers (cents)** in database
- Use `src/lib/money.ts` utilities (never raw arithmetic)
- Rounding: **Banker's rounding (ROUND_HALF_EVEN)** - IEEE 754 standard
- Example: $10.50 = 1050 cents
- Precision: 20 decimal places configured in Decimal.js

```typescript
// ❌ WRONG - Float imprecision
const total = 10.1 + 20.2; // 30.30000000000004

// ✅ CORRECT - Decimal.js precision
import { addCents } from '@/lib/money';
const total = addCents(1010, 2020); // 3030 cents
```

### 2. Multi-Currency by Design

- **Every monetary amount MUST have ISO 4217 currency code**
- Currency stored alongside amount in all models
- No implicit currency assumptions
- Currency conversion requires explicit exchange rate
- Example: `{ amountCents: 1050, currency: 'USD' }`

### 3. Atomic Transactions (ACID Compliance)

- **MANDATORY: Use `prisma.$transaction()` for multi-record operations**
- All transfers between accounts MUST be atomic
- Example: Transfer deducts from A and adds to B in single transaction
- If ANY step fails, ALL steps rollback
- Location: `src/actions/transfer.actions.ts`

```typescript
// ✅ REQUIRED pattern
await prisma.$transaction(async (tx) => {
  await tx.account.update({ where: { id: fromId }, data: { balanceCents: subtract } });
  await tx.account.update({ where: { id: toId }, data: { balanceCents: add } });
  await tx.transfer.create({ data: transferRecord });
});
```

### 4. Audit Trail & Soft Deletes

- **NEVER physically delete financial records**
- Use `isActive: false` + `deletedAt` for soft deletes
- Track `createdBy`, `lastModifiedBy` on all mutations
- All models have audit fields: `createdAt`, `updatedAt`, `deletedAt`
- Queries MUST filter `isActive: true` to exclude deleted records

### 5. Server-Side Validation (Zero Trust)

- **Client validation is UX only - NEVER trust it**
- ALL mutations MUST validate in Server Actions (`src/actions/`)
- Import `server-only` in all server-side financial logic
- Zod validation happens server-side before database writes
- Zustand stores are UI state only - NO business logic

```typescript
// ✅ Server Action structure
'use server';
import 'server-only';
import { CreateAccountSchema } from '@/lib/validations/finance';

export async function createAccountAction(input: unknown) {
  const validated = CreateAccountSchema.parse(input); // Server validation
  // ... database operations
}
```

### 6. Separation of Concerns

- **Client (Zustand)**: UI state, loading states, optimistic updates only
- **Server (Actions)**: Validation, business logic, database mutations
- **Services**: Complex multi-step operations, calculations
- **Utils**: Pure functions for money calculations

**Folder structure:**

- `src/actions/` - Server Actions (validated mutations)
- `src/services/` - Business logic (server-only)
- `src/lib/money.ts` - Financial calculations (decimal.js)
- `src/store/` - UI state only (NO calculations)

### 7. TypeScript Strictness

- Strict mode enabled
- NO `any` types in financial code
- Use branded types for money amounts
- Discriminated unions for transaction types
- Exhaustive switch checks with `never`

### 8. Testing Requirements

- 80% minimum coverage
- Test money calculations with edge cases (rounding)
- Test atomic transactions (rollback scenarios)
- Test currency conversions
- Mock external services, never database in integration tests

### 9. Database Constraints

- Use PostgreSQL `CHECK` constraints for positive balances
- Use foreign key `ON DELETE RESTRICT` for financial records
- Index all foreign keys and query filters (`isActive`, `date`)
- Use `@@unique` for natural keys (account number, etc)

### 10. Security Rules

- Rate limit money transfer actions
- Require MFA for large transactions (configure threshold)
- Log all financial operations (audit trail)
- Encrypt sensitive data at rest
- Use row-level security (RLS) when multi-tenant

---

## Banking-Grade Integrity Pillars

### 11. Currency Traceability (Audit Trail)

**RULE**: Every currency conversion MUST preserve original amount and exchange rate.

**Why**: Historical reports require exact conversion rates used at transaction time. Exchange rates fluctuate - cannot reconstruct past transactions with current rates.

**Implementation**:

```prisma
model Transaction {
  amountCents         Int      // Final amount (after conversion)
  currency            Currency // Final currency

  // Conversion tracking (required if currency != originalCurrency)
  originalAmountCents Int?     // Amount before conversion
  originalCurrency    Currency? // Source currency
  exchangeRate        Decimal?  // Rate at transaction time
}
```

**Validation rules**:

- If `originalCurrency != currency`, then `exchangeRate` MUST be set
- `exchangeRate` stored with 6 decimal places minimum
- Never update `exchangeRate` after creation (immutable)

**Example**:

```typescript
// User pays 100 EUR, account in USD
const transaction = {
  amountCents: 11000, // $110 USD (final)
  currency: 'USD',
  originalAmountCents: 10000, // 100 EUR (original)
  originalCurrency: 'EUR',
  exchangeRate: new Decimal('1.10'), // EUR to USD rate
};
```

### 12. Idempotency (Network Safety)

**RULE**: ALL transaction/transfer mutations MUST be idempotent via `idempotencyKey`.

**Why**: Network retries, double-clicks, and browser back buttons cause duplicate charges. Idempotency prevents charging user twice for same operation.

**Implementation**:

```prisma
model Transaction {
  idempotencyKey String @unique // UUID v4 from client
}

model Transfer {
  idempotencyKey String @unique // UUID v4 from client
}
```

**Server Action pattern**:

```typescript
'use server';
import { checkIdempotencyKey } from '@/services/idempotency.service';

export async function createTransactionAction(input: {
  idempotencyKey: string;
  amountCents: number;
  // ...
}) {
  // 1. Validate idempotency key format
  if (!validateIdempotencyKey(input.idempotencyKey)) {
    throw new Error('Invalid idempotency key - must be UUID v4');
  }

  // 2. Check if already processed
  const existing = await checkIdempotencyKey(input.idempotencyKey);
  if (existing.exists) {
    // Return existing result (idempotent)
    return { success: true, data: existing.record, idempotent: true };
  }

  // 3. Process transaction (first time)
  const transaction = await prisma.transaction.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      amountCents: input.amountCents,
      // ...
    },
  });

  return { success: true, data: transaction, idempotent: false };
}
```

**Client requirements**:

- Generate UUID v4 client-side: `crypto.randomUUID()`
- Store key before API call (localStorage for retry)
- Reuse same key on network retry
- Never reuse key across different operations

**Key lifecycle**:

- Keys expire after 24 hours (cleanup job)
- Only soft-deleted records cleaned
- Active records keep keys forever (audit)

### 13. Source of Truth & Reconciliation

**RULE**: `Account.balanceCents` is READ CACHE only. Transaction history is SOURCE OF TRUTH.

**Why**: Balance can drift due to race conditions, failed transactions, or bugs. Reconciliation ensures cached balance matches computed history.

**Implementation**:

```prisma
model Account {
  balanceCents   Int      // CACHE - reconcile from transactions
  lastReconciled DateTime? // Last reconciliation timestamp
}
```

**Reconciliation algorithm**:

```typescript
// Source of truth computation
function computeTrueBalance(accountId: string): number {
  const transactions = getActiveTransactions(accountId);
  const incomingTransfers = getIncomingTransfers(accountId);
  const outgoingTransfers = getOutgoingTransfers(accountId);

  let balance = 0;

  // Add income transactions
  for (const tx of transactions.INCOME) {
    balance += tx.amountCents;
  }

  // Subtract expenses
  for (const tx of transactions.EXPENSE) {
    balance -= tx.amountCents;
  }

  // Add incoming transfers
  for (const transfer of incomingTransfers) {
    balance += transfer.amountCents;
  }

  // Subtract outgoing transfers
  for (const transfer of outgoingTransfers) {
    balance -= transfer.amountCents;
  }

  return balance;
}

// Reconcile cached balance
async function reconcileAccount(accountId: string) {
  const trueBalance = computeTrueBalance(accountId);
  const cachedBalance = await getAccountBalance(accountId);

  if (trueBalance !== cachedBalance) {
    // Fix discrepancy
    await prisma.account.update({
      where: { id: accountId },
      data: {
        balanceCents: trueBalance,
        lastReconciled: new Date(),
        lastModifiedBy: 'system-reconciliation',
      },
    });

    // Alert discrepancy
    logger.error('Balance discrepancy', {
      accountId,
      cached: cachedBalance,
      computed: trueBalance,
      diff: cachedBalance - trueBalance,
    });
  }
}
```

**Reconciliation schedule**:

- Run hourly for active accounts
- Run on-demand before large transactions
- Run after failed transaction rollbacks
- Alert ops team if discrepancy > $10

**Query rules**:

- Display balance from cache for UX (fast)
- Validate balance from source before mutations
- Never trust cached balance in business logic

**Location**: `src/services/reconciliation.service.ts`

### 14. Extended Audit Fields

**RULE**: Critical operations MUST log IP address and user agent for security audits.

**Implementation**:

```prisma
model Transaction {
  ipAddress  String? // Client IP (IPv4/IPv6)
  userAgent  String? // Browser/app identifier
}

model Transfer {
  ipAddress  String? // Client IP
  userAgent  String? // Browser/app identifier
}
```

**Capture in Server Actions**:

```typescript
import { headers } from 'next/headers';

export async function createTransactionAction(input: unknown) {
  const headersList = headers();
  const ipAddress = headersList.get('x-forwarded-for') || 'unknown';
  const userAgent = headersList.get('user-agent') || 'unknown';

  await prisma.transaction.create({
    data: {
      ...validated,
      ipAddress,
      userAgent,
    },
  });
}
```

**Use cases**:

- Fraud detection (unusual locations)
- Security forensics (compromised accounts)
- Compliance reporting (PCI-DSS requirements)
- Rate limiting by IP
