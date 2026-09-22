import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type DatabaseHandle } from "@/db/client";
import { getCurrentOwner } from "@/server/owner";
import { uuidV7Generator } from "@/server/ids";
import { createOwner } from "@/server/services/setup-service";

import { freshDatabase } from "../support/database";

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

const addOwner = (h: DatabaseHandle, name: string) =>
  createOwner(
    { db: h.db, ids: uuidV7Generator, now: () => new Date(Date.UTC(2026, 8, 22)) },
    { name, baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
  );

describe("getCurrentOwner", () => {
  it("explains an unmigrated or empty database instead of guessing", async () => {
    handle = openDatabase(":memory:");
    expect(getCurrentOwner(handle)).toEqual({ ok: false, reason: "not_migrated" });
    handle.close();
    handle = freshDatabase();
    expect(getCurrentOwner(handle)).toEqual({ ok: false, reason: "no_owner" });
  });

  it("resolves the single V1 owner, and refuses to pick between several", async () => {
    handle = freshDatabase();
    await addOwner(handle, "Demo");
    expect(getCurrentOwner(handle)).toMatchObject({
      ok: true,
      owner: { name: "Demo", timeZone: "Asia/Dhaka", baseCurrency: "BDT" },
    });
    await addOwner(handle, "Second");
    expect(getCurrentOwner(handle)).toEqual({ ok: false, reason: "multiple_owners" });
  });
});
