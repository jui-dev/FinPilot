import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { ZERO } from "@/domain/money";
import {
  createCommitment,
  payOccurrence,
  recordEntry,
  refundExpense,
  removeEntry,
  skipOccurrence,
  verifyBalance,
} from "@/server/commands";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";
import { getMonthCalendar } from "@/server/services/calendar-service";
import { getOccurrences } from "@/server/services/commitment-service";
import { getAccountBalances } from "@/server/services/ledger-service";

import { ok, setupLedger, taka } from "../support/ledger";

let handle: DatabaseHandle | undefined;
afterEach(() => handle?.close());

/**
 * September 2026, seen on the 22nd. Salary on the 1st with a cash withdrawal
 * and its fee; rent due on the 3rd but paid on the 5th; the gym skipped on the
 * 15th; internet overdue since the 20th; the phone bill due today; water
 * upcoming on the 28th. A card purchase and a larger refund two days later, a
 * card payment, a deleted expense, a cash count that posted an adjustment and
 * a bank count that matched.
 */
async function ledger() {
  const setup = await setupLedger("2026-09-22");
  handle = setup.handle;
  const { ctx, category } = setup;
  const bank = await setup.account("Bank", "bank", "2026-07-01", 50_000);
  const cash = await setup.account("Cash", "cash", "2026-07-01", 5_000);
  const visa = await setup.account("Visa", "credit_card", "2026-07-01", 0);
  const record = async (input: Record<string, string>) => ok(await recordEntry(ctx, input)).ids;

  const commitment = async (name: string, amount: number, anchorOn: string, cat = "Utilities") =>
    ok(
      await createCommitment(ctx, {
        name,
        categoryId: category(cat),
        expectedAmount: String(amount),
        expectedAccountId: bank,
        frequency: "monthly",
        interval: "1",
        anchorOn,
      }),
    );
  const rent = await commitment("Rent", 20_000, "2026-07-03", "Housing");
  const gym = await commitment("Gym", 3_000, "2026-07-15", "Health");
  const internet = await commitment("Internet", 1_500, "2026-07-20");
  await commitment("Phone", 1_200, "2026-07-22");
  await commitment("Water", 800, "2026-07-28");
  const occurrence = async (commitmentId: string, dueOn: string) =>
    (await getOccurrences(ctx)).find((o) => o.commitmentId === commitmentId && o.dueOn === dueOn)!
      .id;
  // Earlier months settled so they don't crowd September's evidence.
  for (const [id, days] of [
    [rent, ["2026-07-03", "2026-08-03"]],
    [gym, ["2026-07-15", "2026-08-15"]],
    [internet, ["2026-07-20", "2026-08-20"]],
  ] as const) {
    for (const due of days) ok(await skipOccurrence(ctx, await occurrence(id, due)));
  }

  await record({
    type: "income",
    amount: "60000",
    accountId: bank,
    categoryId: category("Salary"),
    occurredOn: "2026-09-01",
    description: "Salary",
  });
  await record({
    type: "transfer",
    amount: "10000",
    accountId: bank,
    counterAccountId: cash,
    fee: "25",
    feeCategoryId: category("Fees & Charges"),
    occurredOn: "2026-09-01",
    description: "Cash withdrawal",
  });
  ok(
    await payOccurrence(ctx, await occurrence(rent, "2026-09-03"), {
      accountId: bank,
      amount: "20000",
      occurredOn: "2026-09-05",
    }),
  );
  ok(await skipOccurrence(ctx, await occurrence(gym, "2026-09-15")));
  const [jacket] = await record({
    type: "expense",
    amount: "3000",
    accountId: visa,
    categoryId: category("Shopping"),
    occurredOn: "2026-09-10",
  });
  ok(
    await refundExpense(ctx, jacket!, {
      amount: "1200",
      accountId: visa,
      occurredOn: "2026-09-12",
    }),
  );
  await record({
    type: "transfer",
    amount: "3000",
    accountId: bank,
    counterAccountId: visa,
    occurredOn: "2026-09-11",
    description: "Card payment",
  });
  await record({
    type: "expense",
    amount: "900",
    accountId: cash,
    categoryId: category("Food & Dining"),
    occurredOn: "2026-09-12",
  });
  const [mistake] = await record({
    type: "expense",
    amount: "7777",
    accountId: cash,
    categoryId: category("Shopping"),
    occurredOn: "2026-09-14",
  });
  ok(await removeEntry(ctx, mistake!));
  // Cash holds 5,000 + 10,000 − 900 = 14,100 on the 18th; 13,600 was counted.
  ok(await verifyBalance(ctx, { accountId: cash, asOf: "2026-09-18", countedAmount: "13600" }));
  const bankOn19 = (await getAccountBalances(ctx, "2026-09-19" as never)).find(
    (b) => b.accountId === bank,
  )!.balance;
  ok(
    await verifyBalance(ctx, {
      accountId: bank,
      asOf: "2026-09-19",
      countedAmount: String(bankOn19 / 100),
    }),
  );
  return { ...setup, bank, cash, visa };
}

