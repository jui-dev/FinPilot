import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { OWNED_TABLES } from "@/db/owned-tables";
import { resetToDemo } from "@/db/seed/demo-reset";
import { seedDemo } from "@/db/seed/demo-seed";
import { calendarDateFromIso } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import { fromMajor } from "@/domain/money";
import { getTableName } from "drizzle-orm";
import { recordEntry } from "@/server/commands";
import { writeContext, type ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { dismiss } from "@/server/repositories/signal-dismissal-repository";
import {
  createAccount,
  createCategory,
  createOwner,
  getAccounts,
  getCategories,
} from "@/server/services/setup-service";

import { freshDatabase } from "../support/database";

/**
 * Resetting an owner's data to the demo: the shared path npm run db:reset and
 * the end-to-end specs take. Every comparison is over a
 * projection of the whole ledger — every column of every owned row, with ids
 * replaced by their order of first appearance — so "the same data" means the
 * same rows and the same references between them, whatever ids they were given.
 */

const TODAY = calendarDateFromIso("2026-09-22");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let handles: DatabaseHandle[] = [];
afterAll(() => {
  for (const h of handles) h.close();
  handles = [];
});

function open(): DatabaseHandle {
  const handle = freshDatabase();
  handles.push(handle);
  return handle;
}

function context(handle: DatabaseHandle, ownerId: string): ServiceContext {
  let tick = Date.UTC(2026, 8, 22, 6, 0, 0);
  return {
    db: handle.db,
    ownerId,
    clock: fixedClock(TODAY),
    ids: uuidV7Generator,
    now: () => new Date((tick += 1000)),
  };
}

/** The owner and every row it owns, in insertion order, with ids normalised. */
function projection(handle: DatabaseHandle, ownerId: string) {
  const labels = new Map<string, string>();
  const label = (value: unknown) => {
    if (typeof value !== "string" || !UUID.test(value)) return value;
    if (!labels.has(value)) labels.set(value, `#${labels.size}`);
    return labels.get(value);
  };
  const normalise = (row: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(row).map(([k, v]) => [k, label(v)]));

  const owner = handle.sqlite.prepare("SELECT * FROM owners WHERE id = ?").get(ownerId) as Record<
    string,
    unknown
  >;
  const tables = Object.fromEntries(
    OWNED_TABLES.map((table) => {
      const name = getTableName(table);
      const rows = handle.sqlite
        .prepare(`SELECT * FROM "${name}" WHERE owner_id = ? ORDER BY rowid`)
        .all(ownerId) as Record<string, unknown>[];
      return [name, rows.map(normalise)];
    }),
  );
  // created_at / updated_at of the owner row itself are not part of its ledger.
  const ownerFields = normalise(owner);
  delete ownerFields.created_at;
  delete ownerFields.updated_at;
  return { owner: ownerFields, tables };
}

const counts = (p: ReturnType<typeof projection>) =>
  Object.fromEntries(Object.entries(p.tables).map(([name, rows]) => [name, rows.length]));

const ownerCount = (handle: DatabaseHandle) =>
  (handle.sqlite.prepare("SELECT count(*) AS n FROM owners").get() as { n: number }).n;

/** Every message in an error's cause chain (Drizzle wraps SQLite's). */
function messages(error: unknown): string {
  const parts: string[] = [];
  for (let e = error; e instanceof Error; e = e.cause) parts.push(e.message);
  return parts.join(" <- ");
}

const brokenReferences = (handle: DatabaseHandle) => handle.sqlite.pragma("foreign_key_check");

/** A database holding one owner with a little of their own data (not the demo). */
async function ownLedger(name = "Me") {
  const handle = open();
  const owner = await createOwner(
    { db: handle.db, ids: uuidV7Generator, now: () => new Date() },
    { name, baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
  );
  if (!owner.ok) throw new Error("could not create the owner");
  const ctx = context(handle, owner.value);
  const account = await createAccount(ctx, {
    name: "My wallet",
    type: "cash",
    openedOn: calendarDateFromIso("2026-09-01"),
    openingBalance: fromMajor(500),
  });
  const category = await createCategory(ctx, { name: "Pets", kind: "expense" });
  if (!account.ok || !category.ok) throw new Error("could not build the ledger");
  const spent = await recordEntry(ctx, {
    type: "expense",
    amount: "120",
    accountId: account.value,
    categoryId: category.value,
    occurredOn: "2026-09-20",
    description: "Cat food",
  });
  if (!spent.ok) throw new Error("could not record the expense");
  dismiss(handle.db, writeContext(ctx), "spending_up:2026-09");
  return { handle, ctx, ownerId: owner.value };
}

/** The reference demo: what seedDemo itself writes into an empty database. */
let reference: ReturnType<typeof projection>;
beforeAll(async () => {
  const handle = open();
  const seeded = await seedDemo(handle, TODAY);
  reference = projection(handle, seeded.ownerId);
});

describe("OWNED_TABLES", () => {
  it("lists every table the schema has, apart from the owners", () => {
    const handle = open();
    const tables = (
      handle.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name <> 'owners'",
        )
        .all() as { name: string }[]
    ).map((r) => r.name);
    expect(OWNED_TABLES.map((t) => getTableName(t)).sort()).toEqual(tables.sort());
  });
});

describe("reset to demo", () => {
  it("writes exactly the demo seedDemo writes, into the existing owner, keeping its id", async () => {
    const { handle, ownerId } = await ownLedger();
    const result = await resetToDemo(handle.db, ownerId, TODAY);

    expect(result.ownerId).toBe(ownerId);
    expect(ownerCount(handle)).toBe(1);
    expect(projection(handle, ownerId)).toEqual(reference);
    expect(brokenReferences(handle)).toEqual([]);
  });

  it("writes the same demo into an empty database (the npm run db:reset path)", async () => {
    const handle = open();
    const result = await resetToDemo(handle.db, null, TODAY);
    expect(ownerCount(handle)).toBe(1);
    expect(projection(handle, result.ownerId)).toEqual(reference);
  });

  it("is repeatable: a second and third reset change nothing and duplicate nothing", async () => {
    const { handle, ownerId } = await ownLedger();
    await resetToDemo(handle.db, ownerId, TODAY);
    const first = projection(handle, ownerId);
    await resetToDemo(handle.db, ownerId, TODAY);
    await resetToDemo(handle.db, ownerId, TODAY);

    expect(projection(handle, ownerId)).toEqual(first);
    expect(counts(projection(handle, ownerId))).toEqual(counts(reference));
    expect(ownerCount(handle)).toBe(1);
    expect(brokenReferences(handle)).toEqual([]);
  });

  it("removes what the person had recorded", async () => {
    const { handle, ctx, ownerId } = await ownLedger();
    await resetToDemo(handle.db, ownerId, TODAY);
    expect((await getAccounts(ctx)).map((a) => a.name)).not.toContain("My wallet");
    expect((await getCategories(ctx)).map((c) => c.name)).not.toContain("Pets");
  });
});

describe("owner scoping", () => {
  it("never touches another owner's data", async () => {
    const { handle, ownerId: mine } = await ownLedger("Me");
    // A second owner, with their own account, entry, category and dismissal.
    const other = await createOwner(
      { db: handle.db, ids: uuidV7Generator, now: () => new Date() },
      { name: "Someone else", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
    );
    if (!other.ok) throw new Error("could not create the second owner");
    const theirs = context(handle, other.value);
    const account = await createAccount(theirs, {
      name: "Their bank",
      type: "bank",
      openedOn: calendarDateFromIso("2026-08-01"),
      openingBalance: fromMajor(9_000),
    });
    if (!account.ok) throw new Error("could not open their account");
    dismiss(handle.db, writeContext(theirs), "spending_up:2026-08");
    const untouched = projection(handle, other.value);

    await resetToDemo(handle.db, mine, TODAY);
    expect(projection(handle, other.value)).toEqual(untouched);

    expect(ownerCount(handle)).toBe(2);
    expect(brokenReferences(handle)).toEqual([]);
  });
});

describe("atomicity", () => {
  it("rolls a reset back completely when the swap fails part-way", async () => {
    const { handle, ownerId } = await ownLedger();
    const before = projection(handle, ownerId);
    // Fails the copy after the delete and most of the inserts have run.
    handle.sqlite.exec(
      "CREATE TRIGGER fail_copy BEFORE INSERT ON earmark_entries BEGIN SELECT RAISE(ABORT, 'forced failure'); END",
    );

    const failure = await resetToDemo(handle.db, ownerId, TODAY).catch((e: unknown) => e);
    expect(messages(failure)).toMatch(/forced failure/);

    expect(projection(handle, ownerId)).toEqual(before);
    expect(handle.sqlite.inTransaction).toBe(false);
    expect(brokenReferences(handle)).toEqual([]);
  });
});
