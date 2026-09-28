import { and, eq } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { signalDismissals } from "@/db/schema";
import type { WriteContext } from "@/server/context";
import { IMMEDIATE } from "@/server/repositories/ledger-repository";

/**
 * Attention dismissals (docs/domain-model.md §11): the signal keys an owner
 * has hidden. Which keys may be hidden is decided by the service, against the
 * signals currently derived for that owner; this layer only stores the fact,
 * scoped to the owner, once per key.
 */

/** The keys the owner has hidden. */
export function dismissedKeys(db: AppDatabase, ownerId: string): Set<string> {
  return new Set(
    db
      .select({ key: signalDismissals.signalKey })
      .from(signalDismissals)
      .where(eq(signalDismissals.ownerId, ownerId))
      .all()
      .map((r) => r.key),
  );
}

/** Hides a signal for its episode. Hiding an already-hidden key changes nothing. */
export function dismiss(db: AppDatabase, ctx: WriteContext, key: string): void {
  db.transaction((tx) => {
    tx.insert(signalDismissals)
      .values({ id: ctx.ids.next(), ownerId: ctx.ownerId, signalKey: key, dismissedAt: ctx.nowIso })
      .onConflictDoNothing({ target: [signalDismissals.ownerId, signalDismissals.signalKey] })
      .run();
  }, IMMEDIATE);
}

/** Undoes the owner's dismissal of one key; nothing happens when there is none. */
export function undismiss(db: AppDatabase, ctx: WriteContext, key: string): void {
  db.transaction((tx) => {
    tx.delete(signalDismissals)
      .where(and(eq(signalDismissals.ownerId, ctx.ownerId), eq(signalDismissals.signalKey, key)))
      .run();
  }, IMMEDIATE);
}
