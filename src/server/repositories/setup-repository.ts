import { and, asc, count, eq, or, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import {
  accounts,
  categories,
  commitments,
  owners,
  reconciliationCheckpoints,
  transactions,
} from "@/db/schema";
import { accountEntries, activeTransactions } from "@/db/views";
import type { CalendarDate } from "@/domain/calendar-date";
import { checkAvailableEligibility, type AccountType } from "@/domain/ledger/accounts";
import {
  CATEGORY_KIND_LABEL,
  DEFAULT_CATEGORIES,
  LAST_ACTIVE_CATEGORY_MESSAGE,
} from "@/domain/ledger/categories";
import type { CategoryKind } from "@/domain/ledger/transactions";
import type { IdGenerator } from "@/domain/ids";
import type { Money } from "@/domain/money";
import type { WriteContext } from "@/server/context";
import { LedgerRuleError } from "@/server/errors";

import { insertDraft, type SyncDb } from "./ledger-repository";

const IMMEDIATE = { behavior: "immediate" } as const;

/** Inserts the default categories every owner starts with. */
export function insertDefaultCategories(
  tx: SyncDb,
  ownerId: string,
  ids: IdGenerator,
  nowIso: string,
): void {
  tx.insert(categories)
    .values(
      DEFAULT_CATEGORIES.map((c) => ({
        id: ids.next(),
        ownerId,
        name: c.name,
        kind: c.kind,
        createdAt: nowIso,
        updatedAt: nowIso,
      })),
    )
    .run();
}

/** Creates an owner with the default categories, atomically. */
export function insertOwner(
  db: AppDatabase,
  input: { name: string; baseCurrency: string; timeZone: string },
  ids: IdGenerator,
  nowIso: string,
): string {
  return db.transaction((tx) => {
    const ownerId = ids.next();
    tx.insert(owners)
      .values({ id: ownerId, ...input, createdAt: nowIso, updatedAt: nowIso })
      .run();
    insertDefaultCategories(tx, ownerId, ids, nowIso);
    return ownerId;
  }, IMMEDIATE);
}

/**
 * Creates an account and, for a non-zero start, its opening-balance transaction
 * dated opened_on — atomically. An account opened at zero has no opening-balance row.
 */
export function insertAccount(
  db: AppDatabase,
  ctx: WriteContext,
  input: {
    name: string;
    type: AccountType;
    openedOn: CalendarDate;
    openingBalance: Money;
    includedInAvailable: boolean;
  },
): string {
  return db.transaction((tx) => {
    const owner = tx
      .select({ currency: owners.baseCurrency })
      .from(owners)
      .where(eq(owners.id, ctx.ownerId))
      .get();
    if (!owner) throw new LedgerRuleError("owner_not_found", "The owner does not exist.");
    if (input.openedOn > ctx.today) {
      throw new LedgerRuleError("future_date", "An account cannot be opened in the future.");
    }
    if (input.name.trim().length === 0) {
      throw new LedgerRuleError("invalid_name", "The account needs a name.");
    }
    const ineligible = checkAvailableEligibility(input.type, input.includedInAvailable);
    if (ineligible) throw new LedgerRuleError(ineligible.code, ineligible.message);
    const duplicate = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(eq(accounts.ownerId, ctx.ownerId), sql`lower(${accounts.name}) = lower(${input.name})`),
      )
      .get();
    if (duplicate) throw new LedgerRuleError("duplicate_name", "An account with this name exists.");

    const accountId = ctx.ids.next();
    tx.insert(accounts)
      .values({
        id: accountId,
        ownerId: ctx.ownerId,
        name: input.name,
        type: input.type,
        currency: owner.currency,
        includedInAvailable: input.includedInAvailable,
        openedOn: input.openedOn,
        archivedAt: null,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      })
      .run();
    if (input.openingBalance !== 0) {
      insertDraft(tx, ctx, {
        type: "opening_balance",
        balance: input.openingBalance,
        accountId,
        occurredOn: input.openedOn,
      });
    }
    return accountId;
  }, IMMEDIATE);
}

export function insertCategory(
  db: AppDatabase,
  ctx: WriteContext,
  input: { name: string; kind: CategoryKind },
): string {
  return db.transaction((tx) => {
    if (input.name.trim().length === 0) {
      throw new LedgerRuleError("invalid_name", "The category needs a name.");
    }
    assertUniqueName(tx, ctx.ownerId, input.kind, input.name);
    const id = ctx.ids.next();
    tx.insert(categories)
      .values({ id, ownerId: ctx.ownerId, ...input, createdAt: ctx.nowIso, updatedAt: ctx.nowIso })
      .run();
    return id;
  }, IMMEDIATE);
}

