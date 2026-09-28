import type { DatabaseHandle } from "@/db/client";

/**
 * Empties every owned table, leaving the schema (and the migration history) in
 * place. Used when the database file cannot be replaced because another
 * process — a dev server, an end-to-end run — is holding it open.
 *
 * **Every owned table must appear below, children before their parents.** A
 * table left out is not emptied, and its rows are then orphaned: the
 * foreign-key check at the end fails, and the half-cleared file stays broken
 * for every later run. Foreign keys are off during the deletes, so the order is
 * for the check that follows, not for the deletes themselves.
 */
export function clearAllData(handle: DatabaseHandle): void {
  handle.sqlite.pragma("foreign_keys = OFF");
  try {
    handle.sqlite.exec(
      "BEGIN IMMEDIATE; DELETE FROM signal_dismissals; DELETE FROM earmark_entries; DELETE FROM earmarks; DELETE FROM protected_money_items; DELETE FROM commitment_occurrences; DELETE FROM commitments; DELETE FROM reconciliation_checkpoints; DELETE FROM transactions; DELETE FROM categories; DELETE FROM accounts; DELETE FROM owners; COMMIT;",
    );
  } catch (error) {
    handle.sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    handle.sqlite.pragma("foreign_keys = ON");
  }
  const violations = handle.sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) throw new Error("Clearing the database left broken references.");
}
