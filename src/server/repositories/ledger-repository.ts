import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";

import type { AppDatabase, SyncDb } from "@/db/client";
import { accounts, categories, owners, reconciliationCheckpoints, transactions } from "@/db/schema";
import { activeTransactions } from "@/db/views";
import type { CalendarDate } from "@/domain/calendar-date";
import {
  checkLedgerRules,
  resolvedCategoryId,
  type AccountFacts,
  type LedgerFacts,
} from "@/domain/ledger/rules";
import {
  shapeViolations,
  toDraft,
  toLedgerRow,
  type TransactionDraft,
} from "@/domain/ledger/transactions";
import { money } from "@/domain/money";
import type { WriteContext } from "@/server/context";
import { LedgerRuleError } from "@/server/errors";

/**
 * Ledger write scripts. Every multi-step write runs as ONE synchronous
 * better-sqlite3 transaction (immediate mode) inside this module: load facts →
 * pure domain verdict → take sequence number → write. Any throw rolls back
 * everything, including the sequence counter (docs/tech-stack.md §4).
 *
 * Reads of the ledger go through the views; the base `transactions` table is
 * read only for the rows a script is about to modify (e.g. restoring a
 * soft-deleted row, which the views by definition hide).
 */
export type { SyncDb };

export const IMMEDIATE = { behavior: "immediate" } as const;

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

function ownerCurrency(tx: SyncDb, ownerId: string): string {
  const owner = tx
    .select({ currency: owners.baseCurrency })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .get();
  if (!owner) throw new LedgerRuleError("owner_not_found", "The owner does not exist.");
  return owner.currency;
}

export function accountFacts(tx: SyncDb, ownerId: string, id: string): AccountFacts | undefined {
  const row = tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, id)))
    .get();
  return row
    ? {
        id: row.id,
        type: row.type,
        currency: row.currency,
        openedOn: row.openedOn as CalendarDate,
        archived: row.archivedAt !== null,
      }
    : undefined;
}

function loadFacts(tx: SyncDb, ctx: WriteContext, draft: TransactionDraft): LedgerFacts {
  const refundOfId = draft.type === "refund" ? (draft.refundOfId ?? null) : null;
  const refundTarget = refundOfId
    ? tx
        .select({
          id: activeTransactions.id,
          type: activeTransactions.type,
          categoryId: activeTransactions.categoryId,
        })
        .from(activeTransactions)
        .where(
          and(eq(activeTransactions.ownerId, ctx.ownerId), eq(activeTransactions.id, refundOfId)),
        )
        .get()
    : undefined;

  const partial: LedgerFacts = {
    today: ctx.today,
    ownerCurrency: ownerCurrency(tx, ctx.ownerId),
    account: accountFacts(tx, ctx.ownerId, draft.accountId),
    counterAccount:
      draft.type === "transfer" ? accountFacts(tx, ctx.ownerId, draft.counterAccountId) : undefined,
    refundTarget,
  };

  const categoryId = resolvedCategoryId(draft, partial);
  const category = categoryId
    ? tx
        .select()
        .from(categories)
        .where(and(eq(categories.ownerId, ctx.ownerId), eq(categories.id, categoryId)))
        .get()
    : undefined;

  return {
    ...partial,
    category: category
      ? { id: category.id, kind: category.kind, archived: category.archivedAt !== null }
      : undefined,
  };
}

/** Validates a draft against the current facts and returns its stored row. */
function validatedRow(tx: SyncDb, ctx: WriteContext, draft: TransactionDraft) {
  const facts = loadFacts(tx, ctx, draft);
  const rejected = checkLedgerRules(draft, facts);
  if (rejected) throw new LedgerRuleError(rejected.code, rejected.message);
  const row = toLedgerRow(draft, resolvedCategoryId(draft, facts));
  // Defence in depth: the pure shape rules mirror the database CHECKs.
  const shape = shapeViolations(row);
  if (shape.length > 0) {
    throw new LedgerRuleError("invalid_shape", `Invalid ${draft.type} shape: ${shape.join(", ")}.`);
  }
  return row;
}

/** Takes the next per-owner recording sequence. Rolled back with its transaction. */
function nextSequence(tx: SyncDb, ownerId: string): number {
  const updated = tx
    .update(owners)
    .set({ nextTransactionSequence: sql`${owners.nextTransactionSequence} + 1` })
    .where(eq(owners.id, ownerId))
    .returning({ next: owners.nextTransactionSequence })
    .get();
  if (!updated) throw new LedgerRuleError("owner_not_found", "The owner does not exist.");
  return updated.next - 1;
}

