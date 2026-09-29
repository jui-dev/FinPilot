import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, type CalendarDate } from "@/domain/calendar-date";
import { add, negate, sum, ZERO, type Money } from "@/domain/money";
import { recordEntry, verifyBalance } from "@/server/commands";
import { getActivity } from "@/server/services/activity-service";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";
import { getMonthCalendar } from "@/server/services/calendar-service";

import { d, ok, setupLedger } from "../support/ledger";

/**
 * The Calendar agrees with the ledger on random histories: every day is
 * exactly Activity's totals for that day, the days of a month add up to Cash
 * flow's month, the weeks add up to the month under any week convention, and
 * a day's evidence adds up to its own figures — transfers, fees' transfers
 * and adjustments never counted.
 */
const OPENED = d("2026-07-01");
const TODAY = d("2026-09-22");
const SPAN = 84; // Jul 1 … Sep 22

const entry = fc.record({
  type: fc.constantFrom("income", "expense", "refund", "transfer", "fee", "count"),
  amount: fc.integer({ min: 1, max: 3_000_000 }),
  category: fc.constantFrom("Food & Dining", "Groceries", "Shopping"),
  day: fc.integer({ min: 0, max: SPAN - 1 }),
});

describe("Calendar invariants on random ledgers", () => {
  it("days match Activity, months match Cash flow, weeks and evidence add up", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(entry, { maxLength: 30 }),
        fc.integer({ min: 0, max: SPAN - 1 }),
        async (entries, pick) => {
          const { handle, ctx, account, category } = await setupLedger("2026-09-22");
          try {
            const bank = await account("Bank", "bank", OPENED, 50_000);
            const cash = await account("Cash", "cash", OPENED, 0);
            for (const e of entries) {
              const on = addDays(OPENED, e.day);
              const amount = (e.amount / 100).toFixed(2);
              if (e.type === "count") {
                // A count that is off by the amount: it posts an adjustment.
                ok(await verifyBalance(ctx, { accountId: cash, asOf: on, countedAmount: amount }));
                continue;
              }
              const input: Record<string, string> =
                e.type === "income"
                  ? { type: "income", categoryId: category("Salary") }
                  : e.type === "transfer" || e.type === "fee"
                    ? {
                        type: "transfer",
                        counterAccountId: cash,
                        ...(e.type === "fee"
                          ? { fee: "12.50", feeCategoryId: category("Fees & Charges") }
                          : {}),
                      }
                    : { type: e.type, categoryId: category(e.category) };
              ok(await recordEntry(ctx, { ...input, amount, accountId: bank, occurredOn: on }));
            }

            for (const month of ["2026-07", "2026-08", "2026-09"]) {
              const cal = await getMonthCalendar(ctx, "saturday", month);
              const flow = await getMonthlyCashFlow(ctx, month);
              expect(cal.summary!.income).toBe(flow.summary.income);
              expect(cal.summary!.spending).toBe(flow.summary.spending);

              const recorded = cal.days.filter((x) => x.money !== null);
              expect(sum(recorded.map((x) => x.money!.spending))).toBe(flow.summary.spending);
              expect(sum(recorded.map((x) => x.money!.income))).toBe(flow.summary.income);
              for (const x of recorded) {
                const a = await getActivity(ctx, {
                  range: { start: x.date, end: addDays(x.date, 1) },
                });
                expect(x.money, x.date).toEqual({
                  income: a.summary.income,
                  spending: a.summary.spending,
                });
              }
              expect(cal.days.filter((x) => x.date > TODAY).every((x) => x.money === null)).toBe(
                true,
              );

              for (const start of ["saturday", "sunday", "monday"] as const) {
                const weeks = (await getMonthCalendar(ctx, start, month)).weeks;
                expect(sum(weeks.map((w) => w.spending))).toBe(flow.summary.spending);
                expect(sum(weeks.map((w) => w.income))).toBe(flow.summary.income);
              }
            }

            // One day's evidence adds up to that day's figures.
            const date = addDays(OPENED, pick) as CalendarDate;
            const detail = (await getMonthCalendar(ctx, "saturday", date.slice(0, 7), date))
              .detail!;
            const spent = detail.entries
              .filter((r) => r.type !== "income")
              .reduce<Money>((acc, r) => add(acc, negate(r.amount)), ZERO);
            const came = detail.entries
              .filter((r) => r.type === "income")
              .reduce<Money>((acc, r) => add(acc, r.amount), ZERO);
            expect({ income: came, spending: spent }).toEqual(detail.money);
            expect(detail.moved.every((r) => r.type === "transfer")).toBe(true);
            expect(detail.adjustments.every((r) => r.type === "adjustment")).toBe(true);
          } finally {
            handle.close();
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});
