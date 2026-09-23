import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import {
  archiveAccount,
  deleteAccount,
  editEntry,
  editOpeningBalance,
  openAccount,
  recordEntry,
  refundExpense,
  removeEntry,
  restoreAccount,
  restoreEntry,
  verifyBalance,
} from "@/server/commands";
import { getAccountBalances, getTransactions } from "@/server/services/ledger-service";
import { getAccounts } from "@/server/services/setup-service";

import { ok, setupLedger, taka } from "../support/ledger";

/**
 * The commands behind the UI's server actions: untrusted input in, ledger
 * writes through the services, failures placed on the field to fix.
 */
let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  return {
    ...setup,
    bank: await setup.account("Bank", "bank", "2026-08-01", 85_000),
    cash: await setup.account("Cash", "cash", "2026-08-01", 3_000),
    bkash: await setup.account("bKash", "mobile_wallet", "2026-08-01", 6_000),
    visa: await setup.account("Visa", "credit_card", "2026-08-01", -12_000),
  };
}

const balance = async (ctx: Parameters<typeof getAccountBalances>[0], id: string) =>
  (await getAccountBalances(ctx)).find((b) => b.accountId === id)!.balance;

describe("recordEntry", () => {
  it("records a Quick Add expense and reports the account's balance before and after", async () => {
    const { ctx, cash, category } = await ledger();
    const result = ok(
      await recordEntry(ctx, {
        type: "expense",
        amount: "450",
        accountId: cash,
        categoryId: category("Food & Dining"),
        occurredOn: "2026-09-22",
        description: "Lunch",
      }),
    );
    expect(result.ids).toHaveLength(1);
    expect(result.effects).toEqual([
      { accountId: cash, name: "Cash", before: taka(3_000), after: taka(2_550) },
    ]);
  });

  it("records a transfer with a fee as one group and reports both accounts", async () => {
    const { ctx, bkash, cash, category } = await ledger();
    const result = ok(
      await recordEntry(ctx, {
        type: "transfer",
        amount: "2000",
        accountId: bkash,
        counterAccountId: cash,
        fee: "37",
        feeCategoryId: category("Fees & Charges"),
        occurredOn: "2026-09-14",
        description: "Cash-out",
      }),
    );
    expect(result.ids).toHaveLength(2);
    expect(result.effects.map((e) => [e.name, e.after])).toEqual([
      ["bKash", taka(3_963)],
      ["Cash", taka(5_000)],
    ]);
    const rows = (await getTransactions(ctx)).filter((t) => result.ids.includes(t.id));
    expect(new Set(rows.map((r) => r.groupId)).size).toBe(1);
  });

  it("places validation and rule failures on the field to fix", async () => {
    const { ctx, cash, category } = await ledger();
    const invalid = await recordEntry(ctx, {
      type: "expense",
      amount: "0",
      accountId: cash,
      categoryId: category("Other"),
      occurredOn: "2026-09-22",
    });
    expect(invalid).toMatchObject({ ok: false, fieldErrors: { amount: expect.any(String) } });

    const future = await recordEntry(ctx, {
      type: "expense",
      amount: "10",
      accountId: cash,
      categoryId: category("Other"),
      occurredOn: "2026-09-23",
    });
    expect(future).toMatchObject({ ok: false, fieldErrors: { occurredOn: expect.any(String) } });

    const wrongKind = await recordEntry(ctx, {
      type: "income",
      amount: "10",
      accountId: cash,
      categoryId: category("Other"),
      occurredOn: "2026-09-22",
    });
    expect(wrongKind).toMatchObject({ ok: false, fieldErrors: { categoryId: expect.any(String) } });
  });
});

describe("editing, refunds, delete and undo", () => {
  it("changes an expense into a card payment in place and balances recompute", async () => {
    const { ctx, bank, visa, category } = await ledger();
    const [id] = ok(
      await recordEntry(ctx, {
        type: "expense",
        amount: "12000",
        accountId: bank,
        categoryId: category("Other"),
        occurredOn: "2026-09-10",
      }),
    ).ids;
    expect(await balance(ctx, visa)).toBe(taka(-12_000));
    ok(
      await editEntry(ctx, id!, {
        type: "transfer",
        amount: "12000",
        accountId: bank,
        counterAccountId: visa,
        occurredOn: "2026-09-10",
      }),
    );
    expect(await balance(ctx, visa)).toBe(0);
    expect(await balance(ctx, bank)).toBe(taka(73_000));
    expect((await getTransactions(ctx)).find((t) => t.id === id)?.type).toBe("transfer");
  });

  it("refunds an expense into its own category, and blocks deleting a refunded expense", async () => {
    const { ctx, visa, category } = await ledger();
    const [jacket] = ok(
      await recordEntry(ctx, {
        type: "expense",
        amount: "3000",
        accountId: visa,
        categoryId: category("Shopping"),
        occurredOn: "2026-09-08",
      }),
    ).ids;
    const [refund] = ok(
      await refundExpense(ctx, jacket!, {
        amount: "1200",
        accountId: visa,
        occurredOn: "2026-09-16",
      }),
    ).ids;
    const row = (await getTransactions(ctx)).find((t) => t.id === refund);
    expect(row).toMatchObject({
      type: "refund",
      categoryId: category("Shopping"),
      refundOfId: jacket,
    });

    expect(await removeEntry(ctx, jacket!)).toMatchObject({ ok: false });
  });

  it("deletes a whole transfer group and Undo restores it", async () => {
    const { ctx, bkash, cash, category } = await ledger();
    const { ids } = ok(
      await recordEntry(ctx, {
        type: "transfer",
        amount: "2000",
        accountId: bkash,
        counterAccountId: cash,
        fee: "37",
        feeCategoryId: category("Fees & Charges"),
        occurredOn: "2026-09-14",
      }),
    );
    expect(ok(await removeEntry(ctx, ids[1]!)).sort()).toEqual([...ids].sort());
    expect(await balance(ctx, bkash)).toBe(taka(6_000));
    ok(await restoreEntry(ctx, ids[0]!));
    expect(await balance(ctx, bkash)).toBe(taka(3_963));
  });

  it("edits an opening balance by the amount a person types, signed by the account type", async () => {
    const { ctx, visa } = await ledger();
    const opening = (await getTransactions(ctx)).find(
      (t) => t.accountId === visa && t.type === "opening_balance",
    )!;
    ok(await editOpeningBalance(ctx, opening.id, { startingAmount: "3,200" }));
    expect(await balance(ctx, visa)).toBe(taka(-3_200));
  });
});

