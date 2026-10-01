import type { AppDatabase } from "@/db/client";
import { openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import type { CalendarDate } from "@/domain/calendar-date";
import { replaceOwnerData } from "@/server/repositories/owner-data-repository";

import { seedDemo, type DemoSeedOptions, type DemoSeedResult } from "./demo-seed";

/**
 * The one way FinPilot's data becomes the demo: npm run db:reset, Settings'
 * "Reset to demo data" and the end-to-end specs all come through here.
 *
 * The demo is seeded first into a private in-memory database — seedDemo makes
 * hundreds of separate command calls, so it cannot run inside one transaction
 * on a connection the app is serving from — and then swapped in with
 * replaceOwnerData, in a single transaction. A failure while seeding leaves the
 * real database untouched; a failure in the swap rolls it back.
 *
 * `ownerId` is the owner whose data is replaced (its id is kept), or null for a
 * database with no owner yet, which then gets the demo's own.
 */
export async function resetToDemo(
  db: AppDatabase,
  ownerId: string | null,
  today: CalendarDate,
  options?: DemoSeedOptions,
): Promise<DemoSeedResult> {
  const staging = openDatabase(":memory:");
  try {
    migrateDatabase(staging);
    const result = await seedDemo(staging, today, options);
    return { ...result, ownerId: replaceOwnerData(db, ownerId, staging.db) };
  } finally {
    staging.close();
  }
}
