/**
 * Pocket-aware transfer rules (shared client-side helpers).
 *
 * These rules are the frontend mirror of the approved transfer contract. The
 * server remains the source of truth (it enforces `POCKET_TRANSFER_NOT_ALLOWED`
 * atomically); this module replicates the valid-pair filtering as UX defense in
 * depth so users can only pick legal destinations and the Transfer button is
 * hidden when no valid pair exists.
 */

import type { AccountBrief } from './types';

export function isPocket(account: Pick<AccountBrief, 'type' | 'parentAccountId'>): boolean {
  return account.type === 'POCKET';
}

export function canTransferBetween(
  from: Pick<AccountBrief, 'id' | 'type' | 'parentAccountId'>,
  to: Pick<AccountBrief, 'id' | 'type' | 'parentAccountId'>
): boolean {
  if (from.id === to.id) return false;
  if (isPocket(from)) {
    const toIsParent = to.id === from.parentAccountId;
    const toIsSibling =
      isPocket(to) && to.parentAccountId !== null && to.parentAccountId === from.parentAccountId;
    return toIsParent || toIsSibling;
  }
  const toIsOwnPocket = isPocket(to) && to.parentAccountId === from.id;
  const toIsExternal = !isPocket(to);
  return toIsOwnPocket || toIsExternal;
}

export function getTransferDestinations(
  sourceId: string,
  accounts: AccountBrief[]
): AccountBrief[] {
  const source = accounts.find((a) => a.id === sourceId);
  if (!source) return [];
  return accounts.filter((a) => canTransferBetween(source, a));
}

export function hasAnyValidPair(accounts: AccountBrief[]): boolean {
  return accounts.some((a) => getTransferDestinations(a.id, accounts).length > 0);
}
