import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { accounts } from "@/db/schema";
import { accountEntries, activeTransactions } from "@/db/views";
import type { CalendarDate, DateRange } from "@/domain/calendar-date";

/**
 * Ledger read models. All reads go through the views (soft-delete filter and
 * transfer mirroring live there). Date windows are computed in TypeScript and
 * passed as parameters — no SQL date functions, so queries port unchanged.
 */

/** Every account's balance: Σ account_entries, optionally as of a date (inclusive). */
export function accountBalances(db: AppDatabase, ownerId: string, asOf?: CalendarDate) {
  const joinOn = and(
    eq(accountEntries.ownerId, accounts.ownerId),
    eq(accountEntries.accountId, accounts.id),
    asOf ? lte(accountEntries.occurredOn, asOf) : undefined,
  );
  return db
    .select({
      accountId: accounts.id,
      name: accounts.name,
      type: accounts.type,
      balanceMinor: sql<number>`coalesce(sum(${accountEntries.deltaMinor}), 0)`,
    })
    .from(accounts)
    .leftJoin(accountEntries, joinOn)
    .where(eq(accounts.ownerId, ownerId))
    .groupBy(accounts.id)
    .orderBy(asc(accounts.name))
    .all();
}

const inRange = (range: DateRange) =>
  and(
    gte(activeTransactions.occurredOn, range.start),
    lt(activeTransactions.occurredOn, range.end),
  );

/** Spending per category over a half-open range: −Σ(expense + refund). */
export function spendingByCategory(db: AppDatabase, ownerId: string, range: DateRange) {
  return db
    .select({
      categoryId: activeTransactions.categoryId,
      spendingMinor: sql<number>`-sum(${activeTransactions.amountMinor})`,
    })
    .from(activeTransactions)
    .where(
      and(
        eq(activeTransactions.ownerId, ownerId),
        inArray(activeTransactions.type, ["expense", "refund"]),
        inRange(range),
      ),
    )
    .groupBy(activeTransactions.categoryId)
    .all();
}

/** Income over a half-open range. */
export function incomeTotal(db: AppDatabase, ownerId: string, range: DateRange): number {
  const row = db
    .select({ total: sql<number>`coalesce(sum(${activeTransactions.amountMinor}), 0)` })
    .from(activeTransactions)
    .where(
      and(
        eq(activeTransactions.ownerId, ownerId),
        eq(activeTransactions.type, "income"),
        inRange(range),
      ),
    )
    .get();
  return row?.total ?? 0;
}

/** Active transactions in business order: (occurred_on, sequence). Never by id. */
export function listTransactions(db: AppDatabase, ownerId: string, range?: DateRange) {
  return db
    .select()
    .from(activeTransactions)
    .where(and(eq(activeTransactions.ownerId, ownerId), range ? inRange(range) : undefined))
    .orderBy(asc(activeTransactions.occurredOn), asc(activeTransactions.sequence))
    .all();
}