describe("accounts", () => {
  it("opens an account; a card's starting amount is owed", async () => {
    const { ctx } = await ledger();
    const id = ok(
      await openAccount(ctx, {
        name: "Amex",
        type: "credit_card",
        openedOn: "2026-09-01",
        startingAmount: "500",
      }),
    );
    expect(await balance(ctx, id)).toBe(taka(-500));
    expect(
      await openAccount(ctx, {
        name: "amex",
        type: "cash",
        openedOn: "2026-09-01",
        startingAmount: "",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { name: expect.any(String) } });
    expect(
      await openAccount(ctx, {
        name: "Later",
        type: "cash",
        openedOn: "2026-09-30",
        startingAmount: "",
      }),
    ).toMatchObject({ ok: false, fieldErrors: { openedOn: expect.any(String) } });
  });

  it("archives only at a zero balance, deletes only when never used, and restores", async () => {
    const { ctx, cash } = await ledger();
    expect(await archiveAccount(ctx, cash)).toMatchObject({ ok: false });

    const empty = ok(
      await openAccount(ctx, {
        name: "Spare",
        type: "cash",
        openedOn: "2026-09-01",
        startingAmount: "",
      }),
    );
    ok(await archiveAccount(ctx, empty));
    expect((await getAccounts(ctx)).find((a) => a.id === empty)?.archivedAt).not.toBeNull();
    ok(await restoreAccount(ctx, empty));
    ok(await deleteAccount(ctx, empty));
    expect((await getAccounts(ctx)).some((a) => a.id === empty)).toBe(false);

    expect(await deleteAccount(ctx, cash)).toMatchObject({ ok: false });
  });
});

describe("verifyBalance", () => {
  it("records what was counted and reports the correction", async () => {
    const { ctx, cash } = await ledger();
    const result = ok(
      await verifyBalance(ctx, {
        accountId: cash,
        asOf: "2026-09-20",
        countedAmount: "2,650",
      }),
    );
    expect(result).toEqual({
      recorded: taka(3_000),
      stated: taka(2_650),
      difference: taka(-350),
      adjusted: true,
    });
    expect((await getAccountBalances(ctx)).find((b) => b.accountId === cash)?.balance).toBe(
      taka(2_650),
    );
  });

  it("reports agreement without adjusting", async () => {
    const { ctx, cash } = await ledger();
    const result = ok(
      await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-20", countedAmount: "3000" }),
    );
    expect(result).toMatchObject({ difference: 0, adjusted: false });
  });

  it("accepts an emptied account", async () => {
    const { ctx, cash } = await ledger();
    const result = ok(
      await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-20", countedAmount: "0" }),
    );
    expect(result).toMatchObject({ stated: 0, difference: taka(-3_000), adjusted: true });
  });

  it("puts a bad amount and a bad date on the field to fix", async () => {
    const { ctx, cash } = await ledger();
    expect(
      await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-20", countedAmount: "-5" }),
    ).toMatchObject({ ok: false, fieldErrors: { countedAmount: expect.any(String) } });

    expect(
      await verifyBalance(ctx, { accountId: cash, asOf: "nonsense", countedAmount: "100" }),
    ).toMatchObject({ ok: false, fieldErrors: { asOf: expect.any(String) } });

    // A rule rejection (not a schema one) is mapped onto the same field.
    expect(
      await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-23", countedAmount: "100" }),
    ).toMatchObject({ ok: false, fieldErrors: { asOf: expect.any(String) } });
  });

  it("rejects an unknown account", async () => {
    const { ctx } = await ledger();
    expect(
      await verifyBalance(ctx, { accountId: "nope", asOf: "2026-09-20", countedAmount: "100" }),
    ).toMatchObject({ ok: false });
  });
});
