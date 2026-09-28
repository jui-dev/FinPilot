import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import type { CommitmentFrequency } from "@/domain/commitments/schedule";
import type { ServiceContext } from "@/server/context";
import { getAvailable } from "@/server/services/available-service";
import {
  createCommitment,
  getOccurrences,
  payOccurrence,
  skipOccurrence,
} from "@/server/services/commitment-service";
import {
  deleteTransaction,
  getPosition,
  recordTransaction,
} from "@/server/services/ledger-service";
import { createItem, editItem, getItems, reserve } from "@/server/services/protected-money-service";
import { archiveAccount, createAccount, createOwner } from "@/server/services/setup-service";

import { d, ok, setupLedger, taka } from "../support/ledger";

/**
 * Available through the real services on a real database. The read model only
 * composes what the ledger, Commitments and Protected money already derive;
 * these tests change those facts and check the bridge follows.
 */
let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  const s = {
    ...setup,
    bank: await setup.account("Bank", "bank", "2026-08-01", 100_000),
    bkash: await setup.account("bKash", "mobile_wallet", "2026-08-01", 10_000),
    savings: await setup.account("Savings", "savings", "2026-08-01", 90_000),
    visa: await setup.account("Visa", "credit_card", "2026-08-01", -6_000),
  };
  const expense = async (accountId: string, amountTaka: number) =>
    ok(
      await recordTransaction(s.ctx, {
        type: "expense",
        amount: taka(amountTaka),
        accountId,
        categoryId: s.category("Shopping"),
        occurredOn: d("2026-09-21"),
      }),
    );
  const transfer = async (from: string, to: string, amountTaka: number) =>
    ok(
      await recordTransaction(s.ctx, {
        type: "transfer",
        amount: taka(amountTaka),
        accountId: from,
        counterAccountId: to,
        occurredOn: d("2026-09-21"),
      }),
    );
  const commitment = async (
    name: string,
    amountTaka: number,
    anchorOn: string,
    expectedAccountId: string | null,
    frequency: CommitmentFrequency = "monthly",
  ) =>
    ok(
      await createCommitment(s.ctx, {
        name,
        categoryId: s.category("Other"),
        expectedAmount: taka(amountTaka),
        expectedAccountId,
        frequency,
        interval: 1,
        anchorOn: d(anchorOn),
        endOn: null,
      }),
    );
  const occurrenceOf = async (commitmentId: string, dueOn: string) =>
    (await getOccurrences(s.ctx)).find(
      (o) => o.commitmentId === commitmentId && o.dueOn === dueOn,
    )!;
  const setAside = async (name: string, accountId: string, amountTaka: number, target?: number) => {
    const id = ok(await createItem(s.ctx, { name, target: target ? taka(target) : null }));
    ok(await reserve(s.ctx, id, { accountId, amount: taka(amountTaka) }));
    return id;
  };
  const setFlag = (accountId: string, included: boolean) =>
    s.handle.sqlite
      .prepare("UPDATE accounts SET included_in_available = ? WHERE id = ?")
      .run(included ? 1 : 0, accountId);
  return { ...s, expense, transfer, commitment, occurrenceOf, setAside, setFlag };
}

const available = async (ctx: ServiceContext) => (await getAvailable(ctx)).available;

