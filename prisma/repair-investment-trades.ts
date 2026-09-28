/**
 * Repair Investment Trades (C2)
 *
 * The seeded/dev database has legacy INVESTMENT transactions that predate the
 * structured `asset*` columns and, in some cases, are DUPLICATED (same
 * accountId + currency + type + amountCents + date + description). Because the
 * investment ledger replay (Rule 11) only sees rows with complete structured
 * data, those rows must be (1) de-duplicated and (2) backfilled before trades
 * can be edited/reversed.
 *
 * This standalone script (no `server-only`) is IDEMPOTENT and defaults to
 * DRY-RUN:
 *   1. Group active INVESTMENT rows by (accountId, currency, type, amountCents,
 *      date, description). Keep the oldest `createdAt`; soft-delete the rest.
 *   2. Backfill `assetSymbol`/`assetQuantity`/`assetPricePerShareCents`/
 *      `assetTradeType` by parsing `description` with Decimal.js (never native
 *      float). Unparseable descriptions are left untouched and reported.
 *   3. Replay each (accountId, symbol) holding from the resulting ledger and
 *      report quantity/avgCost discrepancies against the existing holding.
 *   4. Reconcile every affected investment account's cached balance from the
 *      ledger (sum of active transactions) and report before → after.
 *
 * Run:  npx tsx prisma/repair-investment-trades.ts            (dry-run)
 *       npx tsx prisma/repair-investment-trades.ts --apply    (write)
 */

import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
dotenvExpand.expand(dotenv.config({ override: true }));

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { Decimal } from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');
const ACTOR = 'repair-investment-trades';

type TradeType = 'BUY' | 'SELL';

/** `Buy 0.0656 SPY @ 762.6` / `Sell ... @ ...` — price in MAJOR units. */
const AT_PRICE_RE = /^(Buy|Sell)\s+([\d.]+)\s+([A-Za-z0-9./-]+)\s*@\s*([\d.]+)$/;
/** `Compra 0.4 AAPL` / `Venta 0.05 TSLA` — price derived from amount / qty. */
const PLAIN_RE = /^(Compra|Venta)\s+([\d.]+)\s+([A-Za-z0-9./-]+)$/;

interface ParsedTrade {
  tradeType: TradeType;
  symbol: string;
  quantity: Decimal;
  pricePerShareCents: number;
}

interface ResolvedTrade {
  id: string;
  accountId: string;
  currency: string;
  amountCents: bigint;
  date: Date;
  createdAt: Date;
  description: string | null;
  symbol: string | null;
  quantity: Decimal | null;
  pricePerShareCents: number | null;
  tradeType: TradeType | null;
  needsBackfill: boolean;
}

/** Round a Decimal to integer cents (Banker's rounding). */
function toCents(value: Decimal): number {
  return value.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
}

function parseDescription(description: string | null, amountCents: bigint): ParsedTrade | null {
  if (!description) return null;
  const text = description.trim();

  const at = AT_PRICE_RE.exec(text);
  if (at) {
    const quantity = new Decimal(at[2]);
    const symbol = at[3].toUpperCase();
    const priceMajor = new Decimal(at[4]);
    const pricePerShareCents = toCents(priceMajor.times(100));
    if (!quantity.isPositive() || pricePerShareCents <= 0) return null;
    return {
      tradeType: at[1] === 'Buy' ? 'BUY' : 'SELL',
      symbol,
      quantity,
      pricePerShareCents,
    };
  }

  const plain = PLAIN_RE.exec(text);
  if (plain) {
    const quantity = new Decimal(plain[2]);
    const symbol = plain[3].toUpperCase();
    if (!quantity.isPositive()) return null;
    // `amountCents` is ALREADY in cents, so |amountCents| / qty is already
    // cents-per-share. (Applying a major→cents conversion here would inflate
    // the price by 100x.)
    const absAmount = new Decimal(
      (amountCents < BigInt(0) ? -amountCents : amountCents).toString()
    );
    const pricePerShareCents = toCents(absAmount.dividedBy(quantity));
    if (pricePerShareCents <= 0) return null;
    return {
      tradeType: amountCents < BigInt(0) ? 'BUY' : 'SELL',
      symbol,
      quantity,
      pricePerShareCents,
    };
  }

  return null;
}

