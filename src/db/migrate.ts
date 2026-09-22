import path from "node:path";

import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { AppDatabase } from "./client";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "src/db/migrations");

/** Applies all pending migrations. Forward-only; applied migrations are never edited. */
export function migrateDatabase(db: AppDatabase): void {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
