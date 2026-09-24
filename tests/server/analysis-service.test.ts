import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { fixedClock } from "@/domain/clock";
import { formatPercent } from "@/domain/ledger/analytics";
import { ZERO } from "@/domain/money";
import {
  archiveCategory,
  recordEntry,
  refundExpense,
  removeEntry,
  verifyBalance,
} from "@/server/commands";
import type { ServiceContext } from "@/server/context";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";
import { getTotalSpending } from "@/server/services/ledger-service";
import { createAccount, createOwner, getCategories } from "@/server/services/setup-service";

import { buildSeptember2026 } from "../../acceptance/fixtures/september-2026";
import { d, ok, setupLedger, taka } from "../support/ledger";

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

const names = (lines: readonly { name: string }[]) => lines.map((l) => l.name);

describe("getMonthlyCashFlow on the acceptance scenario", () => {
  it("reports September to date and the whole of August", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;

    // Clock at Sep 22: September is month-to-date (Sep 1–22).
    const september = await getMonthlyCashFlow(s.ctx);
    expect(september.period).toEqual({
      month: "2026-09",
      kind: "month_to_date",
      range: { start: "2026-09-01", end: "2026-09-23" },
    });
    expect(september.summary).toEqual({
      income: taka(95_000),
      spending: taka(66_487),
      leftOver: taka(28_513),
      savingsRate: { numerator: taka(28_513), denominator: taka(95_000) },
    });
    expect(names(september.composition.spent)).toEqual([
      "Health",
      "Housing",
      "Groceries",
      "Shopping",
      "Food & Dining",
      "Fees & Charges",
    ]);
    // The jacket refund nets inside Shopping: 3,000 − 1,200.
    expect(september.composition.spent[3]!.amount).toBe(taka(1_800));
    expect(september.months).toEqual(["2026-09", "2026-08"]);

    // August is complete: it includes the Aug 25 internet bill that the
    // like-for-like Aug 1–22 window (A-07) leaves out.
    const august = await getMonthlyCashFlow(s.ctx, "2026-08");
    expect(august.period.kind).toBe("complete");
    expect(august.summary.income).toBe(taka(95_000));
    expect(august.summary.spending).toBe(taka(41_537));
    expect(august.summary.leftOver).toBe(taka(53_463));
    expect(formatPercent(august.summary.savingsRate!)).toBe("56.3%");
    expect(names(august.composition.spent)).toEqual([
      "Housing",
      "Groceries",
      "Shopping",
      "Utilities",
      "Food & Dining",
      "Fees & Charges",
    ]);
  });

  it("explains September to date against Aug 1–22, and has nothing before August", async () => {
    const s = await buildSeptember2026();
    handle = s.handle;

    const { change } = await getMonthlyCashFlow(s.ctx);
    expect(change!.comparison).toEqual({
      month: "2026-08",
      kind: "same_days",
      range: { start: "2026-08-01", end: "2026-08-23" },
    });
    expect(change!.explanation).toMatchObject({
      currentTotal: taka(66_487),
      previousTotal: taka(40_037),
      net: taka(26_450),
      grossIncreases: taka(30_000),
    });

    // August is the first month with accounts: there is no earlier month.
    expect((await getMonthlyCashFlow(s.ctx, "2026-08")).change).toBeNull();
  });
});

/**
 * One month with every kind of row: income, expenses, a card purchase and its
 * payment, a cash-out with a fee, a refund, a reconciliation adjustment and
 * opening balances. Only income, expenses and refunds may count.
 */
async function ledger(today = "2026-09-22") {
  const setup = await setupLedger(today);
  handle = setup.handle;
  const { ctx, category } = setup;
  const bank = await setup.account("Bank", "bank", "2026-07-15", 50_000);
  const bkash = await setup.account("bKash", "mobile_wallet", "2026-08-01", 9_000);
  const cash = await setup.account("Cash", "cash", "2026-09-01", 2_000);
  const visa = await setup.account("Visa", "credit_card", "2026-08-01", 0);
  const record = async (input: Record<string, string>) => ok(await recordEntry(ctx, input)).ids;
  const expense = (amount: string, accountId: string, name: string, occurredOn: string) =>
    record({ type: "expense", amount, accountId, categoryId: category(name), occurredOn });

  await record({
    type: "income",
    amount: "60000",
    accountId: bank,
    categoryId: category("Salary"),
    occurredOn: "2026-09-01",
  });
  await expense("20000", bank, "Housing", "2026-09-02");
  const [jacket] = await expense("3000", visa, "Shopping", "2026-09-05");
  // Card payment: a transfer to the liability, never spending.
  await record({
    type: "transfer",
    amount: "3000",
    accountId: bank,
    counterAccountId: visa,
    occurredOn: "2026-09-10",
  });
  // Cash-out: the transfer does not count, its fee does.
  await record({
    type: "transfer",
    amount: "2000",
    accountId: bkash,
    counterAccountId: cash,
    fee: "37",
    feeCategoryId: category("Fees & Charges"),
    occurredOn: "2026-09-12",
  });
  ok(
    await refundExpense(ctx, jacket!, {
      amount: "1200",
      accountId: visa,
      occurredOn: "2026-09-15",
    }),
  );
  // Counted 3,500 in Cash where the ledger says 4,000: a −500 adjustment.
  const verified = ok(
    await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-18", countedAmount: "3500" }),
  );
  expect(verified.adjusted).toBe(true);

  return { ...setup, bank, bkash, cash, visa, record, expense };
}

