import { openDatabase, type DatabaseHandle } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";

let template: Buffer | undefined;

/** A migrated database image, built once per test worker. */
function migratedTemplate(): Buffer {
  if (!template) {
    const handle = openDatabase(":memory:");
    migrateDatabase(handle);
    template = handle.sqlite.serialize();
    handle.close();
  }
  return template;
}

/**
 * A fresh, fully migrated, isolated in-memory database for one test.
 * Cloned from the template in microseconds; connection settings (foreign keys)
 * are re-applied by openDatabase because SQLite does not store them in the image.
 */
export function freshDatabase(): DatabaseHandle {
  return openDatabase(migratedTemplate());
}
