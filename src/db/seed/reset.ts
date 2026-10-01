import type { DatabaseHandle } from "@/db/client";
import { deleteEveryOwner } from "@/server/repositories/owner-data-repository";

/**
 * Empties every owned table and the owners, leaving the schema (and the
 * migration history) in place. npm run db:reset uses it when the database file
 * cannot be replaced because another process — a dev server, an end-to-end run
 * — is holding it open, and it also repairs a database with several owners.
 *
 * The tables come from OWNED_TABLES (src/db/owned-tables.ts), children first,
 * in one transaction with foreign keys on and checked before the commit, so a
 * forgotten table rolls everything back rather than orphaning its rows.
 */
export function clearAllData(handle: DatabaseHandle): void {
  deleteEveryOwner(handle.db);
}
