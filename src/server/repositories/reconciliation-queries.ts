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
 */
export function currentCheckpoints(db: AppDatabase, ownerId: string): CurrentCheckpointRow[] {
  const rows = db.all<{
    account_id: string;
    as_of: string;
    stated_balance_minor: number;
    recorded_balance_minor: number;
  }>(sql`
    WITH ranked AS (
      SELECT
        c.account_id,
        c.as_of,
        c.stated_balance_minor,
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
      ) AS recorded_balance_minor
    FROM ranked r
    WHERE r.rank = 1
  `);

  return rows.map((r) => ({
    accountId: r.account_id,
    asOf: r.as_of,
    statedBalanceMinor: r.stated_balance_minor,
    recordedBalanceMinor: r.recorded_balance_minor,
  }));
}
