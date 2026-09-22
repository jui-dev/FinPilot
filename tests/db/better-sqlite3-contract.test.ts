import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Runtime contract for the raw better-sqlite3 API FinPilot relies on.
 *
 * better-sqlite3 13 ships no type definitions; @types/better-sqlite3 is 9.6.0.
 * Rather than trusting those types, this test proves the exact runtime
 * behaviour we depend on, so any drift fails here instead of lying silently.
 */
const dir = mkdtempSync(path.join(tmpdir(), "finpilot-contract-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("better-sqlite3 runtime contract", () => {
  it("opens file and memory databases and runs statements", () => {
    const file = new Database(path.join(dir, "contract.sqlite"));
    expect(file.pragma("journal_mode = WAL", { simple: true })).toBe("wal");
    file.close();

    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER NOT NULL)");
    expect(db.prepare("INSERT INTO t VALUES (?)").run(42).changes).toBe(1);
    expect(db.prepare("SELECT a FROM t").get()).toEqual({ a: 42 });
    expect(db.prepare("SELECT a FROM t").all()).toEqual([{ a: 42 }]);
    expect(db.prepare("UPDATE t SET a = a + 1 RETURNING a").get()).toEqual({ a: 43 });
    db.close();
  });

  it("switches foreign-key enforcement per connection", () => {
    // Stock SQLite defaults to OFF; better-sqlite3's bundled build happens to
    // default to ON. FinPilot never relies on either default: openDatabase sets it.
    const db = new Database(":memory:");
    db.pragma("foreign_keys = OFF");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(0);
    db.pragma("foreign_keys = ON");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    db.close();
  });

  it("serialises a database and clones it from the image", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER); INSERT INTO t VALUES (1)");
    const clone = new Database(db.serialize());
    clone.exec("INSERT INTO t VALUES (2)");
    expect(clone.prepare("SELECT count(*) AS n FROM t").get()).toEqual({ n: 2 });
    expect(db.prepare("SELECT count(*) AS n FROM t").get()).toEqual({ n: 1 });
  });

  it("rolls back an immediate transaction that throws", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER)");
    const write = db.transaction(() => {
      db.prepare("INSERT INTO t VALUES (1)").run();
      throw new Error("abort");
    });
    expect(() => write.immediate()).toThrow("abort");
    expect(db.prepare("SELECT count(*) AS n FROM t").get()).toEqual({ n: 0 });
    expect(db.inTransaction).toBe(false);
  });

  it("refuses async transaction functions (the synchronous-transaction rule)", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER)");
    const write = db.transaction(async () => {
      db.prepare("INSERT INTO t VALUES (1)").run();
    });
    expect(() => write()).toThrow(/promise/i);
    expect(db.prepare("SELECT count(*) AS n FROM t").get()).toEqual({ n: 0 });
  });

  it("reports named CHECK constraints and constraint error codes", () => {
    const db = new Database(":memory:");
    db.exec("CREATE TABLE t (a INTEGER, CONSTRAINT ck_positive CHECK (a > 0))");
    try {
      db.prepare("INSERT INTO t VALUES (-1)").run();
      expect.unreachable();
    } catch (error) {
      expect((error as { code: string }).code).toBe("SQLITE_CONSTRAINT_CHECK");
      expect((error as Error).message).toContain("ck_positive");
    }
  });
});
