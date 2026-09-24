import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addMonths, calendarDateFromIso, yearMonth, type YearMonth } from "@/domain/calendar-date";
import { formatPercent, formatShare } from "@/domain/ledger/analytics";
import {
  cashFlowPeriod,
  selectableMonths,
  spendingComposition,
  summarizeCashFlow,
  type CategorySpending,
} from "@/domain/ledger/cash-flow";
import { fromMajor, money, sum, ZERO } from "@/domain/money";

const d = calendarDateFromIso;
const taka = fromMajor;
const ym = (value: string) => value as YearMonth;
const line = (name: string, amountTaka: number): CategorySpending => ({
  categoryId: `id-${name}`,
  name,
  amount: taka(amountTaka),
});

describe("cashFlowPeriod", () => {
  it("is month-to-date for the current month: the range ends the day after today", () => {
    expect(cashFlowPeriod(ym("2026-09"), d("2026-09-22"))).toEqual({
      month: "2026-09",
      kind: "month_to_date",
      range: { start: "2026-09-01", end: "2026-09-23" },
    });
  });

  it("covers just the 1st on the first day of a month, and the whole month on its last day", () => {
    expect(cashFlowPeriod(ym("2026-10"), d("2026-10-01")).range).toEqual({
      start: "2026-10-01",
      end: "2026-10-02",
    });
    expect(cashFlowPeriod(ym("2026-09"), d("2026-09-30")).range).toEqual({
      start: "2026-09-01",
      end: "2026-10-01",
    });
  });

  it("is the complete calendar month for any earlier month", () => {
    expect(cashFlowPeriod(ym("2026-08"), d("2026-09-22"))).toEqual({
      month: "2026-08",
      kind: "complete",
      range: { start: "2026-08-01", end: "2026-09-01" },
    });
    expect(cashFlowPeriod(ym("2024-02"), d("2026-09-22")).range.end).toBe("2024-03-01");
    expect(cashFlowPeriod(ym("2025-02"), d("2026-09-22")).range.end).toBe("2025-03-01");
    expect(cashFlowPeriod(ym("2025-12"), d("2026-01-05")).range).toEqual({
      start: "2025-12-01",
      end: "2026-01-01",
    });
  });

  it("refuses a month after the current one", () => {
    expect(() => cashFlowPeriod(ym("2026-10"), d("2026-09-30"))).toThrow(RangeError);
  });
});

describe("selectableMonths", () => {
  it("runs from the earliest account's month to the current month, newest first", () => {
    expect(selectableMonths(d("2026-06-15"), d("2026-09-22"))).toEqual([
      "2026-09",
      "2026-08",
      "2026-07",
      "2026-06",
    ]);
  });

  it("offers only the current month with no accounts, or accounts opened this month", () => {
    expect(selectableMonths(null, d("2026-09-22"))).toEqual(["2026-09"]);
    expect(selectableMonths(d("2026-09-10"), d("2026-09-22"))).toEqual(["2026-09"]);
  });

  it("crosses a year boundary", () => {
    expect(selectableMonths(d("2025-11-30"), d("2026-01-02"))).toEqual([
      "2026-01",
      "2025-12",
      "2025-11",
    ]);
  });

  it("is contiguous, bounded by the earliest and the current month, newest first", () => {
    const anyMonth = fc
      .record({
        year: fc.integer({ min: 2000, max: 2040 }),
        month: fc.integer({ min: 1, max: 12 }),
      })
      .map(({ year, month }) => yearMonth(year, month));
    fc.assert(
      fc.property(
        anyMonth,
        fc.integer({ min: 0, max: 60 }),
        fc.integer({ min: 1, max: 28 }),
        (current, back, day) => {
          const today = d(`${current}-${String(day).padStart(2, "0")}`);
          const earliest = d(`${addMonths(current, -back)}-01`);
          const months = selectableMonths(earliest, today);
          expect(months).toHaveLength(back + 1);
          expect(months[0]).toBe(current);
          expect(months.at(-1)).toBe(addMonths(current, -back));
          months.slice(1).forEach((m, i) => expect(m).toBe(addMonths(months[i]!, -1)));
        },
      ),
    );
  });
});

describe("summarizeCashFlow", () => {
  it("leaves over income − spending, and keeps the savings rate exact", () => {
    // Acceptance September, Sep 1–22: 95,000 in, 66,487 spent.
    const s = summarizeCashFlow(taka(95_000), taka(66_487));
    expect(s.leftOver).toBe(taka(28_513));
    expect(s.savingsRate).toEqual({ numerator: taka(28_513), denominator: taka(95_000) });
    expect(formatPercent(s.savingsRate!)).toBe("30.0%");
  });

  it("has no savings rate without income, and a negative amount left over", () => {
    const s = summarizeCashFlow(ZERO, taka(1_200));
    expect(s.leftOver).toBe(taka(-1_200));
    expect(s.savingsRate).toBeNull();
  });

  it("keeps all income when nothing was spent", () => {
    const s = summarizeCashFlow(taka(5_000), ZERO);
    expect(s.leftOver).toBe(taka(5_000));
    expect(formatPercent(s.savingsRate!)).toBe("100.0%");
  });

  it("allows a negative savings rate when spending exceeds income", () => {
    expect(formatPercent(summarizeCashFlow(taka(1_000), taka(1_250)).savingsRate!)).toBe("−25.0%");
  });

  it("is all zero for a quiet month", () => {
    expect(summarizeCashFlow(ZERO, ZERO)).toEqual({
      income: ZERO,
      spending: ZERO,
      leftOver: ZERO,
      savingsRate: null,
    });
  });
});

