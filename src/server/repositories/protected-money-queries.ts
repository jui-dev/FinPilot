import { and, asc, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { earmarkEntries, earmarks, protectedMoneyItems } from "@/db/schema";

/**
 * Protected-money read models. Only stored facts are read here: what each
 * earmark reserves (the sum of its entries) and its backing priority. What
 * real money covers is derived by the service from current balances.
 */

export function listItems(db: AppDatabase, ownerId: string) {
  return db
    .select()
    .from(protectedMoneyItems)
    .where(eq(protectedMoneyItems.ownerId, ownerId))
    .orderBy(sql`lower(${protectedMoneyItems.name})`, asc(protectedMoneyItems.createdAt))
    .all();
}

/**
 * Every active earmark with its reserved amount, per account in backing
 * priority order (oldest established first). Ended earmarks hold nothing and
 * are left out.
 */
export function listActiveEarmarks(db: AppDatabase, ownerId: string) {
  return db
    .select({
      itemId: earmarks.itemId,
      accountId: earmarks.accountId,
      priority: earmarks.priority,
      reservedMinor: sql<number>`coalesce(sum(${earmarkEntries.amountMinor}), 0)`,
    })
    .from(earmarks)
    .leftJoin(
      earmarkEntries,
      and(eq(earmarkEntries.ownerId, earmarks.ownerId), eq(earmarkEntries.earmarkId, earmarks.id)),
    )
    .where(and(eq(earmarks.ownerId, ownerId), isNull(earmarks.endedAt)))
    .groupBy(earmarks.id)
    .orderBy(asc(earmarks.accountId), asc(earmarks.priority))
    .all();
}
