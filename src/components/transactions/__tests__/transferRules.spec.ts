/**
 * transferRules Unit Tests
 *
 * Covers the pocket-aware transfer contract helpers used by the frontend as
 * UX defense in depth (the server enforces the same rules atomically):
 *  - isPocket
 *  - canTransferBetween
 *  - getTransferDestinations
 *  - hasAnyValidPair
 */

import { describe, it, expect } from 'vitest';
import {
  isPocket,
  canTransferBetween,
  getTransferDestinations,
  hasAnyValidPair,
} from '../transferRules';
import type { AccountBrief } from '../types';

function account(overrides: Partial<AccountBrief> = {}): AccountBrief {
  return {
    id: 'acc-1',
    name: 'Account',
    currency: 'USD',
    type: 'CHECKING',
    parentAccountId: null,
    balanceCents: 0,
    ...overrides,
  };
}

describe('isPocket', () => {
  it('returns true for type POCKET', () => {
    expect(isPocket(account({ type: 'POCKET', parentAccountId: 'acc-1' }))).toBe(true);
  });

  it('returns false for non-pocket types', () => {
    expect(isPocket(account({ type: 'CHECKING' }))).toBe(false);
    expect(isPocket(account({ type: 'SAVINGS' }))).toBe(false);
    expect(isPocket(account({ type: 'CASH' }))).toBe(false);
  });
});

describe('canTransferBetween', () => {
  const parent = account({ id: 'parent', name: 'Parent', type: 'SAVINGS' });
  const pocket = account({
    id: 'pocket',
    name: 'Pocket',
    type: 'POCKET',
    parentAccountId: 'parent',
  });
  const sibling = account({
    id: 'sibling',
    name: 'Sibling',
    type: 'POCKET',
    parentAccountId: 'parent',
  });
  const otherAccount = account({ id: 'other', name: 'Other', type: 'CHECKING' });
  const otherPocket = account({
    id: 'other-pocket',
    name: 'Other Pocket',
    type: 'POCKET',
    parentAccountId: 'other',
  });

  describe('when the source is a pocket', () => {
    it('allows pocket → its parent account', () => {
      expect(canTransferBetween(pocket, parent)).toBe(true);
    });

    it('allows pocket → sibling pocket (same parent)', () => {
      expect(canTransferBetween(pocket, sibling)).toBe(true);
    });

    it('rejects pocket → external (non-pocket) account', () => {
      expect(canTransferBetween(pocket, otherAccount)).toBe(false);
    });

    it('rejects pocket → a pocket of another parent', () => {
      expect(canTransferBetween(pocket, otherPocket)).toBe(false);
    });

    it('rejects pocket → itself', () => {
      expect(canTransferBetween(pocket, pocket)).toBe(false);
    });
  });

  describe('when the source is a regular account', () => {
    it('allows account → its own pocket', () => {
      expect(canTransferBetween(parent, pocket)).toBe(true);
    });

    it('allows account → another non-pocket account', () => {
      expect(canTransferBetween(parent, otherAccount)).toBe(true);
    });

    it('rejects account → a pocket of another account', () => {
      expect(canTransferBetween(parent, otherPocket)).toBe(false);
    });

    it('rejects account → itself', () => {
      expect(canTransferBetween(parent, parent)).toBe(false);
    });
  });
});

describe('getTransferDestinations', () => {
  const parentA = account({ id: 'acc-1', name: 'Main', type: 'CHECKING' });
  const parentB = account({ id: 'acc-2', name: 'Savings', type: 'SAVINGS' });
  const pocketA1 = account({
    id: 'pocket-a1',
    name: 'Pocket A1',
    type: 'POCKET',
    parentAccountId: 'acc-1',
  });
  const pocketA2 = account({
    id: 'pocket-a2',
    name: 'Pocket A2',
    type: 'POCKET',
    parentAccountId: 'acc-1',
  });
  const accounts: AccountBrief[] = [parentA, parentB, pocketA1, pocketA2];

  it('returns own pockets + other non-pocket accounts for a regular account source', () => {
    const destinations = getTransferDestinations('acc-1', accounts);
    const ids = destinations.map((d) => d.id).sort();
    expect(ids).toEqual(['acc-2', 'pocket-a1', 'pocket-a2']);
  });

  it('returns its parent + sibling pockets for a pocket source', () => {
    const destinations = getTransferDestinations('pocket-a1', accounts);
    const ids = destinations.map((d) => d.id).sort();
    expect(ids).toEqual(['acc-1', 'pocket-a2']);
  });

  it('returns an empty array when the source does not exist', () => {
    expect(getTransferDestinations('missing', accounts)).toEqual([]);
  });
});

describe('hasAnyValidPair', () => {
  it('returns true when at least one valid pair exists', () => {
    const accounts: AccountBrief[] = [
      account({ id: 'acc-1', name: 'Main', type: 'CHECKING' }),
      account({ id: 'acc-2', name: 'Savings', type: 'SAVINGS' }),
    ];
    expect(hasAnyValidPair(accounts)).toBe(true);
  });

  it('returns false with zero accounts', () => {
    expect(hasAnyValidPair([])).toBe(false);
  });

  it('returns false with a single account', () => {
    expect(hasAnyValidPair([account({ id: 'acc-1', name: 'Main', type: 'CHECKING' })])).toBe(false);
  });

  it('returns false when only pockets without a valid parent are present', () => {
    const orphanPocket = account({
      id: 'pocket-1',
      name: 'Orphan',
      type: 'POCKET',
      parentAccountId: null,
    });
    const otherAccount = account({ id: 'acc-1', name: 'Other', type: 'CHECKING' });
    // pocket has no parent → cannot reach anyone; account cannot reach the pocket
    expect(hasAnyValidPair([orphanPocket, otherAccount])).toBe(false);
  });
});
