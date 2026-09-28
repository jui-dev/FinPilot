/**
 * npm run db:reset — replaces the local database with a freshly migrated one
 * holding the demo ledger (dated relative to today in Asia/Dhaka).
 * Honours DATABASE_PATH, like the app.
 *
 * The file is replaced outright when possible. If another process is holding
 * it (a dev server, an end-to-end run), the data is cleared in place instead,
 * so the demo can be reset without stopping anything.
 *
 * `--ledger-only` leaves out the demo situations (commitments, set-aside
 * money, verifications): the plain ledger the end-to-end suite builds on.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { databasePath, openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { DEMO_TIME_ZONE, seedDemo } from "@/db/seed/demo-seed";
import { clearAllData } from "@/db/seed/reset";
import { formatMoney } from "@/domain/money";
import { systemClock } from "@/server/clock";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getAccountBalances } from "@/server/services/ledger-service";

/** Removes the database file, or reports that it is in use. */
function removeFile(file: string): boolean {
  let removed = false;
  for (const part of [file, `${file}-wal`, `${file}-shm`]) {
    if (!existsSync(part)) continue;
    try {
      rmSync(part);
      removed = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EBUSY" || code === "EPERM") return false;
      throw error;
    }
  }
  return removed || !existsSync(file);
}

async function main() {
  const file = path.resolve(databasePath());
  mkdirSync(path.dirname(file), { recursive: true });
  const replaced = removeFile(file);

  const handle = openDatabase(file);
  try {
    migrateDatabase(handle);
    if (!replaced) clearAllData(handle);
    const today = systemClock(DEMO_TIME_ZONE).today();
    const result = await seedDemo(handle, today, {
      situations: !process.argv.includes("--ledger-only"),
    });
    const how = replaced ? "Reset" : "Reset in place (the file was in use)";
    console.log(
      `${how} ${databasePath()}: ${result.transactions} transactions, ${result.from} → ${result.to}.`,
    );
    const ctx: ServiceContext = {
      db: handle.db,
      ownerId: result.ownerId,
      clock: systemClock(DEMO_TIME_ZONE),
      ids: uuidV7Generator,
      now: () => new Date(),
    };
    for (const b of await getAccountBalances(ctx)) {
      console.log(`  ${b.name.padEnd(10)} ${formatMoney(b.balance).padStart(12)}`);
    }
  } finally {
    handle.close();
  }
}

void main();