export function listAccounts(db: AppDatabase, ownerId: string) {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.ownerId, ownerId))
    .orderBy(sql`lower(${accounts.name})`)
    .all();
}

export function listCategories(db: AppDatabase, ownerId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.ownerId, ownerId))
    .orderBy(asc(categories.kind), asc(categories.name))
    .all();
}

export function listOwners(db: AppDatabase) {
  return db.select().from(owners).orderBy(asc(owners.createdAt)).all();
}

// ---------------------------------------------------------------------------
// Account lifecycle (docs/domain-model.md §5, §12): archive only at a zero
// balance, so money never silently disappears from the position; delete only
// when nothing ever referenced the account.
// ---------------------------------------------------------------------------

function ownedAccount(tx: SyncDb, ownerId: string, id: string) {
  const row = tx
    .select()
    .from(accounts)
    .where(and(eq(accounts.ownerId, ownerId), eq(accounts.id, id)))
    .get();
  if (!row) throw new LedgerRuleError("account_not_found", "The account does not exist.");
  return row;
}

function balanceMinor(tx: SyncDb, ownerId: string, accountId: string): number {
  const row = tx
    .select({ total: sql<number>`coalesce(sum(${accountEntries.deltaMinor}), 0)` })
    .from(accountEntries)
    .where(and(eq(accountEntries.ownerId, ownerId), eq(accountEntries.accountId, accountId)))
    .get();
  return row?.total ?? 0;
}

/**
 * Everything that refers to an account and would block deleting it: ledger rows
 * (including soft-deleted ones) and reconciliation checkpoints. Checkpoints
 * count because verifying an account that already matched records a checkpoint
 * and no transaction — without them such an account would pass this check and
 * then fail at the foreign key.
 */
function accountReferences(tx: SyncDb, ownerId: string, accountId: string): number {
  const rows = tx
    .select({ n: count() })
    .from(transactions)
    .where(
      and(
        eq(transactions.ownerId, ownerId),
        or(eq(transactions.accountId, accountId), eq(transactions.counterAccountId, accountId)),
      ),
    )
    .get();
  const checkpoints = tx
    .select({ n: count() })
    .from(reconciliationCheckpoints)
    .where(
      and(
        eq(reconciliationCheckpoints.ownerId, ownerId),
        eq(reconciliationCheckpoints.accountId, accountId),
      ),
    )
    .get();
  // A commitment's "usually paid from" account is a reference too.
  const expecting = tx
    .select({ n: count() })
    .from(commitments)
    .where(and(eq(commitments.ownerId, ownerId), eq(commitments.expectedAccountId, accountId)))
    .get();
  return (rows?.n ?? 0) + (checkpoints?.n ?? 0) + (expecting?.n ?? 0);
}

export function archiveAccount(db: AppDatabase, ctx: WriteContext, id: string): void {
  db.transaction((tx) => {
    const account = ownedAccount(tx, ctx.ownerId, id);
    if (account.archivedAt !== null) return;
    if (balanceMinor(tx, ctx.ownerId, id) !== 0) {
      throw new LedgerRuleError(
        "balance_not_zero",
        "Only an account with a zero balance can be archived. Move or record the remaining money first.",
      );
    }
    tx.update(accounts)
      .set({ archivedAt: ctx.nowIso, updatedAt: ctx.nowIso })
      .where(and(eq(accounts.ownerId, ctx.ownerId), eq(accounts.id, id)))
      .run();
  }, IMMEDIATE);
}

export function restoreAccount(db: AppDatabase, ctx: WriteContext, id: string): void {
  db.transaction((tx) => {
    ownedAccount(tx, ctx.ownerId, id);
    tx.update(accounts)
      .set({ archivedAt: null, updatedAt: ctx.nowIso })
      .where(and(eq(accounts.ownerId, ctx.ownerId), eq(accounts.id, id)))
      .run();
  }, IMMEDIATE);
}