describe("getMonthlyCashFlow", () => {
  it("counts only income, expenses and refunds", async () => {
    const { ctx } = await ledger();
    const flow = await getMonthlyCashFlow(ctx);
    // 20,000 rent + (3,000 − 1,200) jacket + 37 fee. Opening balances, the card
    // payment, the cash-out and the −500 adjustment contribute nothing.
    expect(flow.summary).toEqual({
      income: taka(60_000),
      spending: taka(21_837),
      leftOver: taka(38_163),
      savingsRate: { numerator: taka(38_163), denominator: taka(60_000) },
    });
    expect(flow.composition.spent.map((l) => [l.name, l.amount])).toEqual([
      ["Housing", taka(20_000)],
      ["Shopping", taka(1_800)],
      ["Fees & Charges", taka(37)],
    ]);
    expect(flow.composition.total).toBe(await getTotalSpending(ctx, flow.period.range));
  });

  it("leaves out soft-deleted transactions", async () => {
    const { ctx, cash, expense } = await ledger();
    const [dinner] = await expense("900", cash, "Food & Dining", "2026-09-20");
    expect((await getMonthlyCashFlow(ctx)).summary.spending).toBe(taka(22_737));

    ok(await removeEntry(ctx, dinner!));
    const after = await getMonthlyCashFlow(ctx);
    expect(after.summary.spending).toBe(taka(21_837));
    expect(names(after.composition.spent)).not.toContain("Food & Dining");
  });

  it("shows a category whose refunds exceed its spending apart, outside the shares", async () => {
    const { ctx, visa, expense } = await ledger();
    const [checkup] = await expense("2500", visa, "Health", "2026-08-20");
    ok(
      await refundExpense(ctx, checkup!, {
        amount: "2500",
        accountId: visa,
        occurredOn: "2026-09-19",
      }),
    );

    const flow = await getMonthlyCashFlow(ctx);
    expect(flow.summary.spending).toBe(taka(19_337));
    expect(flow.composition.refundedMoreThanSpent.map((l) => [l.name, l.amount, l.share])).toEqual([
      ["Health", taka(-2_500), null],
    ]);
    // Shares are over the 21,837 actually spent, not the 19,337 net.
    expect(flow.composition.spent[0]!.share).toEqual({
      numerator: taka(20_000),
      denominator: taka(21_837),
    });
  });

  it("keeps an archived category's name", async () => {
    const { ctx, category } = await ledger();
    ok(await archiveCategory(ctx, category("Shopping")));
    expect(names((await getMonthlyCashFlow(ctx)).composition.spent)).toContain("Shopping");
  });

  it("offers quiet months, and shows them as zero", async () => {
    const { ctx } = await ledger();
    const flow = await getMonthlyCashFlow(ctx, "2026-07");
    expect(flow.months).toEqual(["2026-09", "2026-08", "2026-07"]);
    expect(flow.period).toMatchObject({ month: "2026-07", kind: "complete" });
    expect(flow.summary).toEqual({
      income: ZERO,
      spending: ZERO,
      leftOver: ZERO,
      savingsRate: null,
    });
    expect(flow.composition).toEqual({ total: ZERO, spent: [], refundedMoreThanSpent: [] });
  });

  it("has no savings rate in a month with spending but no income", async () => {
    const { ctx, bank, expense } = await ledger();
    await expense("700", bank, "Transport", "2026-08-10");
    const flow = await getMonthlyCashFlow(ctx, "2026-08");
    expect(flow.summary).toEqual({
      income: ZERO,
      spending: taka(700),
      leftOver: taka(-700),
      savingsRate: null,
    });
  });

  it.each([
    ["no month", undefined],
    ["a future month", "2026-10"],
    ["a month before the first account", "2026-06"],
    ["a malformed month", "2026-9"],
    ["garbage", "../etc"],
  ])("falls back to the current month for %s", async (_, requested) => {
    const { ctx } = await ledger();
    const flow = await getMonthlyCashFlow(ctx, requested);
    expect(flow.period).toMatchObject({ month: "2026-09", kind: "month_to_date" });
    expect(flow.summary.spending).toBe(taka(21_837));
  });

  it("follows the clock: rows after today stay out, and a finished month becomes complete", async () => {
    // Recorded while the clock reads Sep 30, so the Sep 25 row is legitimate.
    const { ctx, bank, expense } = await ledger("2026-09-30");
    await expense("1000", bank, "Groceries", "2026-09-25");

    const at = (today: string): ServiceContext => ({ ...ctx, clock: fixedClock(d(today)) });

    // Read as of Sep 22, the month-to-date range ends before Sep 25.
    const sep22 = await getMonthlyCashFlow(at("2026-09-22"));
    expect(sep22.period.range.end).toBe("2026-09-23");
    expect(sep22.summary.spending).toBe(taka(21_837));

    // On Sep 30 it is included; on Oct 1 September is a complete month and
    // October (just the 1st) is the default.
    expect((await getMonthlyCashFlow(at("2026-09-30"))).summary.spending).toBe(taka(22_837));
    const oct1 = await getMonthlyCashFlow(at("2026-10-01"));
    expect(oct1.period).toEqual({
      month: "2026-10",
      kind: "month_to_date",
      range: { start: "2026-10-01", end: "2026-10-02" },
    });
    expect(oct1.summary.spending).toBe(ZERO);
    const september = await getMonthlyCashFlow(at("2026-10-01"), "2026-09");
    expect(september.period.kind).toBe("complete");
    expect(september.summary.spending).toBe(taka(22_837));
  });

  it("compares the month to date with the same days of the previous month", async () => {
    const { ctx, bank, bkash, expense, category } = await ledger();
    await expense("18000", bank, "Housing", "2026-08-03");
    await expense("900", bkash, "Groceries", "2026-08-10");
    // After Aug 22: outside the like-for-like window.
    await expense("2000", bank, "Transport", "2026-08-28");
    // Deleted: never part of either period.
    const [deleted] = await expense("5000", bank, "Health", "2026-08-05");
    ok(await removeEntry(ctx, deleted!));
    // Archived categories keep their history and their name.
    ok(await archiveCategory(ctx, category("Groceries")));

    const { change } = await getMonthlyCashFlow(ctx);
    expect(change!.comparison.range).toEqual({ start: "2026-08-01", end: "2026-08-23" });
    const e = change!.explanation;
    // 21,837 this month (see above) against 18,000 + 900.
    expect(e).toMatchObject({
      currentTotal: taka(21_837),
      previousTotal: taka(18_900),
      net: taka(2_937),
      grossIncreases: taka(3_837),
      grossDecreases: taka(900),
      // The fee: +37 is below ৳500.
      smallerChanges: { count: 1, net: taka(37) },
    });
    expect(e.increases.map((l) => [l.name, l.change, l.material])).toEqual([
      ["Housing", taka(2_000), true],
      ["Shopping", taka(1_800), true],
      ["Fees & Charges", taka(37), false],
    ]);
    expect(e.offsets.map((l) => [l.name, l.change, l.material])).toEqual([
      ["Groceries", taka(-900), true],
    ]);
  });

  it("compares a complete month with the whole previous month, back to the first month", async () => {
    const { ctx, bank, expense } = await ledger();
    await expense("18000", bank, "Housing", "2026-08-03");
    await expense("2000", bank, "Transport", "2026-08-28");
    await expense("600", bank, "Transport", "2026-07-20");

    const august = (await getMonthlyCashFlow(ctx, "2026-08")).change!;
    expect(august.comparison).toEqual({
      month: "2026-07",
      kind: "complete",
      range: { start: "2026-07-01", end: "2026-08-01" },
    });
    expect(august.explanation).toMatchObject({
      currentTotal: taka(20_000),
      previousTotal: taka(600),
      net: taka(19_400),
    });
    // July holds the first account: nothing earlier to compare with.
    expect((await getMonthlyCashFlow(ctx, "2026-07")).change).toBeNull();
  });

  it("never sees another owner's ledger", async () => {
    const { ctx } = await ledger();
    const otherId = ok(
      await createOwner(
        { db: ctx.db, ids: ctx.ids, now: ctx.now },
        { name: "Other", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
      ),
    );
    const other: ServiceContext = { ...ctx, ownerId: otherId };
    const account = ok(
      await createAccount(other, { name: "Other bank", type: "bank", openedOn: d("2025-01-01") }),
    );
    const groceries = (await getCategories(other)).find((c) => c.name === "Groceries")!.id;
    ok(
      await recordEntry(other, {
        type: "expense",
        amount: "9999",
        accountId: account,
        categoryId: groceries,
        occurredOn: "2026-09-03",
      }),
    );

    const mine = await getMonthlyCashFlow(ctx);
    expect(mine.summary.spending).toBe(taka(21_837));
    expect(mine.months.at(-1)).toBe("2026-07");
    expect(mine.change!.explanation.currentTotal).toBe(taka(21_837));
    expect((await getMonthlyCashFlow(other)).summary.spending).toBe(taka(9_999));
  });
});
