import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { yearMonth } from "@/domain/calendar-date";
import {
  getActivity,
  getActivityItem,
  getActivityMonths,
  getEntryDefaults,
} from "@/server/services/activity-service";
import {
  addCategory,
  archiveCategory,
  deleteCategory,
  recordEntry,
  refundExpense,
  removeEntry,
  renameCategory,
  restoreCategory,
} from "@/server/commands";
import { getCategories } from "@/server/services/setup-service";

import { ok, setupLedger, taka } from "../support/ledger";

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

/** A small ledger: salary, groceries, a card jacket with a refund, a cash-out with a fee. */
async function ledger() {
  const setup = await setupLedger();
  handle = setup.handle;
  const { ctx, category } = setup;
  const bank = await setup.account("Bank", "bank", "2026-08-01", 20_000);
  const bkash = await setup.account("bKash", "mobile_wallet", "2026-08-01", 9_000);
  const cash = await setup.account("Cash", "cash", "2026-08-01", 2_000);
  const visa = await setup.account("Visa", "credit_card", "2026-08-01");
  const record = async (input: Record<string, string>) => ok(await recordEntry(ctx, input)).ids;

  await record({
    type: "income",
    amount: "95000",
    accountId: bank,
    categoryId: category("Salary"),
    occurredOn: "2026-09-01",
    description: "Salary",
  });
  await record({
    type: "expense",
    amount: "4200",
    accountId: visa,
    categoryId: category("Groceries"),
    occurredOn: "2026-09-05",
    description: "Shwapno",
  });
  const [jacket] = await record({
    type: "expense",
    amount: "3000",
    accountId: visa,
    categoryId: category("Shopping"),
    occurredOn: "2026-09-08",
    description: "Jacket",
  });
  const [cashOut, fee] = await record({
    type: "transfer",
    amount: "2000",
    accountId: bkash,
    counterAccountId: cash,
    fee: "37",
    feeCategoryId: category("Fees & Charges"),
    occurredOn: "2026-09-14",
    description: "Cash-out",
  });
  const [refund] = ok(
    await refundExpense(ctx, jacket!, {
      amount: "1200",
      accountId: visa,
      occurredOn: "2026-09-16",
      description: "Jacket refund",
    }),
  ).ids;
  await record({
    type: "expense",
    amount: "1200",
    accountId: cash,
    categoryId: category("Food & Dining"),
    occurredOn: "2026-08-15",
    description: "Dinner",
  });
  return {
    ...setup,
    bank,
    bkash,
    cash,
    visa,
    jacket: jacket!,
    cashOut: cashOut!,
    fee: fee!,
    refund: refund!,
  };
}

describe("the Activity list", () => {
  it("lists events newest first, folding a transfer and its fee into one item", async () => {
    const { ctx, cashOut, fee, refund, jacket } = await ledger();
    const { items } = await getActivity(ctx);
    const september = items.filter((i) => i.occurredOn.startsWith("2026-09"));
    expect(september.map((i) => i.primary.description)).toEqual([
      "Jacket refund",
      "Cash-out",
      "Jacket",
      "Shwapno",
      "Salary",
    ]);
    const group = items.find((i) => i.primary.id === cashOut)!;
    expect(group.fee?.id).toBe(fee);
    expect(group.primary.counterAccount?.name).toBe("Cash");
    expect(items.find((i) => i.primary.id === refund)?.refundOf?.id).toBe(jacket);
    // Opening balances are ledger facts and appear too.
    expect(items.filter((i) => i.primary.type === "opening_balance")).toHaveLength(3);
  });

  it("filters by month, account (either side of a transfer), category and type", async () => {
    const { ctx, cash, category } = await ledger();
    const sep = await getActivity(ctx, { month: yearMonth(2026, 9) });
    expect(sep.items.every((i) => i.occurredOn.startsWith("2026-09"))).toBe(true);

    const cashItems = await getActivity(ctx, { accountId: cash, month: yearMonth(2026, 9) });
    expect(cashItems.items.map((i) => i.primary.description)).toEqual(["Cash-out"]);

    const fees = await getActivity(ctx, { categoryId: category("Fees & Charges") });
    expect(fees.items).toHaveLength(1);
    expect(fees.items[0]!.primary.type).toBe("transfer");

    const refunds = await getActivity(ctx, { type: "refund" });
    expect(refunds.items.map((i) => i.primary.description)).toEqual(["Jacket refund"]);
  });

  it("searches descriptions, categories and account names case-insensitively, and typed amounts", async () => {
    const { ctx } = await ledger();
    const names = async (text: string) =>
      (await getActivity(ctx, { text })).items.map((i) => i.primary.description);
    expect(await names("jacket")).toEqual(["Jacket refund", "Jacket"]);
    expect(await names("GROCERIES")).toEqual(["Shwapno"]);
    expect(await names("4,200")).toEqual(["Shwapno"]);
    expect(await names("100%")).toEqual([]);
  });

  it("totals what is shown: spending net of refunds, and income", async () => {
    const { ctx } = await ledger();
    const { summary } = await getActivity(ctx, { month: yearMonth(2026, 9) });
    // 4,200 + 3,000 + 37 − 1,200 refunded
    expect(summary.spending).toBe(taka(6_037));
    expect(summary.income).toBe(taka(95_000));
  });

  it("hides deleted rows and finds a single event for editing", async () => {
    const { ctx, fee, cashOut } = await ledger();
    const item = await getActivityItem(ctx, fee);
    expect(item?.primary.id).toBe(cashOut);
    ok(await removeEntry(ctx, cashOut));
    expect(await getActivityItem(ctx, fee)).toBeNull();
    expect((await getActivity(ctx)).items.some((i) => i.primary.id === cashOut)).toBe(false);
  });

  it("lists the months that have activity, newest first", async () => {
    const { ctx } = await ledger();
    expect(await getActivityMonths(ctx)).toEqual(["2026-09", "2026-08"]);
  });
});

describe("Quick Add defaults", () => {
  it("remembers the most recently recorded account and category per type", async () => {
    const { ctx, cash, bkash, category } = await ledger();
    const defaults = await getEntryDefaults(ctx);
    expect(defaults.expense).toEqual({ accountId: cash, categoryId: category("Food & Dining") });
    expect(defaults.transfer).toEqual({ accountId: bkash, counterAccountId: cash });
    expect(defaults.frequentCategoryIds.expense).toContain(category("Groceries"));
    expect(defaults.frequentCategoryIds.income).toEqual([category("Salary")]);
  });
});

describe("category management", () => {
  it("adds, renames, archives and restores; deletes only unused categories", async () => {
    const { ctx, category } = await ledger();
    const id = ok(await addCategory(ctx, { name: "Education", kind: "expense" }));
    expect(await addCategory(ctx, { name: "education", kind: "expense" })).toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
    });
    ok(await renameCategory(ctx, id, "Tuition"));
    expect(await renameCategory(ctx, id, "Groceries")).toMatchObject({ ok: false });
    ok(await archiveCategory(ctx, id));
    expect((await getCategories(ctx)).find((c) => c.id === id)?.archivedAt).not.toBeNull();
    ok(await restoreCategory(ctx, id));
    ok(await deleteCategory(ctx, id));
    expect(await deleteCategory(ctx, category("Groceries"))).toMatchObject({ ok: false });
  });
});
