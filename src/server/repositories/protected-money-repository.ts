import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase, SyncDb } from "@/db/client";
import { earmarkEntries, earmarks, protectedMoneyItems } from "@/db/schema";
import { money, negate, type Money } from "@/domain/money";
import { checkEarmarkEntry } from "@/domain/protected-money/earmarks";
import { checkArchive, checkTarget } from "@/domain/protected-money/items";
import type { WriteContext } from "@/server/context";
import { LedgerRuleError } from "@/server/errors";
import { accountBalanceAsOf } from "@/server/repositories/ledger-queries";
import { accountFacts, IMMEDIATE } from "@/server/repositories/ledger-repository";

/**
 * Protected-money write scripts (docs/domain-model.md §9), shown to the person
 * as "Set aside". Each runs as ONE synchronous immediate transaction: load
 * fresh facts → pure domain verdict → write. Any throw rolls back everything.
 *
 * An earmark is one (item, account) relationship with a backing priority; its
 * amount is the sum of its append-only entries and is never stored. Reserve
 * appends a positive entry, Release a negative one. The relationship is
 * established when it rises from zero (taking the next priority) and ended
 * when a release brings it back to zero, so setting money aside again later
 * starts a new earmark behind every existing one. Nothing here touches the
 * ledger or any balance.
 */

export interface ProtectedMoneyItemDraft {
  readonly name: string;
  readonly target: Money | null;
}

export interface EarmarkDraft {
  readonly accountId: string;
  /** Positive; Reserve and Release give it its sign. */
  readonly amount: Money;
}

type ItemRow = typeof protectedMoneyItems.$inferSelect;

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

function findItem(tx: SyncDb, ownerId: string, id: string): ItemRow | undefined {
  return tx
    .select()
    .from(protectedMoneyItems)
    .where(and(eq(protectedMoneyItems.ownerId, ownerId), eq(protectedMoneyItems.id, id)))
    .get();
}

function ownedItem(tx: SyncDb, ownerId: string, id: string): ItemRow {
  const row = findItem(tx, ownerId, id);
  if (!row) throw new LedgerRuleError("item_not_found", "That set-aside item does not exist.");
  return row;
}

/** Σ entries of the active earmarks matching `where` (0 when there are none). */
function activeReserved(tx: SyncDb, ownerId: string, accountId: string, itemId?: string): Money {
  const row = tx
    .select({ total: sql<number>`coalesce(sum(${earmarkEntries.amountMinor}), 0)` })
    .from(earmarkEntries)
    .innerJoin(
      earmarks,
      and(eq(earmarks.ownerId, earmarkEntries.ownerId), eq(earmarks.id, earmarkEntries.earmarkId)),
    )
    .where(
      and(
        eq(earmarks.ownerId, ownerId),
        eq(earmarks.accountId, accountId),
        itemId === undefined ? undefined : eq(earmarks.itemId, itemId),
        isNull(earmarks.endedAt),
      ),
    )
    .get();
  return money(row?.total ?? 0);
}

function activeEarmarkId(
  tx: SyncDb,
  ownerId: string,
  itemId: string,
  accountId: string,
): string | undefined {
  return tx
    .select({ id: earmarks.id })
    .from(earmarks)
    .where(
      and(
        eq(earmarks.ownerId, ownerId),
        eq(earmarks.itemId, itemId),
        eq(earmarks.accountId, accountId),
        isNull(earmarks.endedAt),
      ),
    )
    .get()?.id;
}

/**
 * The next backing priority: one past the owner's highest, ended earmarks
 * included, so a priority is never reused. Read inside the immediate write
 * transaction, which serialises writers; a rolled-back write takes nothing.
 */
function nextPriority(tx: SyncDb, ownerId: string): number {
  const row = tx
    .select({ top: sql<number>`coalesce(max(${earmarks.priority}), 0)` })
    .from(earmarks)
    .where(eq(earmarks.ownerId, ownerId))
    .get();
  return (row?.top ?? 0) + 1;
}