describe("getAvailable", () => {
  it("is the balances in scope when there are no commitments and nothing set aside", async () => {
    const s = await ledger();
    const view = await getAvailable(s.ctx);
    expect(view).toMatchObject({
      today: "2026-09-22",
      horizonEnd: "2026-10-22",
      includedAssetBalances: taka(110_000),
      liabilityBalances: taka(-6_000),
      balancesInScope: taka(104_000),
      commitmentsDue: taka(0),
      coveredEarmarks: taka(0),
      available: taka(104_000),
      commitments: [],
      earmarks: [],
    });
    expect(view.accounts.map((a) => [a.name, a.counted, a.balance])).toEqual([
      ["Bank", true, taka(100_000)],
      ["bKash", true, taka(10_000)],
      ["Savings", false, taka(90_000)],
      ["Visa", true, taka(-6_000)],
    ]);
  });

  it("subtracts what real money covers, never the reserved amount or the target", async () => {
    const s = await ledger();
    const laptop = await s.setAside("Laptop", s.bank, 80_000, 150_000);
    expect(await available(s.ctx)).toBe(taka(24_000));

    // A ৳30,000 expense: Bank 70,000 now covers 70,000 of the 80,000 set aside.
    await s.expense(s.bank, 30_000);
    const cover = (await getItems(s.ctx)).find((i) => i.id === laptop)!.cover;
    expect(cover).toMatchObject({
      reserved: taka(80_000),
      covered: taka(70_000),
      short: taka(10_000),
    });
    const view = await getAvailable(s.ctx);
    expect(view.coveredEarmarks).toBe(taka(70_000));
    expect(view.earmarks).toEqual([
      {
        itemId: laptop,
        itemName: "Laptop",
        accountId: s.bank,
        accountName: "Bank",
        covered: taka(70_000),
        deducted: true,
        // Evidence only, from the same backing: neither is deducted.
        reserved: taka(80_000),
        short: taka(10_000),
      },
    ]);
    // Available fell by 20,000, not 30,000: the other 10,000 is Laptop's shortfall.
    expect(view.available).toBe(taka(4_000));

    // The target is intent only.
    ok(await editItem(s.ctx, laptop, { name: "Laptop", target: taka(90_000) }));
    expect(await available(s.ctx)).toBe(taka(4_000));
  });

  it("subtracts a pending commitment expected from an excluded account (O-1)", async () => {
    const s = await ledger();
    const insurance = await s.commitment("Insurance", 20_000, "2026-09-20", s.savings, "yearly");
    const view = await getAvailable(s.ctx);
    expect(view.commitments).toMatchObject([
      { name: "Insurance", dueOn: "2026-09-20", expectedAmount: taka(20_000), display: "overdue" },
    ]);
    expect(view.available).toBe(taka(84_000));

    // Paid from the excluded account: the commitment leaves the term and no
    // included balance changes, so Available rises by the expected amount.
    const due = await s.occurrenceOf(insurance, "2026-09-20");
    ok(await payOccurrence(s.ctx, due.id, { accountId: s.savings }));
    expect(await available(s.ctx)).toBe(taka(104_000));
  });

  it("counts only pending occurrences inside the horizon; Pay from an included account is neutral", async () => {
    const s = await ledger();
    const rent = await s.commitment("Rent", 30_000, "2026-10-01", s.bank);
    const internet = await s.commitment("Internet", 1_500, "2026-09-25", null);
    // The horizon ends Oct 22: Internet Oct 25 and Rent Nov 1 fall outside it.
    const view = await getAvailable(s.ctx);
    expect(view.commitments.map((c) => `${c.name} ${c.dueOn}`)).toEqual([
      "Internet 2026-09-25",
      "Rent 2026-10-01",
    ]);
    expect(view.available).toBe(taka(72_500));

    ok(await skipOccurrence(s.ctx, (await s.occurrenceOf(internet, "2026-09-25")).id));
    expect(await available(s.ctx)).toBe(taka(74_000));

    ok(
      await payOccurrence(s.ctx, (await s.occurrenceOf(rent, "2026-10-01")).id, {
        accountId: s.bank,
      }),
    );
    expect(await available(s.ctx)).toBe(taka(74_000));
  });

  it("counts every liability, even with a stale excluded flag", async () => {
    const s = await ledger();
    s.setFlag(s.visa, false);
    const view = await getAvailable(s.ctx);
    expect(view.accounts.find((a) => a.accountId === s.visa)!.counted).toBe(true);
    expect(view.liabilityBalances).toBe(taka(-6_000));
    expect(view.available).toBe(taka(104_000));
  });

  it("leaves an excluded account and its covered set-aside money outside the pool", async () => {
    const s = await ledger();
    const reserve = await s.setAside("Reserve", s.savings, 50_000);
    const view = await getAvailable(s.ctx);
    expect(view.earmarks).toMatchObject([
      { itemId: reserve, accountName: "Savings", covered: taka(50_000), deducted: false },
    ]);
    expect(view.coveredEarmarks).toBe(taka(0));
    expect(view.available).toBe(taka(104_000));

    // The stored flag, not the type, decides: included, Savings brings its
    // balance in and its covered money is deducted.
    s.setFlag(s.savings, true);
    expect(await available(s.ctx)).toBe(taka(104_000 + 90_000 - 50_000));
  });

  it("goes negative when obligations exceed the pool, unclamped", async () => {
    const s = await ledger();
    await s.commitment("Tuition", 150_000, "2026-10-10", s.bank, "yearly");
    expect(await available(s.ctx)).toBe(taka(-46_000));
  });

  it("follows backing through transfers: a shortfall raises Available, a refill lowers it", async () => {
    const s = await ledger();
    const laptop = await s.setAside("Laptop", s.bank, 80_000);
    expect(await available(s.ctx)).toBe(taka(24_000));

    // A card payment that leaves Bank covering everything is neutral.
    await s.transfer(s.bank, s.visa, 6_000);
    expect(await available(s.ctx)).toBe(taka(24_000));

    // Bank 94,000 → 44,000 covers only 44,000 of 80,000: Available rises by the 36,000 shortfall.
    await s.transfer(s.bank, s.bkash, 50_000);
    const short = await getAvailable(s.ctx);
    expect(short.coveredEarmarks).toBe(taka(44_000));
    expect(short.available).toBe(taka(60_000));

    // Moving 20,000 back refills part of it: Available falls again.
    await s.transfer(s.bkash, s.bank, 20_000);
    const refilled = await getAvailable(s.ctx);
    expect(refilled.coveredEarmarks).toBe(taka(64_000));
    expect(refilled.available).toBe(taka(40_000));

    // Nothing followed the money: the earmark is still 80,000 on Bank.
    const [earmark] = (await getItems(s.ctx)).find((i) => i.id === laptop)!.earmarks;
    expect(earmark).toMatchObject({ accountId: s.bank, reserved: taka(80_000) });
  });

  it("applies no archive filter: an archived account's regained balance counts by its flag", async () => {
    const s = await ledger();
    const spare = await s.account("Spare", "cash", "2026-08-01", 1_000);
    const spent = await s.expense(spare, 1_000);
    ok(await archiveAccount(s.ctx, spare));
    expect(await available(s.ctx)).toBe(taka(104_000));

    // The known Accounts gap: deleting the expense gives the archived account its 1,000 back.
    ok(await deleteTransaction(s.ctx, spent));
    const view = await getAvailable(s.ctx);
    expect(view.accounts.find((a) => a.accountId === spare)).toMatchObject({
      archived: true,
      counted: true,
      balance: taka(1_000),
    });
    expect(view.available).toBe(taka(105_000));
  });

  it("deducts covered money on an archived included account like any included account", async () => {
    const s = await ledger();
    const spare = await s.account("Spare", "cash", "2026-08-01", 5_000);
    const trip = await s.setAside("Trip", spare, 3_000);
    expect(await available(s.ctx)).toBe(taka(104_000 + 5_000 - 3_000));

    // Emptied to Bank, Spare covers nothing and archives at zero; the earmark stays.
    const moved = await s.transfer(spare, s.bank, 5_000);
    ok(await archiveAccount(s.ctx, spare));
    expect(await available(s.ctx)).toBe(taka(109_000));

    // Deleting the transfer (the known Accounts gap) gives Spare its 5,000 back:
    // it covers the 3,000 again, and that covered money is deducted.
    ok(await deleteTransaction(s.ctx, moved));
    const view = await getAvailable(s.ctx);
    expect(view.accounts.find((a) => a.accountId === spare)).toMatchObject({
      archived: true,
      counted: true,
      balance: taka(5_000),
    });
    expect(view.earmarks).toMatchObject([
      { itemId: trip, accountId: spare, covered: taka(3_000), deducted: true },
    ]);
    expect(view.available).toBe(taka(106_000));
  });

  it("splits the position's assets into included and excluded, archived accounts included", async () => {
    const s = await ledger();
    const before = await getAvailable(s.ctx);
    // Bank 100,000 + bKash 10,000 count; Savings 90,000 is owned but outside Available.
    expect(before).toMatchObject({
      includedAssetBalances: taka(110_000),
      excludedAssetBalances: taka(90_000),
      pool: taka(110_000),
    });
    expect(before.includedAssetBalances + before.excludedAssetBalances).toBe(
      (await getPosition(s.ctx)).assets,
    );

    // An excluded account that regains a balance after archiving (the known
    // Accounts gap): no archive filter, so it moves only the excluded total.
    const locker = await s.account("Locker", "savings", "2026-08-01", 3_000);
    const spent = await s.expense(locker, 3_000);
    ok(await archiveAccount(s.ctx, locker));
    ok(await deleteTransaction(s.ctx, spent));
    const after = await getAvailable(s.ctx);
    expect(after.accounts.find((a) => a.accountId === locker)).toMatchObject({
      archived: true,
      counted: false,
      balance: taka(3_000),
    });
    expect(after.excludedAssetBalances).toBe(taka(93_000));
    expect(after.available).toBe(before.available);
    expect(after.pool).toBe(before.pool);
    expect(after.includedAssetBalances + after.excludedAssetBalances).toBe(
      (await getPosition(s.ctx)).assets,
    );
  });

  it("writes no transaction or earmark when read", async () => {
    const s = await ledger();
    await s.commitment("Rent", 30_000, "2026-10-01", s.bank);
    await s.setAside("Laptop", s.bank, 80_000);
    await s.expense(s.bank, 30_000);
    const snapshot = () =>
      s.handle.sqlite
        .prepare(
          `SELECT
             (SELECT count(*) || ':' || total(amount_minor) || ':' || max(updated_at) FROM transactions) AS transactions,
             (SELECT count(*) || ':' || total(amount_minor) FROM earmark_entries) AS entries,
             (SELECT count(*) || ':' || total(priority) || ':' || count(ended_at) FROM earmarks) AS earmarks`,
        )
        .get();
    const before = snapshot();

    // The first read materialises occurrences; neither read touches the ledger or earmarks.
    await getAvailable(s.ctx);
    await getAvailable(s.ctx);
    expect(snapshot()).toEqual(before);
  });

  it("reads only the owner's own accounts, commitments and set-aside money", async () => {
    const s = await ledger();
    await s.commitment("Rent", 30_000, "2026-10-01", s.bank);
    await s.setAside("Laptop", s.bank, 20_000);
    const mine = await getAvailable(s.ctx);

    const theirs = ok(
      await createOwner(
        { db: s.ctx.db, ids: s.ctx.ids, now: s.ctx.now },
        { name: "Other", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
      ),
    );
    const other: ServiceContext = { ...s.ctx, ownerId: theirs };
    ok(
      await createAccount(other, {
        name: "Cash",
        type: "cash",
        openedOn: d("2026-08-01"),
        openingBalance: taka(7_000),
      }),
    );

    expect(await getAvailable(other)).toMatchObject({
      available: taka(7_000),
      commitments: [],
      earmarks: [],
    });
    expect((await getAvailable(other)).accounts.map((a) => a.name)).toEqual(["Cash"]);
    expect(await getAvailable(s.ctx)).toEqual(mine);
    expect(mine.available).toBe(taka(104_000 - 30_000 - 20_000));
  });
});