/** Inserts one validated draft. Must be called inside a write transaction. */
export function insertDraft(
  tx: SyncDb,
  ctx: WriteContext,
  draft: TransactionDraft,
  groupId: string | null = null,
): string {
  const row = validatedRow(tx, ctx, draft);
  const id = ctx.ids.next();
  tx.insert(transactions)
    .values({
      id,
      ownerId: ctx.ownerId,
      sequence: nextSequence(tx, ctx.ownerId),
      type: row.type,
      occurredOn: draft.occurredOn,
      amountMinor: row.amountMinor,
      accountId: row.accountId,
      counterAccountId: row.counterAccountId,
      categoryId: row.categoryId,
      refundOfId: row.refundOfId,
      groupId,
      description: draft.description ?? null,
      note: draft.note ?? null,
      deletedAt: null,
      createdAt: ctx.nowIso,
      updatedAt: ctx.nowIso,
    })
    .run();
  return id;
}

// ---------------------------------------------------------------------------
// Write scripts
// ---------------------------------------------------------------------------

/** Records drafts atomically. More than one draft forms a group (one real-world event). */
export function recordDrafts(
  db: AppDatabase,
  ctx: WriteContext,
  drafts: readonly TransactionDraft[],
): string[] {
  return db.transaction((tx) => {
    for (const draft of drafts) {
      if (draft.type === "opening_balance") {
        throw new LedgerRuleError(
          "opening_balance_via_account",
          "Opening balances are recorded when an account is created.",
        );
      }
    }
    const groupId = drafts.length > 1 ? ctx.ids.next() : null;
    return drafts.map((draft) => insertDraft(tx, ctx, draft, groupId));
  }, IMMEDIATE);
}

function storedRow(tx: SyncDb, ownerId: string, id: string) {
  return tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.ownerId, ownerId), eq(transactions.id, id)))
    .get();
}

/**
 * Which of these transactions a reconciliation checkpoint owns.
 *
 * It lives here, not in the reconciliation repository, because that module
 * already depends on this one for `insertDraft`; the reverse import would make
 * a cycle. Soft delete means the foreign key cannot protect the checkpoint —
 * the row would simply become invisible — so the guard is explicit.
 */
function checkpointOwnedAdjustments(
  tx: SyncDb,
  ownerId: string,
  transactionIds: readonly string[],
): string[] {
  if (transactionIds.length === 0) return [];
  return tx
    .select({ id: reconciliationCheckpoints.adjustmentId })
    .from(reconciliationCheckpoints)
    .where(
      and(
        eq(reconciliationCheckpoints.ownerId, ownerId),
        inArray(reconciliationCheckpoints.adjustmentId, [...transactionIds]),
      ),
    )
    .all()
    .map((r) => r.id)
    .filter((id): id is string => id !== null);
}

function activeRefundsOf(tx: SyncDb, ownerId: string, expenseIds: readonly string[]): string[] {
  if (expenseIds.length === 0) return [];
  return tx
    .select({ id: activeTransactions.id })
    .from(activeTransactions)
    .where(
      and(
        eq(activeTransactions.ownerId, ownerId),
        eq(activeTransactions.type, "refund"),
        inArray(activeTransactions.refundOfId, [...expenseIds]),
      ),
    )
    .all()
    .map((r) => r.id);
}

/**
 * Edits one transaction in place (one-row UPDATE; id, sequence and group are
 * unchanged). A type change is allowed between income, expense, refund and
 * transfer; opening balances stay opening balances; adjustments are not editable.
 */
export function updateTransaction(
  db: AppDatabase,
  ctx: WriteContext,
  id: string,
  draft: TransactionDraft,
): void {
  db.transaction((tx) => {
    const existing = storedRow(tx, ctx.ownerId, id);
    if (!existing || existing.deletedAt !== null) {
      throw new LedgerRuleError("transaction_not_found", "The transaction does not exist.");
    }
    if (existing.type === "adjustment") {
      throw new LedgerRuleError(
        "adjustment_not_editable",
        "Re-reconcile instead of editing an adjustment.",
      );
    }
    if ((existing.type === "opening_balance") !== (draft.type === "opening_balance")) {
      throw new LedgerRuleError("type_change_not_allowed", "Opening balances cannot change type.");
    }
    if (draft.type === "opening_balance" && draft.accountId !== existing.accountId) {
      throw new LedgerRuleError(
        "opening_balance_account_fixed",
        "An opening balance belongs to its account.",
      );
    }
    if (existing.type === "expense") {
      const keepsLinkedRefundsValid =
        draft.type === "expense" && draft.categoryId === existing.categoryId;
      if (!keepsLinkedRefundsValid && activeRefundsOf(tx, ctx.ownerId, [id]).length > 0) {
        throw new LedgerRuleError(
          "has_active_refunds",
          "This expense has refunds linked to it; its type and category must stay the same.",
        );
      }
    }
    if (draft.type === "refund" && draft.refundOfId === id) {
      throw new LedgerRuleError("refund_target_invalid", "A refund cannot refer to itself.");
    }

    const row = validatedRow(tx, ctx, draft);
    tx.update(transactions)
      .set({
        type: row.type,
        occurredOn: draft.occurredOn,
        amountMinor: row.amountMinor,
        accountId: row.accountId,
        counterAccountId: row.counterAccountId,
        categoryId: row.categoryId,
        refundOfId: row.refundOfId,
        description: draft.description ?? null,
        note: draft.note ?? null,
        updatedAt: ctx.nowIso,
      })
      .where(and(eq(transactions.ownerId, ctx.ownerId), eq(transactions.id, id)))
      .run();
  }, IMMEDIATE);
}

