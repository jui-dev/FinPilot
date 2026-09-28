import { sql } from "drizzle-orm";
import { COMMITMENT_FREQUENCIES } from "@/domain/commitments/schedule";
import { ACCOUNT_TYPES } from "@/domain/ledger/accounts";
import { CATEGORY_KINDS, TRANSACTION_TYPES } from "@/domain/ledger/transactions";
import {
  check,
  foreignKey,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * FinPilot ledger schema (docs/domain-model.md). Every table is owner-scoped.
 *
 * Owner consistency is enforced by composite foreign keys (child.owner_id, child.x)
 * → parent(owner_id, id). SQLite requires the parent key of a foreign key to be
 * the PRIMARY KEY or to carry a UNIQUE index on exactly those columns, so each
 * referenced table has UNIQUE (owner_id, id). That index also serves every
 * owner-scoped lookup, so no separate owner_id index is created.
 *
 * SQLite-only shape checks (typeof, date()) are marked; in PostgreSQL native
 * bigint / DATE / boolean types replace them.
 */

const timestamps = {
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
};

// ---------------------------------------------------------------------------
// owners
// ---------------------------------------------------------------------------

export const owners = sqliteTable(
  "owners",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    baseCurrency: text("base_currency").notNull(),
    timeZone: text("time_zone").notNull(),
    /** Next value of the per-owner recording sequence (transactions.sequence). */
    nextTransactionSequence: integer("next_transaction_sequence").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    check("ck_owners_currency", sql`length(${t.baseCurrency}) = 3`),
    check("ck_owners_sequence", sql`${t.nextTransactionSequence} >= 1`),
  ],
);

// ---------------------------------------------------------------------------
// accounts
// ---------------------------------------------------------------------------

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Asset/liability class is derived from the type in domain code, never stored. */
    type: text("type", { enum: ACCOUNT_TYPES }).notNull(),
    currency: text("currency").notNull(),
    includedInAvailable: integer("included_in_available", { mode: "boolean" }).notNull(),
    /** The account's start date: no transaction may be dated before it. */
    openedOn: text("opened_on").notNull(),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ux_accounts_owner_id").on(t.ownerId, t.id),
    uniqueIndex("ux_accounts_owner_name").on(t.ownerId, sql`lower(${t.name})`),
    check(
      "ck_accounts_type",
      sql`${t.type} IN ('cash', 'bank', 'mobile_wallet', 'savings', 'credit_card')`,
    ),
    check("ck_accounts_currency", sql`length(${t.currency}) = 3`),
    check("ck_accounts_included_bool", sql`${t.includedInAvailable} IN (0, 1)`),
    check("ck_accounts_name", sql`length(trim(${t.name})) > 0`),
    // SQLite-only: a real calendar date in ISO form (PostgreSQL: DATE). `date()` returns
    // NULL for malformed input and a NULL CHECK result passes, hence IS NOT NULL.
    check(
      "ck_accounts_opened_on",
      sql`date(${t.openedOn}) IS NOT NULL AND ${t.openedOn} = date(${t.openedOn})`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KINDS }).notNull(),
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("ux_categories_owner_id").on(t.ownerId, t.id),
    uniqueIndex("ux_categories_owner_kind_name").on(t.ownerId, t.kind, sql`lower(${t.name})`),
    check("ck_categories_kind", sql`${t.kind} IN ('income', 'expense')`),
    check("ck_categories_name", sql`length(trim(${t.name})) > 0`),
  ],
);

