/**
 * serialize unit tests — Server Action response serialization.
 *
 * Prisma returns BIGINT monetary fields as JS `bigint` and Decimal fields as
 * Decimal objects, neither of which `JSON.stringify` can handle. These tests
 * pin the number conversion (including the investment trade fields).
 */
import { describe, it, expect } from 'vitest';
import { Decimal } from 'decimal.js';
import { serializeTransaction } from '../serialize';

describe('serializeTransaction', () => {
  it('converts amountCents and originalAmountCents bigints to numbers', () => {
    const result = serializeTransaction({
      amountCents: BigInt(-5000),
      originalAmountCents: BigInt(125000),
      exchangeRate: null,
    });

    expect(result.amountCents).toBe(-5000);
    expect(result.originalAmountCents).toBe(125000);
  });

  it('normalizes a null originalAmountCents to null', () => {
    const result = serializeTransaction({
      amountCents: BigInt(100),
      originalAmountCents: null,
    });

    expect(result.originalAmountCents).toBeNull();
  });

  it('converts assetQuantity (Decimal) and assetPricePerShareCents (bigint) to numbers', () => {
    const result = serializeTransaction({
      amountCents: BigInt(-15000),
      originalAmountCents: null,
      assetQuantity: new Decimal('2.243695838'),
      assetPricePerShareCents: BigInt(15000),
    });

    expect(result.assetQuantity).toBe(2.243695838);
    expect(result.assetPricePerShareCents).toBe(15000);
  });

  it('normalizes missing asset fields to null', () => {
    const result = serializeTransaction({
      amountCents: BigInt(1000),
      originalAmountCents: null,
    });

    expect(result.assetQuantity).toBeNull();
    expect(result.assetPricePerShareCents).toBeNull();
  });

  it('normalizes a bigint exchangeRate to a number', () => {
    const result = serializeTransaction({
      amountCents: BigInt(1000),
      originalAmountCents: null,
      exchangeRate: BigInt(4000),
    });

    expect(result.exchangeRate).toBe(4000);
  });

  it('serializes to a JSON-safe object (no bigint/Decimal)', () => {
    const result = serializeTransaction({
      amountCents: BigInt(-15000),
      originalAmountCents: BigInt(60000000),
      exchangeRate: new Decimal('4000'),
      assetQuantity: new Decimal('5'),
      assetPricePerShareCents: BigInt(15000),
    });

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      amountCents: -15000,
      originalAmountCents: 60000000,
      exchangeRate: 4000,
      assetQuantity: 5,
      assetPricePerShareCents: 15000,
    });
  });

  it('passes a numeric exchangeRate through unchanged', () => {
    const result = serializeTransaction({
      amountCents: BigInt(1000),
      originalAmountCents: null,
      exchangeRate: 4000,
    });

    expect(result.exchangeRate).toBe(4000);
  });

  it('normalizes an unparseable exchangeRate to null', () => {
    const result = serializeTransaction({
      amountCents: BigInt(1000),
      originalAmountCents: null,
      exchangeRate: { notANumber: true },
    });

    expect(result.exchangeRate).toBeNull();
  });

  it('preserves all the other transaction fields', () => {
    const result = serializeTransaction({
      id: 'tx-1',
      type: 'INVESTMENT',
      amountCents: BigInt(1),
      originalAmountCents: null,
    });

    expect(result).toMatchObject({ id: 'tx-1', type: 'INVESTMENT' });
  });
});
