import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { ZERO } from "@/domain/money";
import { recordEntry, refundExpense, removeEntry, verifyBalance } from "@/server/commands";
import { getMonthlyCashFlow, getTrends } from "@/server/services/analysis-service";

import { ok, setupLedger, taka } from "../support/ledger";

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

/**
 * Seven complete months, March to September 2026, seen on October 15:
 * salary 50,000 and rent 20,000 every month; eating out up and transport down
 * from July; a 30,000 card purchase that makes August a month in the minus; a
 * checkup in June refunded in July; and the rows that are never income or
 * spending — a transfer, its fee (which is), a card payment, a deleted
 * expense, a reconciliation adjustment — plus October's own spending.
 */
async function ledger(today = "2026-10-15") {
  const setup = await setupLedger(today);
  handle = setup.handle;
  const { ctx, category } = setup;
  const bank = await setup.account("Bank", "bank", "2026-03-01", 80_000);
  const cash = await setup.account("Cash", "cash", "2026-03-01", 30_000);
  const visa = await setup.account("Visa", "credit_card", "2026-04-10", 0);
  const record = async (input: Record<string, string>) => ok(await recordEntry(ctx, input)).ids;
  const expense = (amount: number, accountId: string, name: string, occurredOn: string) =>
    record({
      type: "expense",
      amount: String(amount),
      accountId,
      categoryId: category(name),
      occurredOn,
    });

  for (const m of ["03", "04", "05", "06", "07", "08", "09"]) {
    await record({
      type: "income",
      amount: "50000",
      accountId: bank,
      categoryId: category("Salary"),
      occurredOn: `2026-${m}-01`,
    });
    await expense(20_000, bank, "Housing", `2026-${m}-02`);
    const recent = m >= "07";
    await expense(recent ? 3_000 : 2_000, cash, "Food & Dining", `2026-${m}-12`);
    await expense(recent ? 800 : 1_000, cash, "Transport", `2026-${m}-20`);
  }
  await record({
    type: "income",
    amount: "4000",
    accountId: cash,
    categoryId: category("Other Income"),
    occurredOn: "2026-05-18",
  });
  await expense(30_000, visa, "Shopping", "2026-08-09");
  const [checkup] = await expense(2_500, bank, "Health", "2026-06-25");
  ok(
    await refundExpense(ctx, checkup!, {
      amount: "2500",
      accountId: bank,
      occurredOn: "2026-07-03",
    }),
  );
  // A cash withdrawal with a fee: the transfer is not spending; its fee is.
  await record({
    type: "transfer",
    amount: "5000",
    accountId: bank,
    counterAccountId: cash,
    fee: "25",
    feeCategoryId: category("Fees & Charges"),
    occurredOn: "2026-05-05",
  });
  // The card payment is a transfer to the liability.
  await record({
    type: "transfer",
    amount: "30000",
    accountId: bank,
    counterAccountId: visa,
    occurredOn: "2026-09-11",
  });
  const [mistake] = await expense(7_777, cash, "Shopping", "2026-04-14");
  ok(await removeEntry(ctx, mistake!));
  // Counted 500 less cash than the recorded 15,600: an adjustment, never spending.
  const verified = ok(
    await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-25", countedAmount: "15100" }),
  );
  expect(verified.adjusted).toBe(true);
  // October is the current month: Cash flow's, never Trends'.
  await expense(9_999, bank, "Shopping", "2026-10-05");

  return { ...setup, bank, cash, visa };
}

const row = (month: string, income: number, spending: number) => ({
  month,
  income: taka(income),
  spending: taka(spending),
  leftOver: taka(income - spending),
});

