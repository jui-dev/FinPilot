import { sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";

/**
 * Reconciliation read models.
 *
 * The status of a checkpoint is never stored: it is this comparison, made
 * against the ledger as it stands right now (docs/domain-model.md §12).
 */

export interface CurrentCheckpointRow {
  readonly accountId: string;
  readonly asOf: string;
  readonly statedBalanceMinor: number;
  /** Σ account_entries for that account up to and including as_of, today. */
  readonly recordedBalanceMinor: number;
  /** The checkpoint's correcting adjustment while it is active; null when none was needed. */
  readonly adjustmentId: string | null;
  /** That adjustment's signed amount; null exactly when adjustmentId is. */
  readonly adjustmentAmountMinor: number | null;
}

/**
 * Each account's *current* checkpoint — the latest by (as_of, created_at) —
 * together with the balance the ledger now derives for that date.
 *
 * An account may be verified more than once on one day, so `created_at` breaks
 * the tie; ids are opaque and are never used as a business ordering
 * (docs/domain-model.md §2). Accounts that were never verified are simply
 * absent from the result.
 *
 * One statement for the whole page: `row_number()` picks the current checkpoint
 * and a correlated sum reads its balance. Standard SQL — it ports to PostgreSQL
 * unchanged, and the sum goes through `account_entries`, so soft deletes and
 * mirrored transfer legs are already accounted for.
 *
 * The checkpoint's adjustment is read through `active_transactions`, so a
 * soft-deleted adjustment reads as none. (Deleting a checkpoint's adjustment
 * on its own is refused, so in practice it is always active.)
 */
export function currentCheckpoints(db: AppDatabase, ownerId: string): CurrentCheckpointRow[] {
  const rows = db.all<{
    account_id: string;
    as_of: string;
    stated_balance_minor: number;
    recorded_balance_minor: number;
    adjustment_id: string | null;
    adjustment_amount_minor: number | null;
  }>(sql`
    WITH ranked AS (
      SELECT
        c.account_id,
        c.as_of,
        c.stated_balance_minor,
        c.adjustment_id,
        row_number() OVER (
          PARTITION BY c.account_id
          ORDER BY c.as_of DESC, c.created_at DESC
        ) AS rank
      FROM reconciliation_checkpoints c
      WHERE c.owner_id = ${ownerId}
    )
    SELECT
      r.account_id,
      r.as_of,
      r.stated_balance_minor,
      (
        SELECT coalesce(sum(e.delta_minor), 0)
        FROM account_entries e
        WHERE e.owner_id = ${ownerId}
          AND e.account_id = r.account_id
          AND e.occurred_on <= r.as_of
      ) AS recorded_balance_minor,
      a.id AS adjustment_id,
      a.amount_minor AS adjustment_amount_minor
    FROM ranked r
    LEFT JOIN active_transactions a
      ON a.owner_id = ${ownerId} AND a.id = r.adjustment_id
    WHERE r.rank = 1
  `);

  return rows.map((r) => ({
    accountId: r.account_id,
    asOf: r.as_of,
    statedBalanceMinor: r.stated_balance_minor,
    recordedBalanceMinor: r.recorded_balance_minor,
    adjustmentId: r.adjustment_id,
    adjustmentAmountMinor: r.adjustment_amount_minor,
  }));
}
