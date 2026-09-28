import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import type { EntityId, IdGenerator } from "@/domain/ids";
import { ZERO, type Money } from "@/domain/money";
import {
  createProtectedMoneyItem,
  releaseProtectedMoney,
  reserveProtectedMoney,
} from "@/server/commands";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { deleteTransaction, recordTransaction } from "@/server/services/ledger-service";
import {
  archiveItem,
  createItem,
  editItem,
  getEarmarkBacking,
  getItems,
  release,
  reserve,
} from "@/server/services/protected-money-service";
import { archiveAccount, createAccount, createOwner } from "@/server/services/setup-service";

import { d, errorCode, ok, setupLedger, taka } from "../support/ledger";

/**
 * Protected money ("Set aside") through the real services on a real database:
 * items, Reserve and Release, backing priority, and backing derived from the
 * current ledger on every read.
 */
let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  return {
    ...setup,
    bank: await setup.account("Bank", "bank", "2026-08-01", 10_000),
    savings: await setup.account("Savings", "savings", "2026-08-01", 50_000),
    visa: await setup.account("Visa", "credit_card", "2026-08-01", -2_000),
  };
}

type Ledger = Awaited<ReturnType<typeof ledger>>;

const item = async (ctx: ServiceContext, name: string, target: number | null = null) =>
  ok(await createItem(ctx, { name, target: target === null ? null : taka(target) }));

const view = async (ctx: ServiceContext, id: string) =>
  (await getItems(ctx)).find((i) => i.id === id)!;

/** Row counts that prove a rejected write left nothing behind. */
const artefacts = (s: Ledger) => ({
  earmarks: s.handle.sqlite.prepare("SELECT count(*) AS n FROM earmarks").get(),
  entries: s.handle.sqlite.prepare("SELECT count(*) AS n FROM earmark_entries").get(),
});

/** Stored earmark relationships for an account, in priority order. */
const earmarkRows = (s: Ledger, accountId: string) =>
  s.handle.sqlite
    .prepare(
      "SELECT item_id AS itemId, priority, ended_at IS NOT NULL AS ended FROM earmarks WHERE account_id = ? ORDER BY priority",
    )
    .all(accountId) as { itemId: string; priority: number; ended: number }[];

const backingOn = async (ctx: ServiceContext, accountId: string) =>
  (await getEarmarkBacking(ctx))
    .filter((b) => b.accountId === accountId)
    .map((b) => ({ itemId: b.itemId, reserved: b.reserved, covered: b.covered, short: b.short }));

const spend = async (s: Ledger, accountId: string, amount: number) =>
  ok(
    await recordTransaction(s.ctx, {
      type: "expense",
      amount: taka(amount),
      accountId,
      categoryId: s.category("Other"),
      occurredOn: d("2026-09-20"),
    }),
  );

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