// ---------------------------------------------------------------------------
// transactions — Model S (docs/domain-model.md §1)
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  "transactions",
  {
    /** Identity only. Never used for ordering. */
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    /** Deterministic per-owner recording order; immutable once assigned. */
    sequence: integer("sequence").notNull(),
    type: text("type", { enum: TRANSACTION_TYPES }).notNull(),
    /** Calendar date (no time, no zone). Business order: (occurred_on, sequence). */
    occurredOn: text("occurred_on").notNull(),
    /** Signed effect on account_id, in integer minor units. */
    amountMinor: integer("amount_minor").notNull(),
    accountId: text("account_id").notNull(),
    counterAccountId: text("counter_account_id"),
    categoryId: text("category_id"),
    refundOfId: text("refund_of_id"),
    groupId: text("group_id"),
    description: text("description"),
    note: text("note"),
    deletedAt: text("deleted_at"),
    ...timestamps,
  },
  (t) => [
    // Owner-consistent references (D1).
    foreignKey({
      name: "fk_transactions_account",
      columns: [t.ownerId, t.accountId],
      foreignColumns: [accounts.ownerId, accounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_transactions_counter_account",
      columns: [t.ownerId, t.counterAccountId],
      foreignColumns: [accounts.ownerId, accounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_transactions_category",
      columns: [t.ownerId, t.categoryId],
      foreignColumns: [categories.ownerId, categories.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_transactions_refund_of",
      columns: [t.ownerId, t.refundOfId],
      foreignColumns: [t.ownerId, t.id],
    }).onDelete("restrict"),

    // Parent key for fk_transactions_refund_of; also the owner-scoped lookup index.
    uniqueIndex("ux_transactions_owner_id").on(t.ownerId, t.id),
    uniqueIndex("ux_transactions_owner_sequence").on(t.ownerId, t.sequence),
    // At most one ACTIVE opening-balance transaction per account. Accounts opened
    // with a zero balance have none; accounts.opened_on is their start date.
    uniqueIndex("ux_transactions_active_opening_balance")
      .on(t.accountId)
      .where(sql`${t.type} = 'opening_balance' AND ${t.deletedAt} IS NULL`),

    // Balances and balance-as-of (also covers the account FK's child lookups).
    index("ix_transactions_account_date").on(t.ownerId, t.accountId, t.occurredOn),
    index("ix_transactions_counter_account_date")
      .on(t.ownerId, t.counterAccountId, t.occurredOn)
      .where(sql`${t.counterAccountId} IS NOT NULL`),
    // Business-ordered lists: (occurred_on, sequence).
    index("ix_transactions_owner_order").on(t.ownerId, t.occurredOn, t.sequence),
    // Spending by category over a date range.
    index("ix_transactions_category_date").on(t.ownerId, t.categoryId, t.occurredOn),
    index("ix_transactions_group")
      .on(t.groupId)
      .where(sql`${t.groupId} IS NOT NULL`),
    index("ix_transactions_refund_of")
      .on(t.ownerId, t.refundOfId)
      .where(sql`${t.refundOfId} IS NOT NULL`),

    check(
      "ck_transactions_type",
      sql`${t.type} IN ('income', 'expense', 'refund', 'transfer', 'opening_balance', 'adjustment')`,
    ),
    // SQLite-only shape checks (PostgreSQL: bigint, DATE).
    check("ck_transactions_amount_integer", sql`typeof(${t.amountMinor}) = 'integer'`),
    check(
      "ck_transactions_occurred_on",
      sql`date(${t.occurredOn}) IS NOT NULL AND ${t.occurredOn} = date(${t.occurredOn})`,
    ),
    check("ck_transactions_sequence", sql`${t.sequence} >= 1`),

    // Per-type shape (docs/domain-model.md §4.1). Mirrored by the pure domain rule
    // checkTransactionShape; a differential property test keeps them in agreement.
    check(
      "ck_transactions_income",
      sql`${t.type} <> 'income' OR (${t.amountMinor} > 0 AND ${t.categoryId} IS NOT NULL AND ${t.counterAccountId} IS NULL AND ${t.refundOfId} IS NULL)`,
    ),
    check(
      "ck_transactions_expense",
      sql`${t.type} <> 'expense' OR (${t.amountMinor} < 0 AND ${t.categoryId} IS NOT NULL AND ${t.counterAccountId} IS NULL AND ${t.refundOfId} IS NULL)`,
    ),
    check(
      "ck_transactions_refund",
      sql`${t.type} <> 'refund' OR (${t.amountMinor} > 0 AND ${t.categoryId} IS NOT NULL AND ${t.counterAccountId} IS NULL)`,
    ),
    check(
      "ck_transactions_transfer",
      sql`${t.type} <> 'transfer' OR (${t.amountMinor} < 0 AND ${t.counterAccountId} IS NOT NULL AND ${t.counterAccountId} <> ${t.accountId} AND ${t.categoryId} IS NULL AND ${t.refundOfId} IS NULL)`,
    ),
    check(
      "ck_transactions_opening_adjustment",
      sql`${t.type} NOT IN ('opening_balance', 'adjustment') OR (${t.amountMinor} <> 0 AND ${t.categoryId} IS NULL AND ${t.counterAccountId} IS NULL AND ${t.refundOfId} IS NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// reconciliation_checkpoints — "on date D this account really held X"
// (docs/domain-model.md §2, §6)
// ---------------------------------------------------------------------------

export const reconciliationCheckpoints = sqliteTable(
  "reconciliation_checkpoints",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    accountId: text("account_id").notNull(),
    /** The calendar date the balance was verified for. */
    asOf: text("as_of").notNull(),
    /** The balance the person stated, signed like every other balance (zero is valid). */
    statedBalanceMinor: integer("stated_balance_minor").notNull(),
    /** The correcting adjustment, or NULL when the ledger already agreed. */
    adjustmentId: text("adjustment_id"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "fk_reconciliation_checkpoints_account",
      columns: [t.ownerId, t.accountId],
      foreignColumns: [accounts.ownerId, accounts.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_reconciliation_checkpoints_adjustment",
      columns: [t.ownerId, t.adjustmentId],
      foreignColumns: [transactions.ownerId, transactions.id],
    }).onDelete("restrict"),

    uniqueIndex("ux_reconciliation_checkpoints_owner_id").on(t.ownerId, t.id),
    // A checkpoint is a historical observation, not "the" verification of a
    // date: an account may legitimately be verified more than once on the same
    // day, so there is deliberately NO unique index on (owner, account, as_of).
    index("ix_reconciliation_checkpoints_account_as_of").on(t.ownerId, t.accountId, t.asOf),
    // Answers "is this adjustment owned by a checkpoint?" when deleting.
    index("ix_reconciliation_checkpoints_adjustment")
      .on(t.ownerId, t.adjustmentId)
      .where(sql`${t.adjustmentId} IS NOT NULL`),

    // SQLite-only shape checks (PostgreSQL: DATE, bigint).
    check(
      "ck_reconciliation_checkpoints_as_of",
      sql`date(${t.asOf}) IS NOT NULL AND ${t.asOf} = date(${t.asOf})`,
    ),
    check(
      "ck_reconciliation_checkpoints_stated_integer",
      sql`typeof(${t.statedBalanceMinor}) = 'integer'`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// commitments — the rule of a recurring obligation (docs/domain-model.md §8)
// ---------------------------------------------------------------------------

export const commitments = sqliteTable(
  "commitments",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** The obligation's purpose, and the category of every expense Pay records. */
    categoryId: text("category_id").notNull(),
    expectedAmountMinor: integer("expected_amount_minor").notNull(),
    /** "Usually paid from": descriptive only, with no funding meaning (open decision O-1). */
    expectedAccountId: text("expected_account_id"),
    frequency: text("frequency", { enum: COMMITMENT_FREQUENCIES }).notNull(),
    intervalCount: integer("interval_count").notNull(),
    /** The recurrence anchor: its day of month is the day every due date aims for. */
    anchorOn: text("anchor_on").notNull(),
    /** The last day a due date may fall on (inclusive), or NULL for no end. */
    endOn: text("end_on"),
    /**
     * The generation boundary: this version of the rule may create occurrences
     * only for due dates on or after this day. Set to anchor_on on create and
     * moved forward (never back) by a rule edit, so an edited rule can never
     * manufacture historical occurrences that the old rule did not have.
     */
    generateFrom: text("generate_from").notNull(),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "fk_commitments_category",
      columns: [t.ownerId, t.categoryId],
      foreignColumns: [categories.ownerId, categories.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_commitments_expected_account",
      columns: [t.ownerId, t.expectedAccountId],
      foreignColumns: [accounts.ownerId, accounts.id],
    }).onDelete("restrict"),

    // Parent key for fk_commitment_occurrences_commitment.
    uniqueIndex("ux_commitments_owner_id").on(t.ownerId, t.id),

    check("ck_commitments_name", sql`length(trim(${t.name})) > 0`),
    check("ck_commitments_frequency", sql`${t.frequency} IN ('monthly', 'yearly')`),
    check(
      "ck_commitments_interval",
      sql`typeof(${t.intervalCount}) = 'integer' AND ${t.intervalCount} >= 1`,
    ),
    check(
      "ck_commitments_amount",
      sql`typeof(${t.expectedAmountMinor}) = 'integer' AND ${t.expectedAmountMinor} > 0`,
    ),
    // SQLite-only date shape checks (PostgreSQL: DATE).
    check(
      "ck_commitments_anchor_on",
      sql`date(${t.anchorOn}) IS NOT NULL AND ${t.anchorOn} = date(${t.anchorOn})`,
    ),
    check(
      "ck_commitments_end_on",
      sql`${t.endOn} IS NULL OR (date(${t.endOn}) IS NOT NULL AND ${t.endOn} = date(${t.endOn}) AND ${t.endOn} >= ${t.anchorOn})`,
    ),
    check(
      "ck_commitments_generate_from",
      sql`date(${t.generateFrom}) IS NOT NULL AND ${t.generateFrom} = date(${t.generateFrom})`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// commitment_occurrences — one expected instance of a commitment
// (docs/domain-model.md §8). Whether it is paid is derived from the linked
// transaction, never stored.
// ---------------------------------------------------------------------------

export const commitmentOccurrences = sqliteTable(
  "commitment_occurrences",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    commitmentId: text("commitment_id").notNull(),
    dueOn: text("due_on").notNull(),
    /** Snapshot of the rule's amount when the occurrence was created. */
    expectedAmountMinor: integer("expected_amount_minor").notNull(),
    /**
     * The payment evidence. The ledger never clears it: a deleted or edited-away
     * transaction leaves it in place, which records that the occurrence was ever
     * linked. Only an explicit Pay (replace) or Skip (clear) changes it.
     */
    transactionId: text("transaction_id"),
    /** When the person explicitly skipped it; NULL otherwise. */
    skippedAt: text("skipped_at"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "fk_commitment_occurrences_commitment",
      columns: [t.ownerId, t.commitmentId],
      foreignColumns: [commitments.ownerId, commitments.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_commitment_occurrences_transaction",
      columns: [t.ownerId, t.transactionId],
      foreignColumns: [transactions.ownerId, transactions.id],
    }).onDelete("restrict"),

    // Materialisation is idempotent: one occurrence per commitment and date.
    uniqueIndex("ux_commitment_occurrences_due").on(t.commitmentId, t.dueOn),
    // One transaction pays at most one occurrence.
    uniqueIndex("ux_commitment_occurrences_transaction")
      .on(t.transactionId)
      .where(sql`${t.transactionId} IS NOT NULL`),
    // Pending and overdue occurrences, read in due-date order.
    index("ix_commitment_occurrences_owner_due").on(t.ownerId, t.dueOn),

    check(
      "ck_commitment_occurrences_outcome",
      sql`NOT (${t.transactionId} IS NOT NULL AND ${t.skippedAt} IS NOT NULL)`,
    ),
    check(
      "ck_commitment_occurrences_amount",
      sql`typeof(${t.expectedAmountMinor}) = 'integer' AND ${t.expectedAmountMinor} > 0`,
    ),
    check(
      "ck_commitment_occurrences_due_on",
      sql`date(${t.dueOn}) IS NOT NULL AND ${t.dueOn} = date(${t.dueOn})`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// protected_money_items — what money is set aside for (docs/domain-model.md §9).
// Shown to the person as "Set aside". A target is intention only: nothing is
// reserved, backed or released through it.
// ---------------------------------------------------------------------------

export const protectedMoneyItems = sqliteTable(
  "protected_money_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Optional intention; NULL when the item has no target. */
    targetMinor: integer("target_minor"),
    /** Set only when nothing remains reserved (checked by the archive script). */
    archivedAt: text("archived_at"),
    ...timestamps,
  },
  (t) => [
    // Parent key for fk_earmarks_item.
    uniqueIndex("ux_protected_money_items_owner_id").on(t.ownerId, t.id),
    check("ck_protected_money_items_name", sql`length(trim(${t.name})) > 0`),
    check(
      "ck_protected_money_items_target",
      sql`${t.targetMinor} IS NULL OR (typeof(${t.targetMinor}) = 'integer' AND ${t.targetMinor} > 0)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// earmarks — one (item, account) reservation relationship and its backing
// priority. Its amount is never stored: it is the sum of its entries. A full
// release ends it (ended_at); setting money aside again later starts a new
// earmark, with a new priority behind every existing one.
// ---------------------------------------------------------------------------

export const earmarks = sqliteTable(
  "earmarks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    itemId: text("item_id").notNull(),
    accountId: text("account_id").notNull(),
    /**
     * Backing priority: lower is backed first (oldest first). Taken as the
     * owner's highest priority + 1 when the earmark is established, and never
     * changed. Identity (id) is never used for ordering.
     */
    priority: integer("priority").notNull(),
    /** When a full release brought it to zero; NULL while it is active. */
    endedAt: text("ended_at"),
    ...timestamps,
  },
  (t) => [
    foreignKey({
      name: "fk_earmarks_item",
      columns: [t.ownerId, t.itemId],
      foreignColumns: [protectedMoneyItems.ownerId, protectedMoneyItems.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "fk_earmarks_account",
      columns: [t.ownerId, t.accountId],
      foreignColumns: [accounts.ownerId, accounts.id],
    }).onDelete("restrict"),

    // Parent key for fk_earmark_entries_earmark.
    uniqueIndex("ux_earmarks_owner_id").on(t.ownerId, t.id),
    // Priorities are never shared, so backing order is total and deterministic.
    uniqueIndex("ux_earmarks_owner_priority").on(t.ownerId, t.priority),
    // At most one active earmark per item and account.
    uniqueIndex("ux_earmarks_active_item_account")
      .on(t.itemId, t.accountId)
      .where(sql`${t.endedAt} IS NULL`),
    // Backing reads: an account's earmarks in priority order.
    index("ix_earmarks_account_priority").on(t.ownerId, t.accountId, t.priority),

    check("ck_earmarks_priority", sql`typeof(${t.priority}) = 'integer' AND ${t.priority} >= 1`),
  ],
);

// ---------------------------------------------------------------------------
// earmark_entries — append-only signed changes to an earmark
// (docs/domain-model.md §9): positive reserves, negative releases.
// ---------------------------------------------------------------------------

export const earmarkEntries = sqliteTable(
  "earmark_entries",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    earmarkId: text("earmark_id").notNull(),
    /** Signed change in integer minor units; never zero. */
    amountMinor: integer("amount_minor").notNull(),
    /** Append-only: an entry is never updated, so it has no updated_at. */
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      name: "fk_earmark_entries_earmark",
      columns: [t.ownerId, t.earmarkId],
      foreignColumns: [earmarks.ownerId, earmarks.id],
    }).onDelete("restrict"),

    index("ix_earmark_entries_earmark").on(t.ownerId, t.earmarkId),

    check(
      "ck_earmark_entries_amount",
      sql`typeof(${t.amountMinor}) = 'integer' AND ${t.amountMinor} <> 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// signal_dismissals — an Attention signal the person hid for its episode
// (docs/domain-model.md §11). Keyed by the signal's full key, so hiding
// September's signal never hides October's. Signals themselves are derived and
// never stored; there is no history, read state or expiry. Undo deletes the row.
// ---------------------------------------------------------------------------

export const signalDismissals = sqliteTable(
  "signal_dismissals",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    /** The signal's key: `kind : subject`, plus its episode (§11). */
    signalKey: text("signal_key").notNull(),
    /** When it was hidden; never updated. */
    dismissedAt: text("dismissed_at").notNull(),
  },
  (t) => [
    // One dismissal per owner and key; hiding again is a no-op. Also serves
    // every owner-scoped read.
    uniqueIndex("ux_signal_dismissals_owner_key").on(t.ownerId, t.signalKey),
    check(
      "ck_signal_dismissals_key",
      sql`length(trim(${t.signalKey})) > 0 AND length(${t.signalKey}) <= 200`,
    ),
  ],
);
