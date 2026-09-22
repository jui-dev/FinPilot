import { integer, sqliteView, text } from "drizzle-orm/sqlite-core";

import { TRANSACTION_TYPE_VALUES } from "./schema";

/**
 * Typed declarations of the views created by migration 0001_ledger_views.sql.
 * `.existing()` tells drizzle-kit not to generate them: their DDL is hand-written.
 */

export const activeTransactions = sqliteView("active_transactions", {
  id: text("id").notNull(),
  ownerId: text("owner_id").notNull(),
  sequence: integer("sequence").notNull(),
  type: text("type", { enum: TRANSACTION_TYPE_VALUES }).notNull(),
  occurredOn: text("occurred_on").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  accountId: text("account_id").notNull(),
  counterAccountId: text("counter_account_id"),
  categoryId: text("category_id"),
  refundOfId: text("refund_of_id"),
  groupId: text("group_id"),
  description: text("description"),
  note: text("note"),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}).existing();

export const accountEntries = sqliteView("account_entries", {
  ownerId: text("owner_id").notNull(),
  transactionId: text("transaction_id").notNull(),
  accountId: text("account_id").notNull(),
  deltaMinor: integer("delta_minor").notNull(),
  occurredOn: text("occurred_on").notNull(),
  sequence: integer("sequence").notNull(),
  type: text("type", { enum: TRANSACTION_TYPE_VALUES }).notNull(),
}).existing();
