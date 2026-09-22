import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { DatabaseHandle } from "./client";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "src/db/migrations");

/** True when the database has been migrated (the ledger tables exist). */
export function hasLedgerSchema(handle: DatabaseHandle): boolean {
  const row = handle.sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'owners'")
    .get();
  return row !== undefined;
}

/**
 * Applies all pending migrations. Forward-only; applied migrations are never edited.
 *
 * SQLite can only change a table's constraints by rebuilding the table, which
 * requires foreign-key enforcement to be OFF — and `PRAGMA foreign_keys` is a
 * no-op inside a transaction, while Drizzle runs migrations inside one. So,
 * following SQLite's documented procedure, enforcement is switched off here,
 * outside the transaction, and back on afterwards. Referential integrity is
 * still guaranteed: rebuild migrations end with an in-transaction guard that
 * aborts on any foreign-key violation, and this function re-checks the whole
 * database afterwards and refuses to continue if anything is broken.
 */
export function migrateDatabase(handle: DatabaseHandle, folder = MIGRATIONS_FOLDER): void {
  handle.sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(handle.db, { migrationsFolder: folder });
  } finally {
    handle.sqlite.pragma("foreign_keys = ON");
  }
  const violations = handle.sqlite.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(`Migration left ${violations.length} foreign-key violation(s).`);
  }
}