/** The rows a delete/restore acts on: the whole group, or the single row. */
function eventRows(tx: SyncDb, ownerId: string, row: typeof transactions.$inferSelect) {
  if (!row.groupId) return [row];
  return tx
    .select()
    .from(transactions)
    .where(and(eq(transactions.ownerId, ownerId), eq(transactions.groupId, row.groupId)))
    .all();
}

/** Soft-deletes a transaction, or its whole group. Returns the affected ids. */
export function deleteTransaction(db: AppDatabase, ctx: WriteContext, id: string): string[] {
  return db.transaction((tx) => {
    const existing = storedRow(tx, ctx.ownerId, id);
    if (!existing || existing.deletedAt !== null) {
      throw new LedgerRuleError("transaction_not_found", "The transaction does not exist.");
    }
    const rows = eventRows(tx, ctx.ownerId, existing).filter((r) => r.deletedAt === null);
    const ids = rows.map((r) => r.id);

    const adjustmentIds = rows.filter((r) => r.type === "adjustment").map((r) => r.id);
    if (checkpointOwnedAdjustments(tx, ctx.ownerId, adjustmentIds).length > 0) {
      throw new LedgerRuleError(
        "adjustment_in_checkpoint",
        "This adjustment is part of a verified balance, so it cannot be deleted on its own.",
      );
    }

    const expenseIds = rows.filter((r) => r.type === "expense").map((r) => r.id);
    const blocking = activeRefundsOf(tx, ctx.ownerId, expenseIds).filter((r) => !ids.includes(r));
    if (blocking.length > 0) {
      throw new LedgerRuleError(
        "has_active_refunds",
        "Delete the refunds linked to this expense first.",
      );
    }
    tx.update(transactions)
      .set({ deletedAt: ctx.nowIso, updatedAt: ctx.nowIso })
      .where(and(eq(transactions.ownerId, ctx.ownerId), inArray(transactions.id, ids)))
      .run();
    return ids;
  }, IMMEDIATE);
}

/**
 * Restores a soft-deleted transaction, or its whole group, re-checking every
 * rule against today's facts (e.g. a linked refund's expense must be active,
 * and an account can have at most one active opening balance).
 */
export function restoreTransaction(db: AppDatabase, ctx: WriteContext, id: string): string[] {
  return db.transaction((tx) => {
    const existing = storedRow(tx, ctx.ownerId, id);
    if (!existing || existing.deletedAt === null) {
      throw new LedgerRuleError("transaction_not_deleted", "The transaction is not deleted.");
    }
    const rows = eventRows(tx, ctx.ownerId, existing).filter((r) => r.deletedAt !== null);
    for (const row of rows) {
      validatedRow(
        tx,
        ctx,
        toDraft({
          ...row,
          amountMinor: money(row.amountMinor),
          occurredOn: row.occurredOn as CalendarDate,
        }),
      );
      if (row.type === "opening_balance") {
        const other = tx
          .select({ id: activeTransactions.id })
          .from(activeTransactions)
          .where(
            and(
              eq(activeTransactions.accountId, row.accountId),
              eq(activeTransactions.type, "opening_balance"),
            ),
          )
          .get();
        if (other) {
          throw new LedgerRuleError(
            "opening_balance_exists",
            "The account already has an active opening balance.",
          );
        }
      }
    }
    const ids = rows.map((r) => r.id);
    tx.update(transactions)
      .set({ deletedAt: null, updatedAt: ctx.nowIso })
      .where(
        and(
          eq(transactions.ownerId, ctx.ownerId),
          inArray(transactions.id, ids),
          isNotNull(transactions.deletedAt),
        ),
      )
      .run();
    return ids;
  }, IMMEDIATE);
}
