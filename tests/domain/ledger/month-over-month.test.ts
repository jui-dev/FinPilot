import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { calendarDateFromIso, type YearMonth } from "@/domain/calendar-date";
import { formatShare } from "@/domain/ledger/analytics";
import { cashFlowPeriod, type CategorySpending } from "@/domain/ledger/cash-flow";
import {
  comparisonPeriod,
  explainSpendingChange,
  isMaterialChange,
} from "@/domain/ledger/month-over-month";
import { add, fromMajor, money, negate, sum, ZERO } from "@/domain/money";

const d = calendarDateFromIso;
const taka = fromMajor;
const ym = (value: string) => value as YearMonth;
const line = (name: string, amountTaka: number): CategorySpending => ({
  categoryId: `id-${name}`,
  name,
  amount: taka(amountTaka),
});
const months = (...values: string[]) => values.map(ym);

describe("comparisonPeriod", () => {
  it("compares the month to date with the same days of the previous month", () => {
    const period = cashFlowPeriod(ym("2026-09"), d("2026-09-22"));
    expect(comparisonPeriod(period, months("2026-09", "2026-08"))).toEqual({
      month: "2026-08",
      kind: "same_days",
      range: { start: "2026-08-01", end: "2026-08-23" },
    });
  });

  it("compares the 1st with the 1st", () => {
    const period = cashFlowPeriod(ym("2026-10"), d("2026-10-01"));
    expect(comparisonPeriod(period, months("2026-10", "2026-09"))?.range).toEqual({
      start: "2026-09-01",
      end: "2026-09-02",
    });
  });

  it("clamps to the previous month's length, leap years included", () => {
    const march = (year: string) =>
      comparisonPeriod(cashFlowPeriod(ym(`${year}-03`), d(`${year}-03-31`)), [
        ym(`${year}-03`),
        ym(`${year}-02`),
      ])?.range;
    expect(march("2026")).toEqual({ start: "2026-02-01", end: "2026-03-01" });
    expect(march("2028")).toEqual({ start: "2028-02-01", end: "2028-03-01" });
    const oct31 = cashFlowPeriod(ym("2026-10"), d("2026-10-31"));
    expect(comparisonPeriod(oct31, months("2026-10", "2026-09"))?.range).toEqual({
      start: "2026-09-01",
      end: "2026-10-01",
    });
  });

  it("crosses a year boundary", () => {
    const period = cashFlowPeriod(ym("2027-01"), d("2027-01-15"));
    expect(comparisonPeriod(period, months("2027-01", "2026-12"))).toEqual({
      month: "2026-12",
      kind: "same_days",
      range: { start: "2026-12-01", end: "2026-12-16" },
    });
  });

  it("compares a complete month with the whole previous month", () => {
    const period = cashFlowPeriod(ym("2026-03"), d("2026-09-22"));
    expect(comparisonPeriod(period, months("2026-09", "2026-03", "2026-02"))).toEqual({
      month: "2026-02",
      kind: "complete",
      range: { start: "2026-02-01", end: "2026-03-01" },
    });
  });

  it("has no comparison when the previous month predates every account", () => {
    const current = cashFlowPeriod(ym("2026-09"), d("2026-09-22"));
    expect(comparisonPeriod(current, months("2026-09"))).toBeNull();
    const first = cashFlowPeriod(ym("2026-08"), d("2026-09-22"));
    expect(comparisonPeriod(first, months("2026-09", "2026-08"))).toBeNull();
  });
});

describe("isMaterialChange: |Δ| ≥ max(৳500, 10% × |previous|)", () => {
  it("uses ৳500 when 10% of the previous amount is smaller", () => {
    expect(isMaterialChange(taka(500), taka(1_200))).toBe(true);
    expect(isMaterialChange(money(49_999), taka(1_200))).toBe(false);
    expect(isMaterialChange(taka(-500), taka(1_200))).toBe(true);
    expect(isMaterialChange(money(-49_999), taka(1_200))).toBe(false);
  });

  it("uses 10% of a positive previous amount when that is larger", () => {
    expect(isMaterialChange(taka(3_000), taka(30_000))).toBe(true);
    expect(isMaterialChange(money(299_999), taka(30_000))).toBe(false);
    expect(isMaterialChange(taka(-3_000), taka(30_000))).toBe(true);
  });

  it("uses ৳500 for a zero previous amount", () => {
    expect(isMaterialChange(taka(500), ZERO)).toBe(true);
    expect(isMaterialChange(money(49_999), ZERO)).toBe(false);
  });

  it("uses the magnitude of a negative (refund-heavy) previous amount", () => {
    expect(isMaterialChange(taka(500), taka(-1_200))).toBe(true);
    expect(isMaterialChange(money(49_999), taka(-1_200))).toBe(false);
    // 10% of |−30,000| = 3,000 > 500.
    expect(isMaterialChange(taka(3_000), taka(-30_000))).toBe(true);
    expect(isMaterialChange(money(299_999), taka(-30_000))).toBe(false);
    expect(isMaterialChange(taka(1_000), taka(-30_000))).toBe(false);
  });

  it("is never material for no change", () => {
    expect(isMaterialChange(ZERO, ZERO)).toBe(false);
    expect(isMaterialChange(ZERO, taka(5_000))).toBe(false);
  });

  it("does not overflow on the largest amounts", () => {
    const max = money(Number.MAX_SAFE_INTEGER);
    expect(isMaterialChange(max, max)).toBe(true);
    expect(isMaterialChange(taka(500), max)).toBe(false);
  });
});

