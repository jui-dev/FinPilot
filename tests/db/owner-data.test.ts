import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { OWNED_TABLES } from "@/db/owned-tables";
import { resetToDemo } from "@/db/seed/demo-reset";
import { seedDemo } from "@/db/seed/demo-seed";
import { calendarDateFromIso } from "@/domain/calendar-date";
import { CLEAR_CONFIRMATION } from "@/domain/clear-confirmation";
import { fixedClock } from "@/domain/clock";
import { DEFAULT_CATEGORIES } from "@/domain/ledger/categories";
import { fromMajor, ZERO } from "@/domain/money";
import { getTableName } from "drizzle-orm";
import { clearAllData, recordEntry, resetDemoData } from "@/server/commands";
import { writeContext, type ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getCurrentOwner } from "@/server/owner";
import { dismiss } from "@/server/repositories/signal-dismissal-repository";
import { getActivity } from "@/server/services/activity-service";
import { getMonthlyCashFlow, getTrends } from "@/server/services/analysis-service";
import { getAttention } from "@/server/services/attention-service";
import { getAvailable } from "@/server/services/available-service";
import { getMonthCalendar } from "@/server/services/calendar-service";
import { getCommitments, getOccurrences } from "@/server/services/commitment-service";
import { getAccountBalances, getPosition } from "@/server/services/ledger-service";
import { getItems } from "@/server/services/protected-money-service";
import {
  createAccount,
  createCategory,
  createOwner,
  getAccounts,
  getCategories,
} from "@/server/services/setup-service";

import { freshDatabase } from "../support/database";

/**
 * Settings' Data & demo operations (reset to the demo, clear to a fresh start)
 * and the shared path npm run db:reset takes. Every comparison is over a
 * projection of the whole ledger — every column of every owned row, with ids
 * replaced by their order of first appearance — so "the same data" means the
 * same rows and the same references between them, whatever ids they were given.
 */

// Nearly every test seeds a full year of demo (about a second each, several in
// some tests), so the default 5s is too tight when the whole suite runs at once.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

const TODAY = calendarDateFromIso("2026-09-22");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let handles: DatabaseHandle[] = [];
afterAll(() => {
  for (const h of handles) h.close();
  handles = [];
});
afterEach(() => vi.unstubAllEnvs());

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

