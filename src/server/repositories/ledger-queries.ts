import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";

import type { AppDatabase, SyncDb } from "@/db/client";
import { accounts } from "@/db/schema";
import { accountEntries, activeTransactions } from "@/db/views";
import type { CalendarDate, DateRange } from "@/domain/calendar-date";

/**
 * Ledger read models. All reads go through the views (soft-delete filter and
 * transfer mirroring live there). Date windows are computed in TypeScript and
 * passed as parameters — no SQL date functions, so queries port unchanged.
 */

/**
 * One account's balance: Σ account_entries up to and including `asOf`.
 *
 * Typed on SyncDb so a write script can call it with its own transaction
 * handle: reconciliation must read the recorded balance and write the
 * adjustment in one transaction, or the two could disagree.
 */
export function accountBalanceAsOf(
  db: SyncDb,
  ownerId: string,
  accountId: string,
  asOf: CalendarDate,
): number {
  const row = db
    .select({ balanceMinor: sql<number>`coalesce(sum(${accountEntries.deltaMinor}), 0)` })
    .from(accountEntries)
    .where(
      and(
        eq(accountEntries.ownerId, ownerId),
        eq(accountEntries.accountId, accountId),
        lte(accountEntries.occurredOn, asOf),
      ),
    )
    .get();
  return row?.balanceMinor ?? 0;
}

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
    .orderBy(sql`lower(${accounts.name})`)
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

/**
 * Income per income category over a half-open range: the same rows as
 * incomeTotal, grouped by where the money came from (every income row has a
 * category). Its sum is incomeTotal.
 */
export function incomeByCategory(db: AppDatabase, ownerId: string, range: DateRange) {
  return db
    .select({
      categoryId: activeTransactions.categoryId,
      incomeMinor: sql<number>`sum(${activeTransactions.amountMinor})`,
    })
    .from(activeTransactions)
    .where(
      and(
        eq(activeTransactions.ownerId, ownerId),
        eq(activeTransactions.type, "income"),
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

/**
 * Income and spending per day over a half-open range, with the same meaning
 * as incomeTotal and spendingByCategory: income is Σ income, spending is
 * −Σ(expense + refund). Days with neither are absent.
 */
export function dailyIncomeAndSpending(db: AppDatabase, ownerId: string, range: DateRange) {
  return db
    .select({
      occurredOn: activeTransactions.occurredOn,
      incomeMinor: sql<number>`coalesce(sum(case when ${activeTransactions.type} = 'income' then ${activeTransactions.amountMinor} end), 0)`,
      spendingMinor: sql<number>`-coalesce(sum(case when ${activeTransactions.type} in ('expense', 'refund') then ${activeTransactions.amountMinor} end), 0)`,
    })
    .from(activeTransactions)
    .where(
      and(
        eq(activeTransactions.ownerId, ownerId),
        inArray(activeTransactions.type, ["income", "expense", "refund"]),
        inRange(range),
      ),
    )
    .groupBy(activeTransactions.occurredOn)
    .all();
}