describe("items", () => {
  it("creates an item with a target (goal-like) or without one (reserve-like)", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop", 120_000);
    const fund = await item(s.ctx, "Emergency fund");

    expect((await view(s.ctx, laptop)).cover).toMatchObject({
      target: taka(120_000),
      reserved: ZERO,
      stillNeeded: taka(120_000),
      targetReached: false,
    });
    expect((await view(s.ctx, fund)).cover).toMatchObject({
      target: null,
      stillNeeded: null,
      progress: null,
      targetReached: null,
    });
  });

  it("rejects a zero or negative target and a blank name", async () => {
    const s = await ledger();
    expect(errorCode(await createItem(s.ctx, { name: "Laptop", target: ZERO }))).toBe(
      "invalid_target",
    );
    expect(errorCode(await createItem(s.ctx, { name: "Laptop", target: taka(-5) }))).toBe(
      "invalid_target",
    );
    expect(errorCode(await createItem(s.ctx, { name: "  ", target: null }))).toBe("invalid_name");
    expect(await getItems(s.ctx)).toEqual([]);
  });

  it("edits the name and target without reserving or releasing anything", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop", 120_000);
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(4_000) }));

    ok(await editItem(s.ctx, laptop, { name: "New laptop", target: taka(5_000) }));
    expect(await view(s.ctx, laptop)).toMatchObject({
      name: "New laptop",
      cover: { reserved: taka(4_000), target: taka(5_000), stillNeeded: taka(1_000) },
    });

    ok(await editItem(s.ctx, laptop, { name: "New laptop", target: null }));
    expect((await view(s.ctx, laptop)).cover).toMatchObject({
      reserved: taka(4_000),
      target: null,
      progress: null,
    });
  });

  it("archives only when nothing remains reserved, and then takes no entries or edits", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(1_000) }));
    expect(errorCode(await archiveItem(s.ctx, laptop))).toBe("still_reserved");

    ok(await release(s.ctx, laptop, { accountId: s.bank, amount: taka(1_000) }));
    ok(await archiveItem(s.ctx, laptop));
    ok(await archiveItem(s.ctx, laptop)); // idempotent
    expect((await view(s.ctx, laptop)).archived).toBe(true);

    expect(errorCode(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(1) }))).toBe(
      "item_archived",
    );
    expect(errorCode(await editItem(s.ctx, laptop, { name: "X", target: null }))).toBe(
      "item_archived",
    );
  });
});

// ---------------------------------------------------------------------------
// Reserve
// ---------------------------------------------------------------------------

describe("Reserve", () => {
  it("establishes an earmark on the first reservation and keeps it on increases", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(2_000) }));
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(3_000) }));

    expect(earmarkRows(s, s.bank)).toEqual([{ itemId: laptop, priority: 1, ended: 0 }]);
    expect(await backingOn(s.ctx, s.bank)).toEqual([
      { itemId: laptop, reserved: taka(5_000), covered: taka(5_000), short: ZERO },
    ]);
  });

  it("lets one account back several items and one item use several accounts", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop", 60_000);
    const fund = await item(s.ctx, "Emergency fund");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(4_000) }));
    ok(await reserve(s.ctx, fund, { accountId: s.bank, amount: taka(6_000) }));
    ok(await reserve(s.ctx, laptop, { accountId: s.savings, amount: taka(30_000) }));

    expect((await view(s.ctx, laptop)).cover).toMatchObject({
      reserved: taka(34_000),
      covered: taka(34_000),
      stillNeeded: taka(26_000),
    });
    expect((await view(s.ctx, laptop)).earmarks.map((e) => e.accountId).sort()).toEqual(
      [s.bank, s.savings].sort(),
    );
    expect((await view(s.ctx, fund)).cover.reserved).toBe(taka(6_000));
  });

  it("never sets the same money aside twice: the account's total is checked", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    const fund = await item(s.ctx, "Emergency fund");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(7_000) }));

    expect(errorCode(await reserve(s.ctx, fund, { accountId: s.bank, amount: taka(3_001) }))).toBe(
      "exceeds_balance",
    );
    ok(await reserve(s.ctx, fund, { accountId: s.bank, amount: taka(3_000) }));
  });

  it("rejects a liability, and a zero or negative amount", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    expect(errorCode(await reserve(s.ctx, laptop, { accountId: s.visa, amount: taka(1) }))).toBe(
      "account_not_asset",
    );
    expect(errorCode(await reserve(s.ctx, laptop, { accountId: s.bank, amount: ZERO }))).toBe(
      "invalid_amount",
    );
    expect(errorCode(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(-10) }))).toBe(
      "invalid_amount",
    );
    expect(artefacts(s)).toEqual({ earmarks: { n: 0 }, entries: { n: 0 } });
  });

  it("writes nothing when rejected, not even a backing priority", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    const fund = await item(s.ctx, "Emergency fund");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(8_000) }));
    const before = artefacts(s);

    expect(errorCode(await reserve(s.ctx, fund, { accountId: s.bank, amount: taka(5_000) }))).toBe(
      "exceeds_balance",
    );
    expect(artefacts(s)).toEqual(before);

    // The next earmark takes the next priority: the rejected write consumed none.
    ok(await reserve(s.ctx, fund, { accountId: s.bank, amount: taka(2_000) }));
    expect(earmarkRows(s, s.bank).map((r) => r.priority)).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Release
