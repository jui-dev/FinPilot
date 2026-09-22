/**
 * npm run db:reset — replaces the local database with a freshly migrated one
 * holding the demo ledger (dated relative to today in Asia/Dhaka).
 * Honours DATABASE_PATH, like the app.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

import { databasePath, openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { DEMO_TIME_ZONE, seedDemo } from "@/db/seed/demo-seed";
import { formatMoney } from "@/domain/money";
import { systemClock } from "@/server/clock";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getAccountBalances } from "@/server/services/ledger-service";

async function main() {
  const file = path.resolve(databasePath());
  mkdirSync(path.dirname(file), { recursive: true });

  for (const part of [file, `${file}-wal`, `${file}-shm`]) {
    if (!existsSync(part)) continue;
    try {
      rmSync(part);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EBUSY" || code === "EPERM") {
        console.error(`${part} is in use. Stop the dev server (or anything holding it) and retry.`);
        process.exit(1);
      }
      throw error;
    }
  }

  const handle = openDatabase(file);
  try {
    migrateDatabase(handle);
    const today = systemClock(DEMO_TIME_ZONE).today();
    const result = await seedDemo(handle, today);
    console.log(
      `Reset ${databasePath()}: ${result.transactions} transactions, ${result.from} → ${result.to}.`,
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
