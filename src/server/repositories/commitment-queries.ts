import { and, asc, eq } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { commitmentOccurrences, commitments, transactions } from "@/db/schema";

/**
 * Commitment read models. An occurrence's linked transaction is read from the
 * base `transactions` table, not the active view: whether it was deleted, and
 * what type it is now, is exactly what its derived state depends on.
 */

export function listCommitments(db: AppDatabase, ownerId: string) {
  return db
    .select()
    .from(commitments)
    .where(eq(commitments.ownerId, ownerId))
    .orderBy(asc(commitments.name), asc(commitments.createdAt))
    .all();
}

/** Every materialised occurrence with its commitment and linked transaction, in due order. */
export function listOccurrences(db: AppDatabase, ownerId: string) {
  return db
    .select({
      id: commitmentOccurrences.id,
      commitmentId: commitmentOccurrences.commitmentId,
      name: commitments.name,
      categoryId: commitments.categoryId,
      expectedAccountId: commitments.expectedAccountId,
      dueOn: commitmentOccurrences.dueOn,
      expectedAmountMinor: commitmentOccurrences.expectedAmountMinor,
      transactionId: commitmentOccurrences.transactionId,
      skippedAt: commitmentOccurrences.skippedAt,
      linkType: transactions.type,
      linkDeletedAt: transactions.deletedAt,
      linkAmountMinor: transactions.amountMinor,
      linkOccurredOn: transactions.occurredOn,
      linkAccountId: transactions.accountId,
    })
    .from(commitmentOccurrences)
    .innerJoin(
      commitments,
      and(
        eq(commitments.ownerId, commitmentOccurrences.ownerId),
        eq(commitments.id, commitmentOccurrences.commitmentId),
      ),
    )
    .leftJoin(
      transactions,
      and(
        eq(transactions.ownerId, commitmentOccurrences.ownerId),
        eq(transactions.id, commitmentOccurrences.transactionId),
      ),
    )
    .where(eq(commitmentOccurrences.ownerId, ownerId))
    .orderBy(asc(commitmentOccurrences.dueOn), asc(commitments.name))
    .all();
}
