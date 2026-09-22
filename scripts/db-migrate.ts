import { mkdirSync } from "node:fs";
import path from "node:path";

import { databasePath, openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";

const file = databasePath();
mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
const handle = openDatabase(file);
try {
  migrateDatabase(handle.db);
  console.log(`Migrated ${file}`);
} finally {
  handle.close();
}
