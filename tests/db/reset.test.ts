import { count } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { accounts, categories, owners, reconciliationCheckpoints, transactions } from "@/db/schema";
import { clearAllData } from "@/db/seed/reset";
import { calendarDateFromIso } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import { fromMajor } from "@/domain/money";
import { writeContext, type ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { dismiss } from "@/server/repositories/signal-dismissal-repository";
import {
  createCommitment,
  getOccurrences,
  payOccurrence,
} from "@/server/services/commitment-service";
import { createItem, reserve } from "@/server/services/protected-money-service";
import { verifyAccountBalance } from "@/server/services/reconciliation-service";
import {
  createAccount,
  createOwner,
  getAccounts,
  getCategories,
} from "@/server/services/setup-service";

import { freshDatabase } from "../support/database";

/**
 * Clearing in place must empty *every* owned table. Reconciliation checkpoints
 * were once left behind, which orphaned them against the accounts and
 * transactions being deleted and left the file permanently broken — every
 * later migration then failed its foreign-key check. These tests build real
 * data through the services and run the real clear path.
 */
let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

const TODAY = calendarDateFromIso("2026-09-22");

/** A ledger with a verified account, so a checkpoint and its adjustment exist. */
async function verifiedLedger() {
  handle = freshDatabase();
  let tick = Date.UTC(2026, 8, 22, 6, 0, 0);
  const now = () => new Date((tick += 1000));

  const owner = await createOwner(
    { db: handle.db, ids: uuidV7Generator, now },
    { name: "Demo", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
  );
  if (!owner.ok) throw new Error("could not create the owner");
  const ctx: ServiceContext = {
    db: handle.db,
    ownerId: owner.value,
    clock: fixedClock(TODAY),
    ids: uuidV7Generator,
    now,
  };

  const cash = await createAccount(ctx, {
    name: "Cash",
    type: "cash",
    openedOn: calendarDateFromIso("2026-09-01"),
    openingBalance: fromMajor(1_000),
  });
  const wallet = await createAccount(ctx, {
    name: "Wallet",
    type: "cash",
    openedOn: calendarDateFromIso("2026-09-01"),
  });
  if (!cash.ok || !wallet.ok) throw new Error("could not create the accounts");

  // One checkpoint that posted an adjustment, and one that did not.
  const adjusted = await verifyAccountBalance(ctx, {
    accountId: cash.value,
    asOf: calendarDateFromIso("2026-09-20"),
    countedAmount: fromMajor(900),
  });
  const matched = await verifyAccountBalance(ctx, {
    accountId: wallet.value,
    asOf: calendarDateFromIso("2026-09-20"),
    countedAmount: fromMajor(0),
  });
  if (!adjusted.ok || !matched.ok) throw new Error("could not verify the balances");
  expect(adjusted.value.adjustmentId).not.toBeNull();
  expect(matched.value.adjustmentId).toBeNull();

  return { ctx, handle: handle! };
}

describe("clearAllData", () => {
  it("clears reconciliation checkpoints along with everything they reference", async () => {
    const { handle: h } = await verifiedLedger();
    const countOf = (table: typeof reconciliationCheckpoints | typeof transactions) =>
      h.db.select({ n: count() }).from(table).get()!.n;

    // The defect needs a checkpoint to exist in the first place.
    expect(countOf(reconciliationCheckpoints)).toBe(2);
    expect(countOf(transactions)).toBeGreaterThan(0);

    clearAllData(h);

    expect(countOf(reconciliationCheckpoints)).toBe(0);
    expect(countOf(transactions)).toBe(0);
    for (const table of [accounts, categories, owners]) {
      expect(h.db.select({ n: count() }).from(table).get()!.n).toBe(0);
    }
  });

  it("leaves no orphaned references behind", async () => {
    const { handle: h } = await verifiedLedger();
    clearAllData(h);
    expect(h.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("can be run twice, and the database is reusable afterwards", async () => {
    // The real failure mode: a half-cleared file stayed broken for every later
    // run, because migration re-checks foreign keys on open.
    const { ctx, handle: h } = await verifiedLedger();
    clearAllData(h);
    expect(() => clearAllData(h)).not.toThrow();
    expect(h.sqlite.pragma("foreign_key_check")).toEqual([]);

    // A fresh owner and account can be created in the cleared database.
    const owner = await createOwner(
      { db: h.db, ids: uuidV7Generator, now: ctx.now },
      { name: "Again", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
    );
    expect(owner.ok).toBe(true);
    expect(h.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("leaves no row in any table the schema owns", async () => {
    // Forgetting a table is exactly how this broke, so rather than listing the
    // tables, every table the schema has is read back and required to be empty.
    // A table added later is covered automatically.
    const { handle: h } = await verifiedLedger();
    clearAllData(h);

    const tables = (
      h.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
        )
        .all() as { name: string }[]
    ).map((r) => r.name);

    expect(tables).toContain("reconciliation_checkpoints");
    const remaining = tables
      .map((name) => ({
        name,
        n: (h.sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n,
      }))
      .filter((t) => t.n > 0);
    expect(remaining).toEqual([]);
  });
});

describe("clearAllData with commitments", () => {
  it("clears commitments and their paid occurrences along with the ledger", async () => {
    const { ctx, handle: h } = await verifiedLedger();
    const housing = (await getCategories(ctx)).find((c) => c.name === "Housing")!.id;
    const cash = (await getAccounts(ctx)).find((a) => a.name === "Cash")!.id;
    const created = await createCommitment(ctx, {
      name: "Rent",
      categoryId: housing,
      expectedAmount: fromMajor(100),
      expectedAccountId: cash,
      frequency: "monthly",
      interval: 1,
      anchorOn: calendarDateFromIso("2026-09-01"),
      endOn: null,
    });
    if (!created.ok) throw new Error("could not create the commitment");
    const [first] = await getOccurrences(ctx);
    expect((await payOccurrence(ctx, first!.id, { accountId: cash })).ok).toBe(true);

    clearAllData(h);

    for (const table of ["commitment_occurrences", "commitments", "transactions"]) {
      expect(h.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(h.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

describe("clearAllData with protected money", () => {
  it("clears items, earmarks and their entries along with the ledger", async () => {
    const { ctx, handle: h } = await verifiedLedger();
    const cash = (await getAccounts(ctx)).find((a) => a.name === "Cash")!.id;
    const created = await createItem(ctx, { name: "Laptop", target: fromMajor(1_000) });
    if (!created.ok) throw new Error("could not create the item");
    expect((await reserve(ctx, created.value, { accountId: cash, amount: fromMajor(10) })).ok).toBe(
      true,
    );

    clearAllData(h);

    for (const table of ["earmark_entries", "earmarks", "protected_money_items", "transactions"]) {
      expect(h.sqlite.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(h.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});

describe("clearAllData with signal dismissals", () => {
  it("clears the owner's dismissals along with the owner", async () => {
    const { ctx, handle: h } = await verifiedLedger();
    dismiss(h.db, writeContext(ctx), "spending_up:2026-09");
    expect(h.sqlite.prepare("SELECT count(*) AS n FROM signal_dismissals").get()).toEqual({ n: 1 });

    clearAllData(h);

    expect(h.sqlite.prepare("SELECT count(*) AS n FROM signal_dismissals").get()).toEqual({ n: 0 });
    expect(h.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