describe("explainSpendingChange", () => {
  // The acceptance scenario: Sep 1–22 against Aug 1–22.
  const september = [
    line("Housing", 30_000),
    line("Health", 30_000),
    line("Groceries", 4_200),
    line("Shopping", 1_800),
    line("Food & Dining", 450),
    line("Fees & Charges", 37),
  ];
  const august = [
    line("Housing", 30_000),
    line("Groceries", 5_000),
    line("Shopping", 3_800),
    line("Food & Dining", 1_200),
    line("Fees & Charges", 37),
  ];

  it("explains the scenario: Health accounts for all of the increase", () => {
    const e = explainSpendingChange(september, august);
    expect(e).toMatchObject({
      currentTotal: taka(66_487),
      previousTotal: taka(40_037),
      net: taka(26_450),
      grossIncreases: taka(30_000),
      grossDecreases: taka(3_550),
      smallerChanges: { count: 0, net: ZERO },
    });
    expect(e.increases.map((l) => [l.name, l.change, l.material, l.shareOfIncreases])).toEqual([
      ["Health", taka(30_000), true, { numerator: taka(30_000), denominator: taka(30_000) }],
    ]);
    expect(e.offsets.map((l) => [l.name, l.change, l.material])).toEqual([
      ["Shopping", taka(-2_000), true],
      ["Groceries", taka(-800), true],
      ["Food & Dining", taka(-750), true],
    ]);
    expect(e.unchanged.map((l) => l.name)).toEqual(["Fees & Charges", "Housing"]);
  });

  it("uses gross increases, not the net change, as the denominator (113% case)", () => {
    const e = explainSpendingChange(september, august);
    const health = e.increases[0]!;
    expect(formatShare(health.shareOfIncreases!)).toBe("100%");
    expect(formatShare({ numerator: health.change, denominator: e.net })).toBe("113%");
  });

  it("treats a category missing from one period as zero there", () => {
    const e = explainSpendingChange([line("Health", 800)], [line("Transport", 600)]);
    expect(e.increases.map((l) => [l.name, l.previous, l.current])).toEqual([
      ["Health", ZERO, taka(800)],
    ]);
    expect(e.offsets.map((l) => [l.name, l.previous, l.current, l.change])).toEqual([
      ["Transport", taka(600), ZERO, taka(-600)],
    ]);
  });

  it("handles refund-heavy categories by plain signed subtraction", () => {
    const e = explainSpendingChange([line("Shopping", 1_000)], [line("Shopping", -500)]);
    expect(e.increases[0]).toMatchObject({ change: taka(1_500), material: true });
    const back = explainSpendingChange([line("Shopping", -800)], [line("Shopping", 200)]);
    expect(back.offsets[0]).toMatchObject({ change: taka(-1_000), material: true });
    expect(back.net).toBe(taka(-1_000));
  });

  it("shares all gross increases, material or not, and groups the smaller changes", () => {
    const e = explainSpendingChange(
      [line("Health", 9_000), line("Transport", 1_300), line("Other", 100)],
      [line("Health", 1_000), line("Transport", 1_000), line("Other", 400)],
    );
    expect(e.grossIncreases).toBe(taka(8_300));
    expect(e.increases.map((l) => [l.name, l.material, l.shareOfIncreases])).toEqual([
      ["Health", true, { numerator: taka(8_000), denominator: taka(8_300) }],
      ["Transport", false, { numerator: taka(300), denominator: taka(8_300) }],
    ]);
    expect(e.smallerChanges).toEqual({ count: 2, net: taka(0) });
    expect(e.net).toBe(taka(8_000));
  });

  it("explains a fall in spending with increases' shares and offsets as amounts", () => {
    const e = explainSpendingChange(
      [line("Health", 2_000), line("Shopping", 1_000)],
      [line("Shopping", 13_000)],
    );
    expect(e.net).toBe(taka(-10_000));
    expect(e.increases.map((l) => [l.name, l.shareOfIncreases])).toEqual([
      ["Health", { numerator: taka(2_000), denominator: taka(2_000) }],
    ]);
    expect(e.offsets.map((l) => [l.name, l.change, l.shareOfIncreases])).toEqual([
      ["Shopping", taka(-12_000), null],
    ]);
  });

  it("has no shares without increases, and nets to zero when changes offset", () => {
    const e = explainSpendingChange([line("Groceries", 1_000)], [line("Groceries", 3_000)]);
    expect(e.grossIncreases).toBe(ZERO);
    expect(e.increases).toEqual([]);
    const even = explainSpendingChange(
      [line("Health", 2_000), line("Shopping", 1_000)],
      [line("Health", 1_000), line("Shopping", 2_000)],
    );
    expect(even.net).toBe(ZERO);
    expect(even.grossIncreases).toBe(taka(1_000));
    expect(even.grossDecreases).toBe(taka(1_000));
  });

  it("is empty when nothing was spent in either period", () => {
    expect(explainSpendingChange([], [])).toEqual({
      previousTotal: ZERO,
      currentTotal: ZERO,
      net: ZERO,
      grossIncreases: ZERO,
      grossDecreases: ZERO,
      increases: [],
      offsets: [],
      unchanged: [],
      smallerChanges: { count: 0, net: ZERO },
    });
  });

  it("breaks ties by name", () => {
    const e = explainSpendingChange(
      [line("beta", 1_000), line("Alpha", 1_000), line("delta", 0), line("Charlie", 0)],
      [line("delta", 700), line("Charlie", 700)],
    );
    expect(e.increases.map((l) => l.name)).toEqual(["Alpha", "beta"]);
    expect(e.offsets.map((l) => l.name)).toEqual(["Charlie", "delta"]);
  });

  const anyLines = (names: readonly string[]) =>
    fc.subarray([...names]).chain((picked) =>
      fc
        .array(fc.integer({ min: -5_000_000, max: 50_000_000 }), {
          minLength: picked.length,
          maxLength: picked.length,
        })
        .map((amounts) =>
          picked.map((name, i) => ({
            categoryId: `id-${name}`,
            name,
            amount: money(amounts[i]!),
          })),
        ),
    );
  const names = ["Housing", "Health", "Groceries", "Shopping", "Transport", "Other"];
  const anyPair = fc.tuple(anyLines(names), anyLines(names));

  it("adds up exactly: Σ Δ = net = gross increases − gross decreases = material + smaller", () => {
    fc.assert(
      fc.property(anyPair, ([current, previous]) => {
        const e = explainSpendingChange(current, previous);
        const all = [...e.increases, ...e.offsets, ...e.unchanged];
        expect(e.net).toBe(sum(current.map((l) => l.amount)) - sum(previous.map((l) => l.amount)));
        expect(sum(all.map((l) => l.change))).toBe(e.net);
        expect(add(e.grossIncreases, negate(e.grossDecreases))).toBe(e.net);
        const material = sum(all.filter((l) => l.material).map((l) => l.change));
        expect(add(material, e.smallerChanges.net)).toBe(e.net);
        expect(e.smallerChanges.count).toBe(
          all.filter((l) => l.change !== 0 && !l.material).length,
        );
      }),
    );
  });

  it("partitions the categories of both periods, and shares of increases sum to one", () => {
    fc.assert(
      fc.property(anyPair, ([current, previous]) => {
        const e = explainSpendingChange(current, previous);
        const ids = new Set([...current, ...previous].map((l) => l.categoryId));
        const all = [...e.increases, ...e.offsets, ...e.unchanged];
        expect(all).toHaveLength(ids.size);
        expect(new Set(all.map((l) => l.categoryId))).toEqual(ids);
        expect(e.increases.every((l) => l.change > 0)).toBe(true);
        expect(e.offsets.every((l) => l.change < 0 && l.shareOfIncreases === null)).toBe(true);
        expect(e.unchanged.every((l) => l.change === 0 && !l.material)).toBe(true);
        if (e.increases.length > 0) {
          expect(
            e.increases.every((l) => l.shareOfIncreases!.denominator === e.grossIncreases),
          ).toBe(true);
          expect(sum(e.increases.map((l) => money(l.shareOfIncreases!.numerator)))).toBe(
            e.grossIncreases,
          );
        }
        for (const l of all) expect(l.material).toBe(isMaterialChange(l.change, l.previous));
      }),
    );
  });

  it("does not depend on the order of its input", () => {
    fc.assert(
      fc.property(
        anyPair.chain(([current, previous]) =>
          fc.tuple(
            fc.constant([current, previous] as const),
            fc.shuffledSubarray(current, { minLength: current.length }),
            fc.shuffledSubarray(previous, { minLength: previous.length }),
          ),
        ),
        ([[current, previous], c2, p2]) => {
          expect(explainSpendingChange(c2, p2)).toEqual(explainSpendingChange(current, previous));
        },
      ),
    );
  });
});