function dedupKey(t: {
  accountId: string;
  currency: string;
  amountCents: bigint;
  date: Date;
  description: string | null;
}): string {
  return [
    t.accountId,
    t.currency,
    t.amountCents.toString(),
    t.date.toISOString(),
    t.description ?? '',
  ].join('|');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required.');
    process.exit(1);
  }

  console.log(`\n=== Investment trade repair (${APPLY ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const rows = await prisma.transaction.findMany({
    where: { type: 'INVESTMENT', isActive: true },
    select: {
      id: true,
      accountId: true,
      currency: true,
      amountCents: true,
      date: true,
      createdAt: true,
      description: true,
      createdBy: true,
      assetSymbol: true,
      assetQuantity: true,
      assetPricePerShareCents: true,
      assetTradeType: true,
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  console.log(`Active INVESTMENT rows: ${rows.length}`);

  // -------------------------------------------------------------------------
  // 1. Duplicate detection
  // -------------------------------------------------------------------------
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = dedupKey(row);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  const duplicateIds = new Set<string>();
  const keptIds = new Set<string>();
  for (const group of duplicateGroups) {
    // rows are pre-sorted by createdAt asc, id asc → first is the keeper.
    keptIds.add(group[0].id);
    for (const row of group.slice(1)) duplicateIds.add(row.id);
  }

  console.log(
    `Duplicate groups: ${duplicateGroups.length} (${duplicateGroups.reduce((n, g) => n + g.length, 0)} rows → ${duplicateGroups.length} kept, ${duplicateIds.size} soft-deleted)`
  );

  // -------------------------------------------------------------------------
  // 2. Backfill plan (kept rows only; duplicates are excluded at replay time)
  // -------------------------------------------------------------------------
  const resolved: ResolvedTrade[] = [];
  const unparseable: Array<{ id: string; description: string | null }> = [];
  let backfilled = 0;

  for (const row of rows) {
    if (duplicateIds.has(row.id)) continue;

    const complete =
      row.assetSymbol != null &&
      row.assetQuantity != null &&
      row.assetPricePerShareCents != null &&
      row.assetTradeType != null;

    if (complete) {
      resolved.push({
        id: row.id,
        accountId: row.accountId,
        currency: row.currency,
        amountCents: row.amountCents,
        date: row.date,
        createdAt: row.createdAt,
        description: row.description,
        symbol: row.assetSymbol,
        quantity: new Decimal(row.assetQuantity!.toString()),
        pricePerShareCents: Number(row.assetPricePerShareCents),
        tradeType: row.assetTradeType === 'SELL' ? 'SELL' : 'BUY',
        needsBackfill: false,
      });
      continue;
    }

    const parsed = parseDescription(row.description, row.amountCents);
    if (!parsed) {
      unparseable.push({ id: row.id, description: row.description });
      resolved.push({
        id: row.id,
        accountId: row.accountId,
        currency: row.currency,
        amountCents: row.amountCents,
        date: row.date,
        createdAt: row.createdAt,
        description: row.description,
        symbol: row.assetSymbol,
        quantity: null,
        pricePerShareCents: null,
        tradeType: null,
        needsBackfill: false,
      });
      continue;
    }

    backfilled++;
    resolved.push({
      id: row.id,
      accountId: row.accountId,
      currency: row.currency,
      amountCents: row.amountCents,
      date: row.date,
      createdAt: row.createdAt,
      description: row.description,
      symbol: parsed.symbol,
      quantity: parsed.quantity,
      pricePerShareCents: parsed.pricePerShareCents,
      tradeType: parsed.tradeType,
      needsBackfill: true,
    });
  }

  console.log(`Backfill: ${backfilled} row(s) parsed, ${unparseable.length} unparseable`);

  // -------------------------------------------------------------------------
  // 3. Replay holdings per (accountId, symbol)
  // -------------------------------------------------------------------------
  const bySymbol = new Map<string, ResolvedTrade[]>();
  for (const trade of resolved) {
    if (!trade.symbol) continue;
    const key = `${trade.accountId}|${trade.symbol}`;
    const bucket = bySymbol.get(key);
    if (bucket) bucket.push(trade);
    else bySymbol.set(key, [trade]);
  }

  const holdings = await prisma.investmentAssetHolding.findMany({
    select: {
      id: true,
      accountId: true,
      symbol: true,
      name: true,
      quantity: true,
      avgCostCents: true,
      isActive: true,
    },
  });
  const holdingByKey = new Map(holdings.map((h) => [`${h.accountId}|${h.symbol}`, h]));

  interface HoldingPlan {
    accountId: string;
    symbol: string;
    name: string;
    currency: string;
    prevQuantity: Decimal | null;
    newQuantity: Decimal;
    prevAvg: number | null;
    newAvg: number;
    isActive: boolean;
    existingId: string | null;
  }

  const holdingPlans: HoldingPlan[] = [];
  const replayErrors: string[] = [];

  for (const [key, trades] of bySymbol) {
    const [accountId, symbol] = key.split('|');
    const ordered = [...trades].sort(
      (a, b) =>
        a.date.getTime() - b.date.getTime() ||
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    );

    let qty = new Decimal(0);
    let totalCost = new Decimal(0);
    let failed = false;

    for (const t of ordered) {
      if (t.tradeType == null || t.quantity == null || t.pricePerShareCents == null) {
        replayErrors.push(`${key}: trade ${t.id} is missing structured data`);
        failed = true;
        break;
      }
      if (t.tradeType === 'BUY') {
        qty = qty.plus(t.quantity);
        totalCost = totalCost.plus(t.quantity.times(t.pricePerShareCents));
      } else {
        if (qty.isZero() || t.quantity.greaterThan(qty)) {
          replayErrors.push(`${key}: SELL ${t.id} exceeds ledger quantity`);
          failed = true;
          break;
        }
        const avg = totalCost.dividedBy(qty);
        totalCost = totalCost.minus(t.quantity.times(avg));
        qty = qty.minus(t.quantity);
        if (qty.isZero()) totalCost = new Decimal(0);
      }
    }

    if (failed) continue;

    const newAvg = qty.isZero() ? 0 : toCents(totalCost.dividedBy(qty));
    const existing = holdingByKey.get(key);
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { currency: true },
    });

    holdingPlans.push({
      accountId,
      symbol,
      name: existing?.name ?? symbol,
      currency: account?.currency ?? 'USD',
      prevQuantity: existing ? new Decimal(existing.quantity.toString()) : null,
      newQuantity: qty,
      prevAvg: existing ? Number(existing.avgCostCents) : null,
      newAvg,
      isActive: !qty.isZero(),
      existingId: existing?.id ?? null,
    });
  }

  const holdingDiscrepancies = holdingPlans.filter(
    (p) => p.prevQuantity == null || !p.prevQuantity.equals(p.newQuantity) || p.prevAvg !== p.newAvg
  );

  console.log(
    `Holdings reviewed: ${holdingPlans.length}, discrepancy(ies): ${holdingDiscrepancies.length}`
  );
  for (const d of holdingDiscrepancies) {
    console.log(
      `  - ${d.accountId} ${d.symbol}: qty ${d.prevQuantity?.toString() ?? '(none)'} → ${d.newQuantity.toString()}, avgCost ${d.prevAvg ?? '(none)'} → ${d.newAvg}`
    );
  }
  if (replayErrors.length > 0) {
    console.log(`Replay errors (holdings left untouched): ${replayErrors.length}`);
    for (const err of replayErrors) console.log(`  ! ${err}`);
  }

  // -------------------------------------------------------------------------
  // 4. Balance reconciliation for affected investment accounts
  // -------------------------------------------------------------------------
  const affectedAccounts = new Set<string>();
  for (const group of duplicateGroups) affectedAccounts.add(group[0].accountId);
  for (const trade of resolved) if (trade.needsBackfill) affectedAccounts.add(trade.accountId);

  interface BalancePlan {
    accountId: string;
    name: string;
    before: Decimal;
    after: Decimal;
  }
  const balancePlans: BalancePlan[] = [];

  for (const accountId of affectedAccounts) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { name: true, balanceCents: true },
    });
    if (!account) continue;

    const allActive = await prisma.transaction.findMany({
      where: { accountId, isActive: true },
      select: { id: true, amountCents: true },
    });

    let before = new Decimal(0);
    let after = new Decimal(0);
    for (const tx of allActive) {
      before = before.plus(tx.amountCents.toString());
      if (!duplicateIds.has(tx.id)) after = after.plus(tx.amountCents.toString());
    }

    balancePlans.push({ accountId, name: account.name, before, after });
  }

  console.log('\nBalance reconciliation (affected investment accounts):');
  for (const b of balancePlans) {
    const cached = b.before; // cached should equal the pre-dedup ledger for seeded data
    console.log(
      `  - ${b.name}: ledger-before=${b.before.toString()} ledger-after=${b.after.toString()}` +
        (cached.equals(b.after) ? ' (no change)' : '')
    );
  }

  // -------------------------------------------------------------------------
  // 5. Apply
  // -------------------------------------------------------------------------
  if (!APPLY) {
    console.log('\n=== DRY-RUN: no changes written. Re-run with --apply ===');
    if (unparseable.length > 0) {
      console.log('\nUnparseable rows (left untouched):');
      for (const u of unparseable) console.log(`  ! ${u.id}: ${JSON.stringify(u.description)}`);
    }
    return;
  }

  console.log('\nApplying changes...');

  for (const id of duplicateIds) {
    await prisma.transaction.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        lastModifiedBy: ACTOR,
        ipAddress: 'system',
        userAgent: ACTOR,
      },
    });
  }

  for (const trade of resolved) {
    if (!trade.needsBackfill || !trade.symbol || trade.quantity == null) continue;
    await prisma.transaction.update({
      where: { id: trade.id },
      data: {
        assetSymbol: trade.symbol,
        assetQuantity: trade.quantity,
        assetPricePerShareCents: trade.pricePerShareCents,
        assetTradeType: trade.tradeType,
        lastModifiedBy: ACTOR,
      },
    });
  }

  for (const plan of holdingPlans) {
    if (plan.existingId) {
      await prisma.investmentAssetHolding.update({
        where: { id: plan.existingId },
        data: {
          quantity: plan.newQuantity,
          avgCostCents: plan.newAvg,
          isActive: plan.isActive,
          deletedAt: plan.isActive ? null : new Date(),
          lastModifiedBy: ACTOR,
        },
      });
    } else if (!plan.newQuantity.isZero()) {
      await prisma.investmentAssetHolding.create({
        data: {
          accountId: plan.accountId,
          symbol: plan.symbol,
          name: plan.name,
          currency: plan.currency as 'USD' | 'EUR' | 'COP',
          quantity: plan.newQuantity,
          avgCostCents: plan.newAvg,
          currentPriceCents: 0,
          createdBy: ACTOR,
          lastModifiedBy: ACTOR,
        },
      });
    }
  }

  for (const b of balancePlans) {
    await prisma.account.update({
      where: { id: b.accountId },
      data: { balanceCents: BigInt(b.after.toFixed(0)), lastReconciled: new Date() },
    });
  }

  console.log('✅ Applied. Changes committed.');

  if (unparseable.length > 0) {
    console.log('\nUnparseable rows (left untouched, still block edits):');
    for (const u of unparseable) console.log(`  ! ${u.id}: ${JSON.stringify(u.description)}`);
  }
}

main()
  .catch((error) => {
    console.error('❌ Investment trade repair failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