describe("clear all data", () => {
  async function clearedDemo() {
    const handle = open();
    const { ownerId } = await resetToDemo(handle.db, null, TODAY);
    const ctx = context(handle, ownerId);
    const before = handle.sqlite.prepare("SELECT * FROM owners").get() as Record<string, unknown>;
    const result = await clearAllDataEnabled(ctx);
    expect(result.ok).toBe(true);
    return { handle, ctx, ownerId, before };
  }

  async function clearAllDataEnabled(ctx: ServiceContext) {
    vi.stubEnv("FINPILOT_DATA_CONTROLS", "enabled");
    return clearAllData(ctx, CLEAR_CONFIRMATION);
  }

  it("leaves the owner and the default categories, and nothing else", async () => {
    const { handle, ctx, ownerId, before } = await clearedDemo();

    const owner = handle.sqlite.prepare("SELECT * FROM owners").get() as Record<string, unknown>;
    expect(owner).toMatchObject({
      id: ownerId,
      name: before.name,
      time_zone: before.time_zone,
      base_currency: before.base_currency,
      next_transaction_sequence: 1,
    });
    expect(ownerCount(handle)).toBe(1);

    const { tables } = projection(handle, ownerId);
    const { categories, ...rest } = tables;
    for (const [name, rows] of Object.entries(rest)) expect(rows, name).toEqual([]);
    expect(
      (await getCategories(ctx)).map((c) => ({
        name: c.name,
        kind: c.kind,
        archived: c.archivedAt,
      })),
    ).toEqual(expect.arrayContaining(DEFAULT_CATEGORIES.map((c) => ({ ...c, archived: null }))));
    expect(categories).toHaveLength(DEFAULT_CATEGORIES.length);
    expect(brokenReferences(handle)).toEqual([]);
  });

  it("restores renamed, archived and custom categories to the defaults", async () => {
    const { handle, ctx, ownerId } = await ownLedger();
    expect((await clearAllDataEnabled(ctx)).ok).toBe(true);
    const names = (await getCategories(ctx)).map((c) => c.name).sort();
    expect(names).toEqual(DEFAULT_CATEGORIES.map((c) => c.name).sort());
    expect(projection(handle, ownerId).tables.transactions).toEqual([]);
  });

  it("is a usable new installation: the owner resolves and every read works on it", async () => {
    const { handle, ctx } = await clearedDemo();
    expect(getCurrentOwner(handle).ok).toBe(true);

    expect(await getAccountBalances(ctx)).toEqual([]);
    expect((await getPosition(ctx)).netWorth).toEqual(ZERO);
    expect((await getAvailable(ctx)).available).toEqual(ZERO);
    expect(await getAttention(ctx)).toEqual([]);
    expect(await getOccurrences(ctx)).toEqual([]);
    expect(await getCommitments(ctx)).toEqual([]);
    expect(await getItems(ctx)).toEqual([]);
    await expect(getMonthCalendar(ctx, "saturday")).resolves.toBeDefined();
    await expect(getMonthlyCashFlow(ctx)).resolves.toBeDefined();
    await expect(getTrends(ctx)).resolves.toBeDefined();
    await expect(getActivity(ctx)).resolves.toBeDefined();
  });

  it("can record again from sequence 1", async () => {
    const { handle, ctx } = await clearedDemo();
    const cash = await createAccount(ctx, {
      name: "Cash",
      type: "cash",
      openedOn: calendarDateFromIso("2026-09-01"),
      openingBalance: fromMajor(100),
    });
    expect(cash.ok).toBe(true);
    const [row] = handle.sqlite.prepare("SELECT sequence FROM transactions").all() as {
      sequence: number;
    }[];
    expect(row?.sequence).toBe(1);
  });

  it("is followed by a reset that restores the demo exactly", async () => {
    const { handle, ownerId } = await clearedDemo();
    await resetToDemo(handle.db, ownerId, TODAY);
    expect(projection(handle, ownerId)).toEqual(reference);
    expect(brokenReferences(handle)).toEqual([]);
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

    vi.stubEnv("FINPILOT_DATA_CONTROLS", "enabled");
    expect((await clearAllData(context(handle, mine), CLEAR_CONFIRMATION)).ok).toBe(true);
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

  it("rolls a clear back completely when it fails part-way", async () => {
    const { handle, ctx, ownerId } = await ownLedger();
    const before = projection(handle, ownerId);
    // Fails after every delete, as the default categories go back in.
    handle.sqlite.exec(
      "CREATE TRIGGER fail_clear BEFORE INSERT ON categories BEGIN SELECT RAISE(ABORT, 'forced failure'); END",
    );
    vi.stubEnv("FINPILOT_DATA_CONTROLS", "enabled");

    const failure = await clearAllData(ctx, CLEAR_CONFIRMATION).catch((e: unknown) => e);
    expect(messages(failure)).toMatch(/forced failure/);

    expect(projection(handle, ownerId)).toEqual(before);
    expect(handle.sqlite.inTransaction).toBe(false);
  });
});

describe("the commands' guards", () => {
  it.each([undefined, "", "disabled", "true", "1", "ENABLED", " enabled"])(
    "refuse both operations when FINPILOT_DATA_CONTROLS is %j",
    async (value) => {
      const { handle, ctx, ownerId } = await ownLedger();
      if (value === undefined) vi.stubEnv("FINPILOT_DATA_CONTROLS", undefined);
      else vi.stubEnv("FINPILOT_DATA_CONTROLS", value);
      const before = projection(handle, ownerId);

      const reset = await resetDemoData(ctx);
      const clear = await clearAllData(ctx, CLEAR_CONFIRMATION);

      expect(reset.ok).toBe(false);
      expect(clear.ok).toBe(false);
      expect(projection(handle, ownerId)).toEqual(before);
    },
  );

  it.each([
    "",
    "clear",
    "Clear",
    " CLEAR",
    "CLEAR ",
    "CLEAR\n",
    null,
    undefined,
    1,
    ["CLEAR"],
    { value: "CLEAR" },
  ])("refuse to clear without the exact confirmation (%j)", async (confirmation) => {
    vi.stubEnv("FINPILOT_DATA_CONTROLS", "enabled");
    const { handle, ctx, ownerId } = await ownLedger();
    const before = projection(handle, ownerId);

    const result = await clearAllData(ctx, confirmation);

    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { confirmation: "Type CLEAR to confirm." },
    });
    expect(projection(handle, ownerId)).toEqual(before);
  });

  it("reset the demo through the command when enabled", async () => {
    vi.stubEnv("FINPILOT_DATA_CONTROLS", "enabled");
    const { handle, ctx, ownerId } = await ownLedger();
    expect((await resetDemoData(ctx)).ok).toBe(true);
    expect(projection(handle, ownerId)).toEqual(reference);
  });
});
