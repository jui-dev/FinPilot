import { accountClass, type AccountType } from "@/domain/ledger/accounts";
import { add, money, ZERO, type Money } from "@/domain/money";
import { backEarmarks, reservable } from "@/domain/protected-money/earmarks";
import { itemCover, type ItemCover } from "@/domain/protected-money/items";
import { writeContext, type ServiceContext } from "@/server/context";
import { runScript, type ServiceResult } from "@/server/errors";
import { accountBalances } from "@/server/repositories/ledger-queries";
import * as queries from "@/server/repositories/protected-money-queries";
import * as repository from "@/server/repositories/protected-money-repository";
import { listAccounts } from "@/server/repositories/setup-repository";
import type {
  EarmarkDraft,
  ProtectedMoneyItemDraft,
} from "@/server/repositories/protected-money-repository";

/**
 * Protected money's application API (docs/domain-model.md §9), shown to the
 * person as "Set aside". Writes go through one transaction script each. What
 * real money covers is derived on every read from current balances and the
 * stored backing priority, never stored: a later ledger change moves covered
 * and short without any earmark being rewritten.
 */

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createItem(
  ctx: ServiceContext,
  draft: ProtectedMoneyItemDraft,
): Promise<ServiceResult<string>> {
  return runScript(() => repository.createItem(ctx.db, writeContext(ctx), draft));
}

export async function editItem(
  ctx: ServiceContext,
  id: string,
  draft: ProtectedMoneyItemDraft,
): Promise<ServiceResult<void>> {
  return runScript(() => repository.editItem(ctx.db, writeContext(ctx), id, draft));
}

export async function archiveItem(ctx: ServiceContext, id: string): Promise<ServiceResult<void>> {
  return runScript(() => repository.archiveItem(ctx.db, writeContext(ctx), id));
}

export async function reserve(
  ctx: ServiceContext,
  itemId: string,
  draft: EarmarkDraft,
): Promise<ServiceResult<void>> {
  return runScript(() => repository.reserve(ctx.db, writeContext(ctx), itemId, draft));
}

export async function release(
  ctx: ServiceContext,
  itemId: string,
  draft: EarmarkDraft,
): Promise<ServiceResult<void>> {
  return runScript(() => repository.release(ctx.db, writeContext(ctx), itemId, draft));
}

// ---------------------------------------------------------------------------
// Reads (derived, never stored)
// ---------------------------------------------------------------------------

/** One active earmark, split into what the account's current balance backs and what it does not. */
export interface EarmarkBacking {
  readonly itemId: string;
  readonly accountId: string;
  readonly reserved: Money;
  readonly covered: Money;
  readonly short: Money;
}

/**
 * Every active earmark's backing, the one place backing is derived. Per
 * account, earmarks are backed in their established priority order against
 * the account's current balance. Available (Stage 8) sums `covered` over its
 * included accounts from here rather than re-deriving it.
 */
export async function getEarmarkBacking(ctx: ServiceContext): Promise<EarmarkBacking[]> {
  const balances = new Map(
    accountBalances(ctx.db, ctx.ownerId).map((b) => [b.accountId, money(b.balanceMinor)]),
  );
  const byAccount = new Map<string, { itemId: string; reserved: Money }[]>();
  for (const e of queries.listActiveEarmarks(ctx.db, ctx.ownerId)) {
    const list = byAccount.get(e.accountId) ?? [];
    list.push({ itemId: e.itemId, reserved: money(e.reservedMinor) });
    byAccount.set(e.accountId, list);
  }
  return [...byAccount].flatMap(([accountId, inPriorityOrder]) =>
    backEarmarks(balances.get(accountId) ?? money(0), inPriorityOrder).map((b) => ({
      ...b,
      accountId,
    })),
  );
}

export interface ProtectedMoneyItemView {
  readonly id: string;
  readonly name: string;
  readonly archived: boolean;
  /** Reserved / covered / short, and target-derived values only when a target exists. */
  readonly cover: ItemCover;
  /** Its active earmarks, one per account. */
  readonly earmarks: readonly EarmarkBacking[];
}

export async function getItems(ctx: ServiceContext): Promise<ProtectedMoneyItemView[]> {
  const backing = await getEarmarkBacking(ctx);
  return queries.listItems(ctx.db, ctx.ownerId).map((row) => {
    const own = backing.filter((b) => b.itemId === row.id);
    return {
      id: row.id,
      name: row.name,
      archived: row.archivedAt !== null,
      cover: itemCover(row.targetMinor === null ? null : money(row.targetMinor), own),
      earmarks: own,
    };
  });
}

/** An account money can be set aside from, and how much more of it may be. */
export interface ReserveSource {
  readonly accountId: string;
  readonly name: string;
  readonly type: AccountType;
  /** reservable(balance, Σ set aside on it): exactly what Reserve would accept. */
  readonly reservable: Money;
}

/**
 * The accounts Reserve accepts — active asset accounts — each with how much
 * more of it may be set aside, in account-name order. Accounts with nothing
 * free are included (at zero) so a form can say why they cannot be used.
 */
export async function getReserveSources(ctx: ServiceContext): Promise<ReserveSource[]> {
  const balances = new Map(
    accountBalances(ctx.db, ctx.ownerId).map((b) => [b.accountId, money(b.balanceMinor)]),
  );
  const reserved = new Map<string, Money>();
  for (const e of queries.listActiveEarmarks(ctx.db, ctx.ownerId)) {
    reserved.set(e.accountId, add(reserved.get(e.accountId) ?? ZERO, money(e.reservedMinor)));
  }
  return listAccounts(ctx.db, ctx.ownerId)
    .filter((a) => a.archivedAt === null && accountClass(a.type) === "asset")
    .map((a) => ({
      accountId: a.id,
      name: a.name,
      type: a.type,
      reservable: reservable(balances.get(a.id) ?? ZERO, reserved.get(a.id) ?? ZERO),
    }));
}

export type { EarmarkDraft, ProtectedMoneyItemDraft };
