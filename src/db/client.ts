import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

export interface DatabaseHandle {
  readonly db: AppDatabase;
  /** The raw better-sqlite3 connection. Only src/db/ touches it directly. */
  readonly sqlite: Database.Database;
  close(): void;
}

/**
 * The single place that opens a SQLite connection.
 *
 * `source` is a file path, ":memory:", or a serialised database image (Buffer),
 * which the test harness uses to clone a migrated template.
 *
 * Connection-level settings are applied every time, because SQLite does not
 * persist them in the database file. Foreign keys are OFF by default in stock
 * SQLite; better-sqlite3's bundled build happens to default them ON, but
 * FinPilot sets them explicitly so correctness never depends on a build flag
 * (or on the driver used after a PostgreSQL/driver migration).
 */
export function openDatabase(source: string | Buffer): DatabaseHandle {
  const sqlite = new Database(source);
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  if (typeof source === "string" && source !== ":memory:") {
    sqlite.pragma("journal_mode = WAL");
  }
  const db = drizzle(sqlite, { schema });
  return { db, sqlite, close: () => sqlite.close() };
}

export const DEFAULT_DATABASE_PATH = "./data/finpilot.sqlite";

export const databasePath = (): string => process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH;
