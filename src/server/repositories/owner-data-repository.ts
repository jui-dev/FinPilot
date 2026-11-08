import { eq, getTableColumns, getTableName, sql } from "drizzle-orm";

import type { AppDatabase, SyncDb } from "@/db/client";
import { OWNED_TABLES, OWNED_TABLES_CHILDREN_FIRST } from "@/db/owned-tables";
import { owners } from "@/db/schema";
import type { IdGenerator } from "@/domain/ids";
import { LedgerRuleError } from "@/server/errors";
import { IMMEDIATE } from "@/server/repositories/ledger-repository";
import { insertDefaultCategories } from "@/server/repositories/setup-repository";

/**
 * Whole-ledger operations on one owner's data: return it to a fresh start, or
 * replace it with another database's ledger (the staged demo). Each runs in a
 * single IMMEDIATE transaction with foreign keys enforced, touches only the
 * given owner's rows, and keeps the owner's id, so either one either happens
 * completely or not at all, and never reaches another owner.
 */

/**
 * Deletes every row the owner has in the owned tables, children first. The
 * owner row stays.
 *
 * Foreign keys stay enforced, but are checked when the transaction commits
 * rather than row by row: a refund references the expense it refunds in the
 * same table, and SQLite checks a self-reference as each row goes, so deleting
 * an expense before its refund would otherwise fail. The deferral ends with the
 * transaction; assertNoBrokenReferences checks everything before the commit.
 */
function deleteOwnerData(tx: SyncDb, ownerId: string): void {
  tx.run(sql`PRAGMA defer_foreign_keys = ON`);
  for (const table of OWNED_TABLES_CHILDREN_FIRST) {
    tx.run(sql`DELETE FROM ${table} WHERE owner_id = ${ownerId}`);
  }
}

/**
 * Empties every owned table and the owners: the whole database, whoever owns
 * it. Only npm run db:reset uses it (src/db/seed/reset.ts), to start over in a
 * file it cannot replace, including one with several owners.
 */
export function deleteEveryOwner(db: AppDatabase): void {
  db.transaction((tx) => {
    tx.run(sql`PRAGMA defer_foreign_keys = ON`);
    for (const table of OWNED_TABLES_CHILDREN_FIRST) tx.run(sql`DELETE FROM ${table}`);
    tx.run(sql`DELETE FROM ${owners}`);
    assertNoBrokenReferences(tx);
  }, IMMEDIATE);
}

/** Throws (rolling the transaction back) if any reference in the database is broken. */
function assertNoBrokenReferences(tx: SyncDb): void {
  const violations = tx.all(sql`PRAGMA foreign_key_check`);
  if (violations.length > 0) {
    throw new Error(`The operation would leave ${violations.length} broken reference(s).`);
  }
}

function requireOwner(tx: SyncDb, ownerId: string): void {
  const owner = tx.select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId)).get();
  if (!owner) throw new LedgerRuleError("owner_not_found", "The owner does not exist.");
}

/**
 * Returns the owner to a new installation's state: the owner (its id, name,
 * time zone and currency) and the default categories, and nothing else. Custom,
 * renamed or archived categories are replaced by the defaults, and the
 * recording sequence starts again at 1.
 */
export function resetOwnerToFreshStart(
  db: AppDatabase,
  ownerId: string,
  ids: IdGenerator,
  nowIso: string,
): void {
  db.transaction((tx) => {
    requireOwner(tx, ownerId);
    deleteOwnerData(tx, ownerId);
    insertDefaultCategories(tx, ownerId, ids, nowIso);
    tx.update(owners)
      .set({ nextTransactionSequence: 1, updatedAt: nowIso })
      .where(eq(owners.id, ownerId))
      .run();
    assertNoBrokenReferences(tx);
  }, IMMEDIATE);
}

type CopiedTable = (typeof OWNED_TABLES)[number] | typeof owners;

/** Rows per INSERT statement, well inside SQLite's bound-parameter limit. */
const INSERT_CHUNK = 100;

/** Raw rows of a table in insertion order, keyed by column name, values as stored. */
const rawRows = (db: SyncDb, table: CopiedTable) =>
  db.all<Record<string, unknown>>(sql`SELECT * FROM ${table} ORDER BY rowid`);