// ---------------------------------------------------------------------------

describe("Release", () => {
  it("releases partly, keeping the earmark and its priority", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(5_000) }));
    ok(await release(s.ctx, laptop, { accountId: s.bank, amount: taka(2_000) }));

    expect(earmarkRows(s, s.bank)).toEqual([{ itemId: laptop, priority: 1, ended: 0 }]);
    expect((await view(s.ctx, laptop)).cover.reserved).toBe(taka(3_000));
  });

  it("releases fully, ending the earmark while keeping its history", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(5_000) }));
    ok(await release(s.ctx, laptop, { accountId: s.bank, amount: taka(5_000) }));

    expect(earmarkRows(s, s.bank)).toEqual([{ itemId: laptop, priority: 1, ended: 1 }]);
    expect(artefacts(s)).toEqual({ earmarks: { n: 1 }, entries: { n: 2 } });
    expect(await view(s.ctx, laptop)).toMatchObject({ cover: { reserved: ZERO }, earmarks: [] });
  });

  it("never releases more than the item holds on that account", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    const fund = await item(s.ctx, "Emergency fund");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(1_000) }));
    ok(await reserve(s.ctx, fund, { accountId: s.bank, amount: taka(5_000) }));
    const before = artefacts(s);

    expect(
      errorCode(await release(s.ctx, laptop, { accountId: s.bank, amount: taka(1_001) })),
    ).toBe("exceeds_reserved");
    expect(errorCode(await release(s.ctx, laptop, { accountId: s.savings, amount: taka(1) }))).toBe(
      "exceeds_reserved",
    );
    expect(artefacts(s)).toEqual(before);
  });

  it("releases money that is short", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop");
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(8_000) }));
    await spend(s, s.bank, 10_000); // Bank 0: the whole reservation is short
    expect((await view(s.ctx, laptop)).cover).toMatchObject({ covered: ZERO, short: taka(8_000) });

    ok(await release(s.ctx, laptop, { accountId: s.bank, amount: taka(8_000) }));
    expect((await view(s.ctx, laptop)).cover).toMatchObject({ reserved: ZERO, short: ZERO });
  });
});

// ---------------------------------------------------------------------------
// Backing priority
// ---------------------------------------------------------------------------