describe("getTrends", () => {
  it("shows the last six complete months by default, oldest first, without the current month", async () => {
    const { ctx } = await ledger();
    const trends = await getTrends(ctx);
    expect(trends.length).toBe(6);
    expect(
      trends.months.map(({ month, income, spending, leftOver }) => ({
        month,
        income,
        spending,
        leftOver,
      })),
    ).toEqual([
      row("2026-04", 50_000, 23_000),
      row("2026-05", 54_000, 23_025),
      row("2026-06", 50_000, 25_500),
      row("2026-07", 50_000, 21_300),
      row("2026-08", 50_000, 53_800),
      row("2026-09", 50_000, 23_800),
    ]);
    expect(trends.months[0]!.range).toEqual({ start: "2026-04-01", end: "2026-05-01" });
  });

  it("draws a month that spent more than came in as a negative left over", async () => {
    const { ctx } = await ledger();
    const august = (await getTrends(ctx)).months.find((m) => m.month === "2026-08")!;
    expect(august.leftOver).toBe(taka(-3_800));
  });

  it("has exactly Cash flow's figures for every month it shows", async () => {
    const { ctx } = await ledger();
    for (const m of (await getTrends(ctx, "12")).months) {
      const flow = await getMonthlyCashFlow(ctx, m.month);
      expect(flow.period).toMatchObject({ month: m.month, kind: "complete", range: m.range });
      expect([m.income, m.spending, m.leftOver]).toEqual([
        flow.summary.income,
        flow.summary.spending,
        flow.summary.leftOver,
      ]);
    }
  });

  it("explains the recent three months against the earlier three with exact totals", async () => {
    const { ctx } = await ledger();
    const { change } = await getTrends(ctx);
    expect(change!.earlier.months).toEqual(["2026-04", "2026-05", "2026-06"]);
    expect(change!.recent.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(change!.earlier.range).toEqual({ start: "2026-04-01", end: "2026-07-01" });
    expect(change!.recent.range).toEqual({ start: "2026-07-01", end: "2026-10-01" });

    const e = change!.explanation;
    expect(e.previousTotal).toBe(taka(23_000 + 23_025 + 25_500));
    expect(e.currentTotal).toBe(taka(21_300 + 53_800 + 23_800));
    expect(e.net).toBe(taka(27_375));
    const lines = (ls: typeof e.increases) => ls.map((l) => [l.name, l.change, l.material]);
    expect(lines(e.increases)).toEqual([
      ["Shopping", taka(30_000), true],
      ["Food & Dining", taka(3_000), true],
    ]);
    // The June checkup and its July refund: +2,500 before, −2,500 after.
    expect(lines(e.offsets)).toEqual([
      ["Health", taka(-5_000), true],
      ["Transport", taka(-600), true],
      ["Fees & Charges", taka(-25), false],
    ]);
    expect(e.unchanged.map((l) => l.name)).toEqual(["Housing"]);
    expect(e.smallerChanges).toEqual({ count: 1, net: taka(-25) });
  });

  it("covers the whole history when it is shorter than twelve months, leaving the middle month out of both halves", async () => {
    const { ctx } = await ledger();
    const trends = await getTrends(ctx, "12");
    expect(trends.length).toBe(12);
    expect(trends.months.map((m) => m.month)).toEqual([
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(trends.change!.earlier.months).toEqual(["2026-03", "2026-04", "2026-05"]);
    expect(trends.change!.recent.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    // March 23,000 + April 23,000 + May 23,025; June is in neither half.
    expect(trends.change!.explanation.previousTotal).toBe(taka(69_025));
  });

  it.each([
    ["nothing", undefined],
    ["three months", "3"],
    ["a malformed length", "12months"],
    ["garbage", "../etc"],
  ])("shows six months for %s", async (_, requested) => {
    const { ctx } = await ledger();
    const trends = await getTrends(ctx, requested);
    expect(trends.length).toBe(6);
    expect(trends.months).toHaveLength(6);
  });

  it("starts at the first month the ledger describes completely", async () => {
    const setup = await setupLedger("2026-10-15");
    handle = setup.handle;
    // Opened part-way through July: July holds only part of that month's money.
    await setup.account("Bank", "bank", "2026-07-20", 10_000);
    const trends = await getTrends(setup.ctx);
    expect(trends.months.map((m) => m.month)).toEqual(["2026-08", "2026-09"]);
    // Two months are not yet a trend: nothing to compare.
    expect(trends.change).toBeNull();
  });

  it("shows quiet months as zero, and nothing at all with no accounts", async () => {
    const setup = await setupLedger("2026-10-15");
    handle = setup.handle;
    expect(await getTrends(setup.ctx)).toEqual({ length: 6, months: [], change: null });

    await setup.account("Bank", "bank", "2026-06-01", 10_000);
    const trends = await getTrends(setup.ctx);
    expect(trends.months.map((m) => [m.month, m.income, m.spending, m.leftOver])).toEqual([
      ["2026-06", ZERO, ZERO, ZERO],
      ["2026-07", ZERO, ZERO, ZERO],
      ["2026-08", ZERO, ZERO, ZERO],
      ["2026-09", ZERO, ZERO, ZERO],
    ]);
    expect(trends.change!.explanation).toMatchObject({
      net: ZERO,
      increases: [],
      offsets: [],
      unchanged: [],
    });
  });

  it("follows the clock: when a month ends it joins the trend", async () => {
    const { ctx } = await ledger("2026-11-01");
    const trends = await getTrends(ctx);
    expect(trends.months.at(-1)).toMatchObject({
      month: "2026-10",
      income: ZERO,
      spending: taka(9_999),
    });
  });
});