describe("spendingComposition", () => {
  it("ranks categories by amount, breaking ties by name, with exact shares of the total", () => {
    // Acceptance September, Sep 1–22 (A-03). Health and Housing tie at 30,000.
    const c = spendingComposition([
      line("Housing", 30_000),
      line("Fees & Charges", 37),
      line("Groceries", 4_200),
      line("Health", 30_000),
      line("Food & Dining", 450),
      line("Shopping", 1_800),
    ]);
    expect(c.total).toBe(taka(66_487));
    expect(c.spent.map((l) => l.name)).toEqual([
      "Health",
      "Housing",
      "Groceries",
      "Shopping",
      "Food & Dining",
      "Fees & Charges",
    ]);
    expect(c.spent[0]!.share).toEqual({ numerator: taka(30_000), denominator: taka(66_487) });
    expect(c.spent.map((l) => formatShare(l.share!))).toEqual([
      "45%",
      "45%",
      "6%",
      "3%",
      "1%",
      "<1%",
    ]);
    expect(c.refundedMoreThanSpent).toEqual([]);
  });

  it("keeps a category whose refunds exceed its expenses out of the share denominator", () => {
    const c = spendingComposition([
      line("Shopping", -500),
      line("Groceries", 3_000),
      line("Dining", 1_000),
    ]);
    expect(c.total).toBe(taka(3_500));
    expect(c.spent.map((l) => [l.name, l.share])).toEqual([
      ["Groceries", { numerator: taka(3_000), denominator: taka(4_000) }],
      ["Dining", { numerator: taka(1_000), denominator: taka(4_000) }],
    ]);
    expect(c.refundedMoreThanSpent).toEqual([{ ...line("Shopping", -500), share: null }]);
  });

  it("orders refunded lines by the amount refunded, largest first", () => {
    const c = spendingComposition([line("A", -100), line("B", -900), line("C", -100)]);
    expect(c.refundedMoreThanSpent.map((l) => l.name)).toEqual(["B", "A", "C"]);
    expect(c.spent).toEqual([]);
  });

  it("shows a fully refunded category as 0% and gives no shares when nothing positive remains", () => {
    const c = spendingComposition([line("Shopping", 0), line("Groceries", 200)]);
    expect(c.spent.map((l) => formatShare(l.share!))).toEqual(["100%", "0%"]);
    const none = spendingComposition([line("Shopping", 0), line("Dining", -50)]);
    expect(none.spent[0]!.share).toBeNull();
    expect(none.total).toBe(taka(-50));
  });

  it("is empty when nothing was spent", () => {
    expect(spendingComposition([])).toEqual({ total: ZERO, spent: [], refundedMoreThanSpent: [] });
  });

  it("orders names by code point after lower-casing, not by locale", () => {
    const c = spendingComposition([line("beta", 10), line("Alpha", 10), line("Ärzte", 10)]);
    expect(c.spent.map((l) => l.name)).toEqual(["Alpha", "beta", "Ärzte"]);
  });

  const anyLines = fc
    .uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), {
      maxLength: 12,
      selector: (s) => s.toLowerCase(),
    })
    .chain((names) =>
      fc.tuple(
        fc.constant(names),
        fc.array(fc.integer({ min: -5_000_000, max: 50_000_000 }), {
          minLength: names.length,
          maxLength: names.length,
        }),
      ),
    )
    .map(([names, amounts]) =>
      names.map((name, i) => ({ categoryId: `id-${i}`, name, amount: money(amounts[i]!) })),
    );

  it("partitions every line, sums to the total, and shares add up exactly", () => {
    fc.assert(
      fc.property(anyLines, (lines) => {
        const c = spendingComposition(lines);
        expect(c.spent.length + c.refundedMoreThanSpent.length).toBe(lines.length);
        expect(c.total).toBe(sum(lines.map((l) => l.amount)));
        expect(c.spent.every((l) => l.amount >= 0)).toBe(true);
        expect(c.refundedMoreThanSpent.every((l) => l.amount < 0 && l.share === null)).toBe(true);
        const positive = sum(c.spent.map((l) => l.amount));
        if (positive > 0) {
          expect(c.spent.every((l) => l.share!.denominator === positive)).toBe(true);
          expect(sum(c.spent.map((l) => money(l.share!.numerator)))).toBe(positive);
        } else {
          expect(c.spent.every((l) => l.share === null)).toBe(true);
        }
      }),
    );
  });

  it("does not depend on the order of its input", () => {
    fc.assert(
      fc.property(
        anyLines.chain((lines) =>
          fc.tuple(fc.constant(lines), fc.shuffledSubarray(lines, { minLength: lines.length })),
        ),
        ([lines, shuffled]) => {
          expect(spendingComposition(shuffled)).toEqual(spendingComposition(lines));
        },
      ),
    );
  });
});

describe("formatShare", () => {
  it("reads <1% for a positive share that rounds to zero, and 0% only for a true zero", () => {
    expect(formatShare({ numerator: 37, denominator: 66_487 })).toBe("<1%");
    expect(formatShare({ numerator: 0, denominator: 66_487 })).toBe("0%");
    expect(formatShare({ numerator: 1, denominator: 200 })).toBe("1%");
    expect(formatShare({ numerator: 1, denominator: 3 })).toBe("33%");
  });
});