/**
 * Replaces the owner's ledger with the one in `source`, which must hold exactly
 * one owner (a staged database: see src/db/seed/demo-reset.ts). Every row is
 * copied as stored, with its owner rewritten to `ownerId`; the owner row keeps
 * its id and takes the source owner's name, currency, time zone and sequence.
 *
 * With `ownerId` null (an empty database: npm run db:reset) the source owner is
 * copied as it is. Returns the owner the ledger now belongs to.
 *
 * Reading the source happens before the transaction; inside it there is no
 * await, so nothing else on the connection can run between the delete and the
 * copy, or see one without the other.
 */
export function replaceOwnerData(
  db: AppDatabase,
  ownerId: string | null,
  source: AppDatabase,
): string {
  const sourceOwners = rawRows(source, owners);
  if (sourceOwners.length !== 1) throw new Error("The source must hold exactly one owner.");
  const sourceOwner = sourceOwners[0]!;
  const tables = OWNED_TABLES.map((table) => ({
    table,
    columns: Object.values(getTableColumns(table)).map((column) => column.name),
    rows: rawRows(source, table),
  }));

  return db.transaction((tx) => {
    let target: string;
    if (ownerId === null) {
      target = String(sourceOwner.id);
      insertRows(tx, owners, Object.keys(sourceOwner), [sourceOwner]);
    } else {
      target = ownerId;
      requireOwner(tx, target);
      deleteOwnerData(tx, target);
      tx.update(owners)
        .set({
          name: String(sourceOwner.name),
          baseCurrency: String(sourceOwner.base_currency),
          timeZone: String(sourceOwner.time_zone),
          nextTransactionSequence: Number(sourceOwner.next_transaction_sequence),
          updatedAt: String(sourceOwner.updated_at),
        })
        .where(eq(owners.id, target))
        .run();
    }
    for (const { table, columns, rows } of tables) {
      insertRows(
        tx,
        table,
        columns,
        rows.map((row) => ({ ...row, owner_id: target })),
      );
    }
    assertNoBrokenReferences(tx);
    return target;
  }, IMMEDIATE);
}

/** One owner's whole ledger, as stored: what a backup holds. */
export interface OwnerDataSnapshot {
  /** How many schema migrations the database has applied: the shape the rows are in. */
  readonly appliedMigrations: number;
  readonly owner: Record<string, unknown>;
  /** Every owned table by its name, parents first, rows in insertion order, deleted ones included. */
  readonly tables: ReadonlyArray<{
    readonly name: string;
    readonly rows: Record<string, unknown>[];
  }>;
}

/**
 * Reads the owner's ledger, every owned table as stored, in one read
 * transaction so the tables agree with each other even while something else
 * writes. Soft-deleted rows are included: a backup keeps what Undo can restore.
 */
export function readOwnerData(db: AppDatabase, ownerId: string): OwnerDataSnapshot {
  return db.transaction((tx) => {
    const owner = tx.all<Record<string, unknown>>(
      sql`SELECT * FROM ${owners} WHERE id = ${ownerId}`,
    )[0];
    if (!owner) throw new LedgerRuleError("owner_not_found", "The owner does not exist.");
    const migrations = tx.all<{ n: number }>(sql`SELECT count(*) AS n FROM __drizzle_migrations`);
    return {
      appliedMigrations: Number(migrations[0]?.n ?? 0),
      owner,
      tables: OWNED_TABLES.map((table) => ({
        name: getTableName(table),
        rows: tx.all<Record<string, unknown>>(
          sql`SELECT * FROM ${table} WHERE owner_id = ${ownerId} ORDER BY rowid`,
        ),
      })),
    };
  });
}

function insertRows(
  tx: SyncDb,
  table: CopiedTable,
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): void {
  const names = sql.join(
    columns.map((c) => sql.identifier(c)),
    sql`, `,
  );
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    const values = rows.slice(start, start + INSERT_CHUNK).map(
      (row) =>
        sql`(${sql.join(
          columns.map((c) => sql`${row[c] ?? null}`),
          sql`, `,
        )})`,
    );
    tx.run(sql`INSERT INTO ${table} (${names}) VALUES ${sql.join(values, sql`, `)}`);
  }
}
