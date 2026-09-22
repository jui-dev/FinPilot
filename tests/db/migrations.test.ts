import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";

import { freshDatabase } from "../support/database";

let handle: DatabaseHandle;
afterEach(() => handle?.close());

const names = (h: DatabaseHandle, type: string) =>
  (
    h.sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all(type) as { name: string }[]
  ).map((r) => r.name);

describe("migrations", () => {
  it("create the F2 tables and ledger views", () => {
    handle = freshDatabase();
    expect(names(handle, "table")).toEqual(
      expect.arrayContaining(["accounts", "categories", "owners", "transactions"]),
    );
    expect(names(handle, "view")).toEqual(["account_entries", "active_transactions"]);
  });

  it("create the owner-consistency parent keys and the active opening-balance index", () => {
    handle = freshDatabase();
    expect(names(handle, "index")).toEqual(
      expect.arrayContaining([
        "ux_accounts_owner_id",
        "ux_categories_owner_id",
        "ux_transactions_owner_id",
        "ux_transactions_owner_sequence",
        "ux_transactions_active_opening_balance",
      ]),
    );
  });

  it("are idempotent: re-running applies nothing and changes nothing", () => {
    handle = freshDatabase();
    const before = handle.sqlite.serialize();
    migrateDatabase(handle.db);
    expect(Buffer.compare(handle.sqlite.serialize(), before)).toBe(0);
  });

  it("run with foreign keys enabled on every connection", () => {
    handle = freshDatabase();
    expect(handle.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("leave the foreign-key graph consistent", () => {
    handle = freshDatabase();
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
  });
});
