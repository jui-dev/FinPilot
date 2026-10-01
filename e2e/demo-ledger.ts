import path from "node:path";

import { openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { resetToDemo } from "@/db/seed/demo-reset";
import { DEMO_TIME_ZONE } from "@/db/seed/demo-seed";
import { clearAllData } from "@/db/seed/reset";
import { systemClock } from "@/server/clock";

import { E2E_DATABASE_PATH } from "../playwright.config";

/**
 * Restores the plain demo ledger (no demo situations, as in global setup) in
 * the end-to-end database while the server holds it, as npm run db:reset does:
 * whatever earlier specs left behind is cleared, and the demo is written by the
 * same resetToDemo as the CLI and Settings.
 */
export async function resetDemoInPlace() {
  const handle = openDatabase(path.resolve(E2E_DATABASE_PATH));
  try {
    migrateDatabase(handle);
    clearAllData(handle);
    await resetToDemo(handle.db, null, systemClock(DEMO_TIME_ZONE).today(), { situations: false });
  } finally {
    handle.close();
  }
}