const day = (cal: Awaited<ReturnType<typeof getMonthCalendar>>, date: string) =>
  cal.days.find((d) => d.date === date)!;

describe("getMonthCalendar", () => {
  it("adds each day's income and spending exactly as Cash flow counts the month", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, "saturday");
    expect(cal.month).toBe("2026-09");
    expect(cal.when).toBe("current");
    expect(day(cal, "2026-09-01").money).toEqual({ income: taka(60_000), spending: taka(25) });
    // Rent was paid on the 5th: that is where it is spending.
    expect(day(cal, "2026-09-03").money).toEqual({ income: ZERO, spending: ZERO });
    expect(day(cal, "2026-09-05").money).toEqual({ income: ZERO, spending: taka(20_000) });
    expect(day(cal, "2026-09-10").money!.spending).toBe(taka(3_000));
    // 900 spent and a 1,200 refund on one day.
    expect(day(cal, "2026-09-12").money!.spending).toBe(taka(-300));
    // The card payment, the adjustment and the deleted expense are not spending.
    for (const date of ["2026-09-11", "2026-09-14", "2026-09-18"])
      expect(day(cal, date).money).toEqual({ income: ZERO, spending: ZERO });

    const flow = await getMonthlyCashFlow(ctx);
    expect(cal.summary).toEqual({
      range: flow.period.range,
      income: flow.summary.income,
      spending: flow.summary.spending,
      leftOver: flow.summary.leftOver,
    });
    expect(cal.summary!.spending).toBe(taka(22_725));
  });

  it("has no money after today, only the payments that fall due", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, "saturday");
    expect(day(cal, "2026-09-23").money).toBeNull();
    expect(day(cal, "2026-09-28").dues.map((d) => [d.name, d.display])).toEqual([
      ["Water", "upcoming"],
    ]);
  });

  it("keeps a payment's due date and the day it was paid as separate facts", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, "saturday");
    const rent = day(cal, "2026-09-03").dues[0]!;
    expect(rent).toMatchObject({ name: "Rent", display: "paid", dueOn: "2026-09-03" });
    expect(rent.payment).toMatchObject({ amount: taka(20_000), paidOn: "2026-09-05" });
    expect(day(cal, "2026-09-05").dues).toEqual([]);
  });

  it("lists the month's payments due and what is still pending of them", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, "saturday");
    expect(cal.due.occurrences.map((d) => [d.dueOn, d.name, d.display])).toEqual([
      ["2026-09-03", "Rent", "paid"],
      ["2026-09-15", "Gym", "skipped"],
      ["2026-09-20", "Internet", "overdue"],
      ["2026-09-22", "Phone", "due_today"],
      ["2026-09-28", "Water", "upcoming"],
    ]);
    expect(cal.due.pendingCount).toBe(3);
    expect(cal.due.pendingTotal).toBe(taka(3_500));
  });

  it("totals each week over its own dates, and the weeks add up to the month", async () => {
    const { ctx } = await ledger();
    const saturday = await getMonthCalendar(ctx, "saturday");
    expect(saturday.weeks.map((w) => [w.range.start, w.range.end, w.spending])).toEqual([
      ["2026-09-01", "2026-09-05", taka(25)],
      ["2026-09-05", "2026-09-12", taka(23_000)],
      ["2026-09-12", "2026-09-19", taka(-300)],
      ["2026-09-19", "2026-09-26", ZERO],
      ["2026-09-26", "2026-10-01", ZERO],
    ]);
    const monday = await getMonthCalendar(ctx, "monday");
    expect(monday.weeks.map((w) => w.spending)).toEqual([
      taka(20_025),
      taka(2_700),
      ZERO,
      ZERO,
      ZERO,
    ]);
    // The convention moves week boundaries, never a day's or the month's figures.
    expect(monday.days).toEqual(saturday.days);
    expect(monday.summary).toEqual(saturday.summary);
  });

  it("counts each day's evidence by kind", async () => {
    const { ctx } = await ledger();
    const cal = await getMonthCalendar(ctx, "saturday");
    expect(day(cal, "2026-09-01").counts).toEqual({
      entries: 2,
      moved: 1,
      adjustments: 0,
      verifications: 0,
    });
    expect(day(cal, "2026-09-11").counts).toMatchObject({ entries: 0, moved: 1 });
    expect(day(cal, "2026-09-18").counts).toMatchObject({ adjustments: 1, verifications: 1 });
    expect(day(cal, "2026-09-14").counts.entries).toBe(0);
  });

  describe("the selected day", () => {
    it("is today by default in the current month", async () => {
      const { ctx } = await ledger();
      const cal = await getMonthCalendar(ctx, "saturday");
      expect(cal.selected).toBe("2026-09-22");
      expect(cal.detail!.dues.map((d) => [d.name, d.display])).toEqual([["Phone", "due_today"]]);
    });

    it("sorts a day's rows into money, moves and adjustments; only money counts", async () => {
      const { ctx } = await ledger();
      const first = (await getMonthCalendar(ctx, "saturday", "2026-09", "2026-09-01")).detail!;
      expect(first.entries.map((r) => [r.type, r.description])).toEqual([
        ["income", "Salary"],
        ["expense", "Cash withdrawal (fee)"],
      ]);
      expect(first.moved.map((r) => r.description)).toEqual(["Cash withdrawal"]);
      // The fee is the day's whole spending; the transfer is none of it.
      expect(first.money!.spending).toBe(taka(25));
      expect(
        first.entries.filter((r) => r.type !== "income").reduce((a, r) => a - r.amount, 0),
      ).toBe(taka(25));

      const counted = (await getMonthCalendar(ctx, "saturday", "2026-09", "2026-09-18")).detail!;
      expect(counted.adjustments.map((r) => r.amount)).toEqual([taka(-500)]);
      expect(counted.verifications).toEqual([
        expect.objectContaining({
          accountName: "Cash",
          statedBalance: taka(13_600),
          adjustment: expect.objectContaining({ amount: taka(-500) }),
        }),
      ]);
      const matched = (await getMonthCalendar(ctx, "saturday", "2026-09", "2026-09-19")).detail!;
      expect(matched.verifications.map((v) => [v.accountName, v.adjustment])).toEqual([
        ["Bank", null],
      ]);
    });

    it("has no money for a future day, only what falls due", async () => {
      const { ctx } = await ledger();
      const water = (await getMonthCalendar(ctx, "saturday", "2026-09", "2026-09-28")).detail!;
      expect(water.money).toBeNull();
      expect(water.entries).toEqual([]);
      expect(water.dues.map((d) => d.name)).toEqual(["Water"]);
    });
  });

  describe("other months", () => {
    it("reaches forward only as far as payments are scheduled, and no further", async () => {
      const { ctx } = await ledger();
      const cal = await getMonthCalendar(ctx, "saturday");
      expect(cal.horizon).toBe("2026-11-21");
      expect(cal.months).toEqual(["2026-11", "2026-10", "2026-09", "2026-08", "2026-07"]);
      const november = await getMonthCalendar(ctx, "saturday", "2026-11");
      expect(november.due.occurrences.map((d) => d.name)).toEqual(["Rent", "Gym", "Internet"]);
      // The phone bill on the 22nd lies past the horizon: not known, so not shown.
      expect(day(november, "2026-11-21").scheduled).toBe(true);
      expect(day(november, "2026-11-22").scheduled).toBe(false);
      expect(day(november, "2026-11-22").dues).toEqual([]);
    });

    it("shows a future month's payments due without inventing any money", async () => {
      const { ctx } = await ledger();
      const october = await getMonthCalendar(ctx, "saturday", "2026-10");
      expect(october.when).toBe("future");
      expect(october.summary).toBeNull();
      expect(october.days.every((d) => d.money === null)).toBe(true);
      expect(october.weeks.every((w) => w.spending === 0 && w.income === 0)).toBe(true);
      expect(october.selected).toBeNull();
      expect(october.due.pendingTotal).toBe(taka(26_500));
    });

    it("opens a past month with no day selected, and any of its days on request", async () => {
      const { ctx } = await ledger();
      const august = await getMonthCalendar(ctx, "saturday", "2026-08");
      expect(august.when).toBe("past");
      expect(august.selected).toBeNull();
      expect(august.summary!.range).toEqual({ start: "2026-08-01", end: "2026-09-01" });
      const third = await getMonthCalendar(ctx, "saturday", "2026-08", "2026-08-03");
      expect(third.selected).toBe("2026-08-03");
      expect(third.detail!.dues.map((d) => [d.name, d.display])).toEqual([["Rent", "skipped"]]);
    });

    it.each([
      ["a month past the horizon", "2026-12"],
      ["a month before the first account", "2026-06"],
      ["garbage", "../etc"],
    ])("falls back to the current month for %s", async (_, requested) => {
      const { ctx } = await ledger();
      const cal = await getMonthCalendar(ctx, "saturday", requested, "2026-06-05");
      expect(cal.month).toBe("2026-09");
      expect(cal.selected).toBe("2026-09-22");
    });
  });
});
