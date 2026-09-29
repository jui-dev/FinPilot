import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, daysBetween, yearMonthOf } from "@/domain/calendar-date";
import { firstCompleteMonth, TREND_LENGTHS } from "@/domain/ledger/trends";
import { add, subtract, sum, ZERO, type Money } from "@/domain/money";
import { recordEntry } from "@/server/commands";
import { getMonthlyCashFlow, getTrends } from "@/server/services/analysis-service";

import { d, ok, setupLedger } from "../support/ledger";

/**
 * Trends agree with Cash flow and with themselves on random ledgers: each
 * month is Cash flow's complete month exactly, the window holds only complete
 * months, and the comparison's totals are the sums of the months in each half.
 * The earliest account opens on a random day, so the opening month is
 * sometimes partial and must then be left out.
 */
const TODAY = d("2026-10-15");
const SPAN_START = d("2025-06-01");

const entry = fc.record({
  type: fc.constantFrom("income", "expense", "refund", "transfer", "fee"),
  amount: fc.integer({ min: 1, max: 5_000_000 }),
  category: fc.constantFrom("Food & Dining", "Groceries", "Shopping", "Health"),
  day: fc.nat(),
});

describe("Trends invariants on random ledgers", () => {
  it("match Cash flow month by month, and each half's total is the sum of its months", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: daysBetween(SPAN_START, TODAY) }),
        fc.array(entry, { maxLength: 30 }),
        async (openedAfter, entries) => {
          const opened = addDays(SPAN_START, openedAfter);
          const { handle, ctx, account, category } = await setupLedger("2026-10-15");
          try {
            const bank = await account("Bank", "bank", opened, 100_000);
            const cash = await account("Cash", "cash", opened, 0);
            const days = daysBetween(opened, TODAY) + 1;
            for (const e of entries) {
              const on = addDays(opened, e.day % days);
              const amount = (e.amount / 100).toFixed(2);
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

            for (const length of TREND_LENGTHS) {
              const trends = await getTrends(ctx, String(length));
              const months = trends.months.map((m) => m.month);

              // Only complete months, contiguous, ending last month, never before the ledger is complete.
              expect(months.length).toBeLessThanOrEqual(length);
              expect(months.every((m) => m < yearMonthOf(TODAY))).toBe(true);
              expect(months.every((m) => m >= firstCompleteMonth(opened))).toBe(true);

              const byMonth = new Map<string, Money>();
              for (const m of trends.months) {
                const flow = await getMonthlyCashFlow(ctx, m.month);
                expect(flow.period.kind).toBe("complete");
                expect(m.income).toBe(flow.summary.income);
                expect(m.spending).toBe(flow.summary.spending);
                expect(m.leftOver).toBe(subtract(m.income, m.spending));
                byMonth.set(m.month, m.spending);
              }

              if (months.length < 3) {
                expect(trends.change).toBeNull();
                continue;
              }
              const { earlier, recent, explanation: e } = trends.change!;
              expect(earlier.months.length).toBe(recent.months.length);
              expect(earlier.months[0]).toBe(months[0]);
              expect(recent.months.at(-1)).toBe(months.at(-1));
              const total = (ms: readonly string[]) => sum(ms.map((m) => byMonth.get(m)!));
              expect(e.previousTotal).toBe(total(earlier.months));
              expect(e.currentTotal).toBe(total(recent.months));
              const changes = [...e.increases, ...e.offsets, ...e.unchanged];
              expect(changes.reduce<Money>((acc, l) => add(acc, l.change), ZERO)).toBe(e.net);
              expect(e.net).toBe(subtract(e.currentTotal, e.previousTotal));
            }
          } finally {
            handle.close();
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});