export function deleteAccount(db: AppDatabase, ctx: WriteContext, id: string): void {
  db.transaction((tx) => {
    ownedAccount(tx, ctx.ownerId, id);
    if (accountReferences(tx, ctx.ownerId, id) > 0) {
      throw new LedgerRuleError(
        "account_in_use",
        "This account has recorded history or commitments, so it can only be archived.",
      );
    }
    tx.delete(accounts)
      .where(and(eq(accounts.ownerId, ctx.ownerId), eq(accounts.id, id)))
      .run();
  }, IMMEDIATE);
}

/** Per-account count of referencing rows, including soft-deleted ones (can it be deleted?). */
export function accountReferenceCounts(db: AppDatabase, ownerId: string): Map<string, number> {
  const counts = new Map<string, number>();
  const tally = (rows: { accountId: string | null; n: number }[]) => {
    for (const r of rows) {
      if (r.accountId) counts.set(r.accountId, (counts.get(r.accountId) ?? 0) + r.n);
    }
  };
  tally(
    db
      .select({ accountId: transactions.accountId, n: count() })
      .from(transactions)
      .where(eq(transactions.ownerId, ownerId))
      .groupBy(transactions.accountId)
      .all(),
  );
  tally(
    db
      .select({ accountId: transactions.counterAccountId, n: count() })
      .from(transactions)
      .where(eq(transactions.ownerId, ownerId))
      .groupBy(transactions.counterAccountId)
      .all(),
  );
  // A verified balance that needed no adjustment leaves a checkpoint and no
  // transaction, so checkpoints are references in their own right.
  tally(
    db
      .select({ accountId: reconciliationCheckpoints.accountId, n: count() })
      .from(reconciliationCheckpoints)
      .where(eq(reconciliationCheckpoints.ownerId, ownerId))
      .groupBy(reconciliationCheckpoints.accountId)
      .all(),
  );
  tally(
    db
      .select({ accountId: commitments.expectedAccountId, n: count() })
      .from(commitments)
      .where(eq(commitments.ownerId, ownerId))
      .groupBy(commitments.expectedAccountId)
      .all(),
  );
  return counts;
}

// ---------------------------------------------------------------------------
// Category lifecycle (docs/domain-model.md §6, §12): categories in use are
// archived, never deleted.
// ---------------------------------------------------------------------------

function ownedCategory(tx: SyncDb, ownerId: string, id: string) {
  const row = tx
    .select()
    .from(categories)
    .where(and(eq(categories.ownerId, ownerId), eq(categories.id, id)))
    .get();
  if (!row) throw new LedgerRuleError("category_not_found", "The category does not exist.");
  return row;
}

function categoryReferences(tx: SyncDb, ownerId: string, categoryId: string): number {
  const row = tx
    .select({ n: count() })
    .from(transactions)
    .where(and(eq(transactions.ownerId, ownerId), eq(transactions.categoryId, categoryId)))
    .get();
  const committed = tx
    .select({ n: count() })
    .from(commitments)
    .where(and(eq(commitments.ownerId, ownerId), eq(commitments.categoryId, categoryId)))
    .get();
  return (row?.n ?? 0) + (committed?.n ?? 0);
}

/**
 * Names are unique per kind, ignoring case, archived categories included (the
 * database's ux_categories_owner_kind_name). An archived match is named as
 * such, since restoring it is usually what the person wants.
 */
function assertUniqueName(
  tx: SyncDb,
  ownerId: string,
  kind: CategoryKind,
  name: string,
  exceptId?: string,
): void {
  const duplicate = tx
    .select({ name: categories.name, archivedAt: categories.archivedAt })
    .from(categories)
    .where(
      and(
        eq(categories.ownerId, ownerId),
        eq(categories.kind, kind),
        sql`lower(${categories.name}) = lower(${name.trim()})`,
        exceptId ? sql`${categories.id} <> ${exceptId}` : undefined,
      ),
    )
    .get();
  if (!duplicate) return;
  throw new LedgerRuleError(
    "duplicate_name",
    duplicate.archivedAt !== null
      ? `${duplicate.name} is an archived ${CATEGORY_KIND_LABEL[kind]}. Restore it instead.`
      : `There is already an ${CATEGORY_KIND_LABEL[kind]} called ${duplicate.name}.`,
  );
}

/**
 * Every kind keeps at least one active category, so new income and expenses
 * can always be recorded. Checked inside the write transaction (IMMEDIATE), so
 * two concurrent archives cannot both pass it.
 */