describe("backing priority", () => {
  it("increases and partial releases keep an earmark ahead of later ones", async () => {
    const s = await ledger();
    const a = await item(s.ctx, "A");
    const b = await item(s.ctx, "B");
    ok(await reserve(s.ctx, a, { accountId: s.bank, amount: taka(4_000) }));
    ok(await reserve(s.ctx, b, { accountId: s.bank, amount: taka(4_000) }));
    ok(await reserve(s.ctx, a, { accountId: s.bank, amount: taka(1_000) }));
    ok(await release(s.ctx, a, { accountId: s.bank, amount: taka(2_000) }));
    await spend(s, s.bank, 5_000); // Bank 5,000 against 3,000 (A) + 4,000 (B)

    expect(await backingOn(s.ctx, s.bank)).toEqual([
      { itemId: a, reserved: taka(3_000), covered: taka(3_000), short: ZERO },
      { itemId: b, reserved: taka(4_000), covered: taka(2_000), short: taka(2_000) },
    ]);
  });

  it("a full release ends an earmark; reserving again starts behind the existing ones", async () => {
    const s = await ledger();
    const a = await item(s.ctx, "A");
    const b = await item(s.ctx, "B");
    ok(await reserve(s.ctx, a, { accountId: s.bank, amount: taka(4_000) }));
    ok(await reserve(s.ctx, b, { accountId: s.bank, amount: taka(4_000) }));
    ok(await release(s.ctx, a, { accountId: s.bank, amount: taka(4_000) }));
    ok(await reserve(s.ctx, a, { accountId: s.bank, amount: taka(4_000) }));
    await spend(s, s.bank, 5_000); // Bank 5,000 against 4,000 + 4,000

    expect(earmarkRows(s, s.bank)).toEqual([
      { itemId: a, priority: 1, ended: 1 },
      { itemId: b, priority: 2, ended: 0 },
      { itemId: a, priority: 3, ended: 0 },
    ]);
    expect(await backingOn(s.ctx, s.bank)).toEqual([
      { itemId: b, reserved: taka(4_000), covered: taka(4_000), short: ZERO },
      { itemId: a, reserved: taka(4_000), covered: taka(1_000), short: taka(3_000) },
    ]);
  });

  it("follows the stored priority, never the order of ids", async () => {
    const s = await ledger();
    // Every id from here on sorts BEFORE the previous one.
    let n = 999_999;
    const descending: IdGenerator = {
      next: () => `00000000-0000-7000-8000-${String(n--).padStart(12, "0")}` as EntityId,
    };
    const ctx = { ...s.ctx, ids: descending };
    const first = await item(ctx, "First");
    const second = await item(ctx, "Second");
    ok(await reserve(ctx, first, { accountId: s.bank, amount: taka(6_000) }));
    ok(await reserve(ctx, second, { accountId: s.bank, amount: taka(4_000) }));
    await spend(s, s.bank, 4_000); // Bank 6,000

    expect(await backingOn(ctx, s.bank)).toEqual([
      { itemId: first, reserved: taka(6_000), covered: taka(6_000), short: ZERO },
      { itemId: second, reserved: taka(4_000), covered: ZERO, short: taka(4_000) },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Backing is derived from the current ledger
// ---------------------------------------------------------------------------

describe("backing follows the ledger without rewriting earmarks", () => {
  it("a later expense makes a reservation short; deleting it covers it again", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop", 6_000);
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(5_000) }));
    const history = artefacts(s);

    const expense = await spend(s, s.bank, 8_000); // Bank 2,000
    expect((await view(s.ctx, laptop)).cover).toMatchObject({
      reserved: taka(5_000),
      covered: taka(2_000),
      short: taka(3_000),
      stillNeeded: taka(4_000),
    });

    ok(await deleteTransaction(s.ctx, expense));
    expect((await view(s.ctx, laptop)).cover).toMatchObject({
      covered: taka(5_000),
      short: ZERO,
      stillNeeded: taka(1_000),
    });
    expect(artefacts(s)).toEqual(history);
  });
});

// ---------------------------------------------------------------------------
// Archived accounts
// ---------------------------------------------------------------------------

describe("archived accounts", () => {
  /** An account archived at zero, which then regains 1,000 when its transfer out is deleted. */
  async function archivedWithBalance(s: Ledger) {
    const spare = await s.account("Spare", "cash", "2026-08-01", 1_000);
    const transferId = ok(
      await recordTransaction(s.ctx, {
        type: "transfer",
        amount: taka(1_000),
        accountId: spare,
        counterAccountId: s.bank,
        occurredOn: d("2026-09-10"),
      }),
    );
    ok(await archiveAccount(s.ctx, spare));
    ok(await deleteTransaction(s.ctx, transferId));
    return spare;
  }

  it("takes no new reservation, even after regaining a positive balance", async () => {
    const s = await ledger();
    const spare = await archivedWithBalance(s);
    const laptop = await item(s.ctx, "Laptop");
    expect(errorCode(await reserve(s.ctx, laptop, { accountId: spare, amount: taka(100) }))).toBe(
      "account_archived",
    );
    expect(artefacts(s)).toEqual({ earmarks: { n: 0 }, entries: { n: 0 } });
  });

  it("releases partly and fully, and will not re-establish a released earmark", async () => {
    const s = await ledger();
    const spare = await s.account("Spare", "cash", "2026-08-01", 1_000);
    const laptop = await item(s.ctx, "Laptop");
    ok(await reserve(s.ctx, laptop, { accountId: spare, amount: taka(600) }));
    ok(
      await recordTransaction(s.ctx, {
        type: "transfer",
        amount: taka(1_000),
        accountId: spare,
        counterAccountId: s.bank,
        occurredOn: d("2026-09-10"),
      }),
    );
    ok(await archiveAccount(s.ctx, spare));

    expect(errorCode(await reserve(s.ctx, laptop, { accountId: spare, amount: taka(1) }))).toBe(
      "account_archived",
    );
    ok(await release(s.ctx, laptop, { accountId: spare, amount: taka(200) }));
    ok(await release(s.ctx, laptop, { accountId: spare, amount: taka(400) }));
    expect(earmarkRows(s, spare)).toEqual([{ itemId: laptop, priority: 1, ended: 1 }]);
    expect(errorCode(await reserve(s.ctx, laptop, { accountId: spare, amount: taka(1) }))).toBe(
      "account_archived",
    );
  });
});

// ---------------------------------------------------------------------------
// Owner isolation
// ---------------------------------------------------------------------------

describe("owner isolation", () => {
  it("never reads or writes another owner's items, earmarks or accounts", async () => {
    const s = await ledger();
    const laptop = await item(s.ctx, "Laptop", 10_000);
    ok(await reserve(s.ctx, laptop, { accountId: s.bank, amount: taka(1_000) }));

    const otherId = ok(
      await createOwner(
        { db: s.handle.db, ids: uuidV7Generator, now: s.ctx.now },
        { name: "Other", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
      ),
    );
    const other: ServiceContext = { ...s.ctx, ownerId: otherId };
    const otherBank = ok(
      await createAccount(other, {
        name: "Bank",
        type: "bank",
        openedOn: d("2026-08-01"),
        openingBalance: taka(5_000),
      }),
    );

    expect(await getItems(other)).toEqual([]);
    expect(await getEarmarkBacking(other)).toEqual([]);
    const amount: Money = taka(1);
    expect(errorCode(await reserve(other, laptop, { accountId: otherBank, amount }))).toBe(
      "item_not_found",
    );
    expect(errorCode(await release(other, laptop, { accountId: s.bank, amount }))).toBe(
      "item_not_found",
    );
    expect(errorCode(await editItem(other, laptop, { name: "Mine", target: null }))).toBe(
      "item_not_found",
    );
    expect(errorCode(await archiveItem(other, laptop))).toBe("item_not_found");
    expect(errorCode(await reserve(s.ctx, laptop, { accountId: otherBank, amount }))).toBe(
      "account_not_found",
    );
    expect((await view(s.ctx, laptop)).cover.reserved).toBe(taka(1_000));
  });
});

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

describe("commands", () => {
  it("parse an optional target and place rejections on the right field", async () => {
    const s = await ledger();
    const fund = ok(await createProtectedMoneyItem(s.ctx, { name: "Emergency fund", target: "" }));
    expect((await view(s.ctx, fund)).cover.target).toBeNull();
    expect(await createProtectedMoneyItem(s.ctx, { name: "Laptop", target: "0" })).toMatchObject({
      ok: false,
      fieldErrors: { target: expect.any(String) },
    });

    expect(
      await reserveProtectedMoney(s.ctx, fund, { accountId: s.bank, amount: "10,001" }),
    ).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String) } });
    expect(
      await reserveProtectedMoney(s.ctx, fund, { accountId: s.visa, amount: "10" }),
    ).toMatchObject({ ok: false, fieldErrors: { accountId: expect.any(String) } });
    ok(await reserveProtectedMoney(s.ctx, fund, { accountId: s.bank, amount: "2,500" }));
    ok(await releaseProtectedMoney(s.ctx, fund, { accountId: s.bank, amount: "500" }));
    expect((await view(s.ctx, fund)).cover.reserved).toBe(taka(2_000));
  });
});
