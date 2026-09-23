import type { DatabaseHandle } from "@/db/client";

/**
 * Empties every owned table, leaving the schema (and the migration history) in
 * place. Used when the database file cannot be replaced because another
 * process — a dev server, an end-to-end run — is holding it open.
 */
export function clearAllData(handle: DatabaseHandle): void {
  handle.sqlite.pragma("foreign_keys = OFF");
  try {
    handle.sqlite.exec(
      "BEGIN IMMEDIATE; DELETE FROM transactions; DELETE FROM categories; DELETE FROM accounts; DELETE FROM owners; COMMIT;",
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