function assertNotLastActive(
  tx: SyncDb,
  ownerId: string,
  category: { id: string; kind: CategoryKind; archivedAt: string | null },
): void {
  if (category.archivedAt !== null) return;
  const others = tx
    .select({ n: count() })
    .from(categories)
    .where(
      and(
        eq(categories.ownerId, ownerId),
        eq(categories.kind, category.kind),
        sql`${categories.archivedAt} IS NULL`,
        sql`${categories.id} <> ${category.id}`,
      ),
    )
    .get();
  if ((others?.n ?? 0) === 0) {
    throw new LedgerRuleError("last_active_category", LAST_ACTIVE_CATEGORY_MESSAGE[category.kind]);
  }
}

export function renameCategory(db: AppDatabase, ctx: WriteContext, id: string, name: string): void {
  db.transaction((tx) => {
    const category = ownedCategory(tx, ctx.ownerId, id);
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      throw new LedgerRuleError("invalid_name", "The category needs a name.");
    }
    assertUniqueName(tx, ctx.ownerId, category.kind, trimmed, id);
    tx.update(categories)
      .set({ name: trimmed, updatedAt: ctx.nowIso })
      .where(and(eq(categories.ownerId, ctx.ownerId), eq(categories.id, id)))
      .run();
  }, IMMEDIATE);
}

export function setCategoryArchived(
  db: AppDatabase,
  ctx: WriteContext,
  id: string,
  archived: boolean,
): void {
  db.transaction((tx) => {
    const category = ownedCategory(tx, ctx.ownerId, id);
    if (archived) assertNotLastActive(tx, ctx.ownerId, category);
    tx.update(categories)
      .set({ archivedAt: archived ? ctx.nowIso : null, updatedAt: ctx.nowIso })
      .where(and(eq(categories.ownerId, ctx.ownerId), eq(categories.id, id)))
      .run();
  }, IMMEDIATE);
}

export function deleteCategory(db: AppDatabase, ctx: WriteContext, id: string): void {
  db.transaction((tx) => {
    const category = ownedCategory(tx, ctx.ownerId, id);
    assertNotLastActive(tx, ctx.ownerId, category);
    if (categoryReferences(tx, ctx.ownerId, id) > 0) {
      throw new LedgerRuleError(
        "category_in_use",
        "This category is used by transactions or commitments, so it can only be archived.",
      );
    }
    tx.delete(categories)
      .where(and(eq(categories.ownerId, ctx.ownerId), eq(categories.id, id)))
      .run();
  }, IMMEDIATE);
}

/** Per-category count of referencing rows, including soft-deleted ones (can it be deleted?). */
export function categoryReferenceCounts(db: AppDatabase, ownerId: string): Map<string, number> {
  const counts = new Map<string, number>();
  const rows = db
    .select({ categoryId: transactions.categoryId, n: count() })
    .from(transactions)
    .where(eq(transactions.ownerId, ownerId))
    .groupBy(transactions.categoryId)
    .all();
  for (const r of rows) if (r.categoryId) counts.set(r.categoryId, r.n);
  const committed = db
    .select({ categoryId: commitments.categoryId, n: count() })
    .from(commitments)
    .where(eq(commitments.ownerId, ownerId))
    .groupBy(commitments.categoryId)
    .all();
  for (const r of committed) counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + r.n);
  return counts;
}

/**
 * What a category is used by, as a person sees it: its recorded (not deleted)
 * transactions and the commitments that pay into it. Deleting also counts
 * deleted transactions, which still reference it (categoryReferenceCounts).
 */
export function categoryUsage(
  db: AppDatabase,
  ownerId: string,
): Map<string, { records: number; commitments: string[] }> {
  const usage = new Map<string, { records: number; commitments: string[] }>();
  const entry = (id: string) => {
    let found = usage.get(id);
    if (!found) usage.set(id, (found = { records: 0, commitments: [] }));
    return found;
  };
  const rows = db
    .select({ categoryId: activeTransactions.categoryId, n: count() })
    .from(activeTransactions)
    .where(eq(activeTransactions.ownerId, ownerId))
    .groupBy(activeTransactions.categoryId)
    .all();
  for (const r of rows) if (r.categoryId) entry(r.categoryId).records = r.n;
  const committed = db
    .select({ categoryId: commitments.categoryId, name: commitments.name })
    .from(commitments)
    .where(eq(commitments.ownerId, ownerId))
    .orderBy(sql`lower(${commitments.name})`)
    .all();
  for (const r of committed) entry(r.categoryId).commitments.push(r.name);
  return usage;
}