function checkItemDraft(draft: ProtectedMoneyItemDraft): void {
  if (draft.name.trim().length === 0) {
    throw new LedgerRuleError("invalid_name", "Give it a name.");
  }
  const broken = checkTarget(draft.target);
  if (broken) throw new LedgerRuleError(broken.code, broken.message);
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export function createItem(
  db: AppDatabase,
  ctx: WriteContext,
  draft: ProtectedMoneyItemDraft,
): string {
  return db.transaction((tx) => {
    checkItemDraft(draft);
    const id = ctx.ids.next();
    tx.insert(protectedMoneyItems)
      .values({
        id,
        ownerId: ctx.ownerId,
        name: draft.name.trim(),
        targetMinor: draft.target,
        archivedAt: null,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      })
      .run();
    return id;
  }, IMMEDIATE);
}

/** Renames an item or changes its target. A target change reserves or releases nothing. */
export function editItem(
  db: AppDatabase,
  ctx: WriteContext,
  id: string,
  draft: ProtectedMoneyItemDraft,
): void {
  db.transaction((tx) => {
    const item = ownedItem(tx, ctx.ownerId, id);
    if (item.archivedAt !== null) {
      throw new LedgerRuleError("item_archived", "That set-aside item is archived.");
    }
    checkItemDraft(draft);
    tx.update(protectedMoneyItems)
      .set({ name: draft.name.trim(), targetMinor: draft.target, updatedAt: ctx.nowIso })
      .where(and(eq(protectedMoneyItems.ownerId, ctx.ownerId), eq(protectedMoneyItems.id, id)))
      .run();
  }, IMMEDIATE);
}

/** Archives an item; only allowed when nothing remains reserved on any account. */
export function archiveItem(db: AppDatabase, ctx: WriteContext, id: string): void {
  db.transaction((tx) => {
    const item = ownedItem(tx, ctx.ownerId, id);
    if (item.archivedAt !== null) return;
    const reserved = tx
      .select({ total: sql<number>`coalesce(sum(${earmarkEntries.amountMinor}), 0)` })
      .from(earmarkEntries)
      .innerJoin(
        earmarks,
        and(
          eq(earmarks.ownerId, earmarkEntries.ownerId),
          eq(earmarks.id, earmarkEntries.earmarkId),
        ),
      )
      .where(and(eq(earmarks.ownerId, ctx.ownerId), eq(earmarks.itemId, id)))
      .get();
    const broken = checkArchive(money(reserved?.total ?? 0));
    if (broken) throw new LedgerRuleError(broken.code, broken.message);
    tx.update(protectedMoneyItems)
      .set({ archivedAt: ctx.nowIso, updatedAt: ctx.nowIso })
      .where(and(eq(protectedMoneyItems.ownerId, ctx.ownerId), eq(protectedMoneyItems.id, id)))
      .run();
  }, IMMEDIATE);
}

// ---------------------------------------------------------------------------
// Reserve and Release
// ---------------------------------------------------------------------------

/**
 * Appends one signed entry to the item's earmark on the account, after the
 * pure domain rule accepts it against facts read in this transaction.
 * Establishes the earmark (with the next priority) when it rises from zero,
 * and ends it when a release brings it back to zero.
 */
function changeEarmark(
  tx: SyncDb,
  ctx: WriteContext,
  itemId: string,
  accountId: string,
  amount: Money,
): void {
  const item = findItem(tx, ctx.ownerId, itemId);
  const account = accountFacts(tx, ctx.ownerId, accountId);
  const itemReservedOnAccount = activeReserved(tx, ctx.ownerId, accountId, itemId);
  const broken = checkEarmarkEntry(amount, {
    item: item ? { archived: item.archivedAt !== null } : undefined,
    account: account ? { type: account.type, archived: account.archived } : undefined,
    accountBalance: money(account ? accountBalanceAsOf(tx, ctx.ownerId, accountId, ctx.today) : 0),
    reservedOnAccount: activeReserved(tx, ctx.ownerId, accountId),
    itemReservedOnAccount,
  });
  if (broken) throw new LedgerRuleError(broken.code, broken.message);

  let earmarkId = activeEarmarkId(tx, ctx.ownerId, itemId, accountId);
  if (earmarkId === undefined) {
    // Only a reservation reaches here: a release with no active earmark was
    // rejected above (nothing to release).
    earmarkId = ctx.ids.next();
    tx.insert(earmarks)
      .values({
        id: earmarkId,
        ownerId: ctx.ownerId,
        itemId,
        accountId,
        priority: nextPriority(tx, ctx.ownerId),
        endedAt: null,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      })
      .run();
  }
  tx.insert(earmarkEntries)
    .values({
      id: ctx.ids.next(),
      ownerId: ctx.ownerId,
      earmarkId,
      amountMinor: amount,
      createdAt: ctx.nowIso,
    })
    .run();
  if (itemReservedOnAccount + amount === 0) {
    tx.update(earmarks)
      .set({ endedAt: ctx.nowIso, updatedAt: ctx.nowIso })
      .where(and(eq(earmarks.ownerId, ctx.ownerId), eq(earmarks.id, earmarkId)))
      .run();
  }
}

/** Reserve and Release state a positive amount; a zero or signed one is rejected, never flipped. */
function stated(draft: EarmarkDraft): Money {
  if (!Number.isSafeInteger(draft.amount) || draft.amount <= 0) {
    throw new LedgerRuleError("invalid_amount", "The amount must be more than zero.");
  }
  return draft.amount;
}

/** Sets more of an asset account's money aside for the item. */
export function reserve(
  db: AppDatabase,
  ctx: WriteContext,
  itemId: string,
  draft: EarmarkDraft,
): void {
  db.transaction((tx) => changeEarmark(tx, ctx, itemId, draft.accountId, stated(draft)), IMMEDIATE);
}

/** Removes protection, partly or fully. The money stays where it is. */
export function release(
  db: AppDatabase,
  ctx: WriteContext,
  itemId: string,
  draft: EarmarkDraft,
): void {
  db.transaction(
    (tx) => changeEarmark(tx, ctx, itemId, draft.accountId, negate(stated(draft))),
    IMMEDIATE,
  );
}
