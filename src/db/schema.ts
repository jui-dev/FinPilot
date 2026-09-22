import { sql } from "drizzle-orm";
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

export const ACCOUNT_TYPE_VALUES = [
  "cash",
  "bank",
  "mobile_wallet",
  "savings",
  "credit_card",
] as const;

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** Asset/liability class is derived from the type in domain code, never stored. */
    type: text("type", { enum: ACCOUNT_TYPE_VALUES }).notNull(),
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
    // SQLite-only: a real calendar date in ISO form (PostgreSQL: DATE).
    check("ck_accounts_opened_on", sql`${t.openedOn} = date(${t.openedOn})`),
  ],
);

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const CATEGORY_KIND_VALUES = ["income", "expense"] as const;

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => owners.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: CATEGORY_KIND_VALUES }).notNull(),
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

export const TRANSACTION_TYPE_VALUES = [
  "income",
  "expense",
  "refund",
  "transfer",
  "opening_balance",
  "adjustment",
] as const;

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
    type: text("type", { enum: TRANSACTION_TYPE_VALUES }).notNull(),
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
    check("ck_transactions_occurred_on", sql`${t.occurredOn} = date(${t.occurredOn})`),
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
