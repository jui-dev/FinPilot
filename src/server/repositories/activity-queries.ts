import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import type { AppDatabase } from "@/db/client";
import { accounts, categories } from "@/db/schema";
import { activeTransactions as t } from "@/db/views";
import type { CalendarDate, DateRange } from "@/domain/calendar-date";
import type { TransactionType } from "@/domain/ledger/transactions";

/**
 * Activity read models: the searchable transaction list and the facts Quick
 * Add needs (last used account/category, frequent categories). All reads go
 * through the active_transactions view; ordering is always explicit
 * (occurred_on, sequence) — never by id.
 */

const counter = alias(accounts, "counter_account");

export interface ActivityQuery {
  readonly text?: string;
  /** Matches a typed amount exactly (either side of a transfer). */
  readonly amountMinor?: number;
  readonly accountId?: string;
  readonly categoryId?: string;
  readonly types?: readonly TransactionType[];
  readonly range?: DateRange;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const selection = {
  id: t.id,
  sequence: t.sequence,
  type: t.type,
  occurredOn: t.occurredOn,
  amountMinor: t.amountMinor,
  accountId: t.accountId,
  accountName: accounts.name,
  accountType: accounts.type,
  counterAccountId: t.counterAccountId,
  counterAccountName: counter.name,
  counterAccountType: counter.type,
  categoryId: t.categoryId,
  categoryName: categories.name,
  refundOfId: t.refundOfId,
  groupId: t.groupId,
  description: t.description,
  note: t.note,
};

export type ActivityRecord = Awaited<ReturnType<typeof selectRecords>>[number];

function selectRecords(db: AppDatabase, ownerId: string, where: SQL | undefined) {
  return db
    .select(selection)
    .from(t)
    .innerJoin(accounts, and(eq(accounts.ownerId, t.ownerId), eq(accounts.id, t.accountId)))
    .leftJoin(counter, and(eq(counter.ownerId, t.ownerId), eq(counter.id, t.counterAccountId)))
    .leftJoin(categories, and(eq(categories.ownerId, t.ownerId), eq(categories.id, t.categoryId)))
    .where(and(eq(t.ownerId, ownerId), where))
    .orderBy(desc(t.occurredOn), desc(t.sequence))
    .all();
}

/** Active transactions matching every given filter, newest first. */
export function searchActivity(db: AppDatabase, ownerId: string, query: ActivityQuery) {
  const conditions: (SQL | undefined)[] = [];
  if (query.range) {
    conditions.push(gte(t.occurredOn, query.range.start), lt(t.occurredOn, query.range.end));
  }
  if (query.accountId) {
    conditions.push(or(eq(t.accountId, query.accountId), eq(t.counterAccountId, query.accountId)));
  }
  if (query.categoryId) conditions.push(eq(t.categoryId, query.categoryId));
  if (query.types && query.types.length > 0) conditions.push(inArray(t.type, [...query.types]));
  const text = query.text?.trim().toLowerCase();
  if (text) {
    const pattern = `%${escapeLike(text)}%`;
    const like = (column: SQLWrapper) =>
      sql`lower(coalesce(${column}, '')) like ${pattern} escape '\\'`;
    conditions.push(
      or(
        like(t.description),
        like(t.note),
        like(categories.name),
        like(accounts.name),
        like(counter.name),
        query.amountMinor !== undefined
          ? sql`abs(${t.amountMinor}) = ${query.amountMinor}`
          : undefined,
      ),
    );
  }
  return selectRecords(db, ownerId, and(...conditions));
}

/** Every active row of the given groups (a transfer and its fee travel together). */
export function groupMembers(db: AppDatabase, ownerId: string, groupIds: readonly string[]) {
  if (groupIds.length === 0) return [];
  return selectRecords(db, ownerId, inArray(t.groupId, [...groupIds]));
}

/** Specific active rows by id (e.g. the expenses that listed refunds point to). */
export function recordsById(db: AppDatabase, ownerId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return selectRecords(db, ownerId, inArray(t.id, [...ids]));
}

/** Months (YYYY-MM) that contain at least one active transaction, newest first. */
export function activityMonths(db: AppDatabase, ownerId: string): string[] {
  const month = sql<string>`substr(${t.occurredOn}, 1, 7)`;
  return db
    .selectDistinct({ month })
    .from(t)
    .where(eq(t.ownerId, ownerId))
    .orderBy(desc(month))
    .all()
    .map((r) => r.month);
}

/** The most recently recorded row of a type (by recording sequence). */
export function lastRecorded(db: AppDatabase, ownerId: string, type: TransactionType) {
  return db
    .select({
      accountId: t.accountId,
      counterAccountId: t.counterAccountId,
      categoryId: t.categoryId,
    })
    .from(t)
    .where(and(eq(t.ownerId, ownerId), eq(t.type, type)))
    .orderBy(desc(t.sequence))
    .limit(1)
    .get();
}

/** How often each category was used by a type since a date, most used first. */
export function categoryUsage(
  db: AppDatabase,
  ownerId: string,
  type: TransactionType,
  since: CalendarDate,
) {
  const uses = count();
  return db
    .select({ categoryId: t.categoryId, uses })
    .from(t)
    .where(and(eq(t.ownerId, ownerId), eq(t.type, type), gte(t.occurredOn, since)))
    .groupBy(t.categoryId)
    .orderBy(desc(uses))
    .all();
}
