import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { monthSpan } from "@/components/trends/describe";
import { Journey } from "@/components/trends/journey";
import {
  axisAmount,
  COMPACT_BELOW,
  journeyGeometry,
  niceDomain,
  type JourneyMonth,
} from "@/components/trends/journey-geometry";
import { MonthByMonth } from "@/components/trends/month-by-month";
import { TrendWhatChanged } from "@/components/trends/what-changed";
import { monthRange, type YearMonth } from "@/domain/calendar-date";
import type { CategorySpending } from "@/domain/ledger/cash-flow";
import { explainSpendingChange } from "@/domain/ledger/month-over-month";
import { comparisonHalves } from "@/domain/ledger/trends";
import { fromMajor, subtract } from "@/domain/money";
import type { TrendChange, TrendMonth } from "@/server/services/analysis-service";

/**
 * How Trends is drawn and read (Stage 12): the journey's geometry, including
 * the zero, negative and extreme cases the demo never shows, and what each
 * section says. Figures come from the real domain functions, as the service
 * would build them; the components only lay them out.
 */
const t = fromMajor;
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

function month(ym: string, income: number, spending: number): TrendMonth {
  const m = ym as YearMonth;
  return {
    month: m,
    range: monthRange(m),
    income: t(income),
    spending: t(spending),
    leftOver: subtract(t(income), t(spending)),
  };
}

/** Six months with the demo's shapes: a flat salary, a step up, one month in the minus. */
const SIX = [
  month("2026-03", 95_000, 68_297),
  month("2026-04", 95_000, 1_20_657),
  month("2026-05", 1_05_000, 68_257),
  month("2026-06", 1_05_000, 68_237),
  month("2026-07", 1_05_000, 69_297),
  month("2026-08", 1_05_000, 68_557),
];
const flow = (ms: readonly TrendMonth[]): readonly JourneyMonth[] => ms;
const finite = (n: number) => Number.isFinite(n);

describe("journey geometry", () => {
  it("scales from zero to a whole ৳50,000 step above the largest amount", () => {
    expect(niceDomain([t(1_20_657), t(95_000)])).toEqual({
      lo: 0,
      hi: t(1_50_000),
      step: t(50_000),
    });
    expect(niceDomain([t(50_000)])).toEqual({ lo: 0, hi: t(50_000), step: t(50_000) });
    expect(niceDomain([0, 0])).toEqual({ lo: 0, hi: t(50_000), step: t(50_000) });
    // A refund-heavy month can make spending negative: the grid reaches below zero.
    expect(niceDomain([t(-1_200), t(30_000)])).toEqual({
      lo: t(-50_000),
      hi: t(50_000),
      step: t(50_000),
    });
    // Larger amounts take a larger step, never more than four of them.
    expect(niceDomain([t(3_10_000)])).toEqual({ lo: 0, hi: t(4_00_000), step: t(1_00_000) });
    expect(niceDomain([t(2_00_00_000)])).toEqual({ lo: 0, hi: t(2_00_00_000), step: t(50_00_000) });
  });

  it("labels the grid in thousands and lakh", () => {
    expect([0, t(50_000), t(1_00_000), t(1_50_000), t(-50_000)].map(axisAmount)).toEqual([
      "৳0",
      "৳50k",
      "৳1L",
      "৳1.5L",
      "−৳50k",
    ]);
  });

  it("draws one flat step per month for each line, across the plot", () => {
    const g = journeyGeometry(flow(SIX), 1000);
    expect(g.slots).toHaveLength(6);
    expect(g.slots[0]!.x).toBe(g.plot.left);
    expect(g.slots[5]!.x + g.slots[5]!.width).toBeCloseTo(g.plot.right);
    // M, then an H per month and a V between months.
    expect(g.incomePath.match(/H/g)).toHaveLength(6);
    expect(g.incomePath.match(/V/g)).toHaveLength(5);
    expect(g.incomePath.startsWith(`M${g.plot.left} `)).toBe(true);
  });

  it("fills the gap as left over, or as more going out, and nothing when they are equal", () => {
    const g = journeyGeometry(flow([...SIX.slice(0, 2), month("2026-05", 70_000, 70_000)]), 1000);
    expect(g.gaps.map((r) => r?.kind ?? null)).toEqual(["left", "over", null]);
    // Left over sits between the steps: from Came in down to Went out.
    const [first] = g.gaps;
    expect(first!.y + first!.height).toBeCloseTo(g.wentOut[0]!.y);
    // Went out reaches down to zero.
    expect(g.wentOut[0]!.y + g.wentOut[0]!.height).toBeCloseTo(g.baseline);
  });

  it("sets every month's Left over on one zero line, a month in the minus below it", () => {
    const g = journeyGeometry(flow(SIX), 1000);
    const { zero, bars } = g.lane;
    expect(bars.map((b) => b?.kind)).toEqual(["left", "over", "left", "left", "left", "left"]);
    for (const b of bars) {
      if (b!.kind === "left") expect(b!.y + b!.height).toBeCloseTo(zero);
      else expect(b!.y).toBe(zero);
    }
    // Proportional: the ৳25,657 bar against the ৳36,763 one.
    expect(bars[1]!.height / bars[3]!.height).toBeCloseTo(25_657 / 36_763, 5);
  });

  it("draws nothing broken when every month is zero", () => {
    const g = journeyGeometry(flow([month("2026-06", 0, 0), month("2026-07", 0, 0)]), 400);
    expect(g.gaps).toEqual([null, null]);
    expect(g.lane.bars).toEqual([null, null]);
    expect([g.baseline, g.lane.zero, g.height].every(finite)).toBe(true);
    expect(g.peaks).toEqual({ income: null, spending: null });
  });

  it("keeps every coordinate finite for negative spending and every month in the minus", () => {
    const g = journeyGeometry(
      flow([
        month("2026-06", 0, -1_200),
        month("2026-07", 10_000, 90_000),
        month("2026-08", 0, 5_000),
      ]),
      COMPACT_BELOW - 1,
    );
    const rects = [...g.wentOut, ...g.gaps, ...g.lane.bars].filter((r) => r !== null);
    expect(rects.every((r) => [r.x, r.y, r.width, r.height].every(finite) && r.height >= 0)).toBe(
      true,
    );
    expect(g.ticks[0]!.value).toBeLessThan(0);
    expect(g.lane.bars.map((b) => b?.kind)).toEqual(["left", "over", "over"]);
  });

  it("handles crore-sized amounts without losing the scale", () => {
    const g = journeyGeometry(
      flow([month("2026-07", 2_00_00_000, 50_00_000), month("2026-08", 10_000, 0)]),
      1000,
    );
    expect(g.ticks.at(-1)!.value).toBe(t(2_00_00_000));
    expect(g.ticks.length).toBeLessThanOrEqual(6);
    expect(g.incomePath).not.toContain("NaN");
  });

  it("labels a peak only when it rises above the latest month, never over another label", () => {
    const g = journeyGeometry(flow(SIX), 1000);
    // Came in peaks at ৳1,05,000 — the latest month's own figure, already shown.
    expect(g.peaks.income).toBeNull();
    expect(g.peaks.spending?.month).toBe(1);
    // Neighbouring peaks at almost the same height, in narrow slots: their labels
    // would collide, so only the Came in one is kept.
    const year = Array.from({ length: 12 }, (_, i) => {
      const ym = `2025-${String(i + 1).padStart(2, "0")}`;
      return i === 4
        ? month(ym, 1_42_500, 60_000)
        : i === 5
          ? month(ym, 95_000, 1_40_000)
          : month(ym, 95_000, 60_000);
    });
    const spike = journeyGeometry(flow(year), 400);
    expect(spike.peaks.income?.month).toBe(4);
    expect(spike.peaks.spending).toBeNull();
    // With room between them, both are named.
    expect(journeyGeometry(flow(year), 1400).peaks.spending?.month).toBe(5);
  });

  it("names the lines beside the last month only on wide drawings, apart from each other", () => {
    const wide = journeyGeometry(
      flow([month("2026-07", 95_000, 94_000), month("2026-08", 95_000, 94_500)]),
      1000,
    );
    expect(wide.compact).toBe(false);
    expect(Math.abs(wide.endLabels!.spendingY - wide.endLabels!.incomeY)).toBeGreaterThanOrEqual(
      34,
    );
    const narrow = journeyGeometry(flow(SIX), 358);
    expect(narrow.compact).toBe(true);
    expect(narrow.endLabels).toBeNull();
  });

  it("writes every Left over when there is room, and only the ones that matter when there isn't", () => {
    expect(journeyGeometry(flow(SIX), 1000).lane.labelled.every(Boolean)).toBe(true);
    const twelve = [
      ...SIX.map((m) => ({ ...m, month: `2025-${m.month.slice(5)}` as YearMonth })),
      ...SIX,
    ];
    const g = journeyGeometry(flow(twelve), 358);
    expect(g.initials).toBe(true);
    // The latest, the largest and each month in the minus.
    expect(g.lane.labelled.map((l, i) => (l ? i : -1)).filter((i) => i >= 0)).toEqual([
      1, 3, 7, 11,
    ]);
  });
});

describe("the journey's statement", () => {
  const halves = {
    earlier: SIX.slice(0, 3).map((m) => m.month),
    recent: SIX.slice(3).map((m) => m.month),
  };

  it("shows the latest complete month until another is chosen, with a way to its Cash flow page", () => {
    const html = renderToStaticMarkup(
      <Journey months={SIX} halves={halves} currentMonth={"2026-09" as YearMonth} />,
    );
    const words = text(html);
    expect(words).toContain("Left over · August 2026 ৳ 36,443");
    expect(words).toContain("Of ৳ 1,05,000 that came in");
    expect(words).toContain("Came in ৳ 1,05,000");
    expect(words).toContain("Went out ৳ 68,557");
    expect(words).toContain("Mar–Aug 2026 · 6 months");
    expect(html).toContain('href="/cash-flow?month=2026-08"');
    // The drawing and its month choices wait for the measured width; the figures never do.
    expect(html).not.toContain('role="radiogroup"');
  });

  it("says so in words when more went out than came in", () => {
    const html = renderToStaticMarkup(
      <Journey months={SIX.slice(0, 2)} halves={null} currentMonth={"2026-09" as YearMonth} />,
    );
    expect(text(html)).toContain("Left over · April 2026 − ৳ 25,657 More went out than came in");
  });
});

describe("month by month", () => {
  const html = renderToStaticMarkup(
    <MonthByMonth months={SIX} currentMonth={"2026-09" as YearMonth} />,
  );

  it("lists every month newest first, each opening its Cash flow page", () => {
    const rows = [...html.matchAll(/href="\/cash-flow\?month=(\d{4}-\d{2})"/g)].map((m) => m[1]);
    // Once in the table (md up) and once in the phone rows.
    expect(rows).toEqual([
      ...SIX.map((m) => m.month).reverse(),
      ...SIX.map((m) => m.month).reverse(),
    ]);
  });

  it("gives phones the month, its Left over, then in and out", () => {
    expect(text(html)).toContain(
      "April 2026 Left over − ৳ 25,657 More went out In ৳ 95,000 · Out ৳ 1,20,657",
    );
  });

  it("carries no percentages", () => {
    expect(text(html)).not.toContain("%");
  });
});

describe("what changed across the halves", () => {
  const line = (name: string, amount: number): CategorySpending => ({
    categoryId: `id-${name}`,
    name,
    amount: t(amount),
  });
  function change(earlier: CategorySpending[], recent: CategorySpending[]): TrendChange {
    const halves = comparisonHalves(SIX.map((m) => m.month))!;
    return { ...halves, explanation: explainSpendingChange(recent, earlier) };
  }
  const demo = change(
    [
      line("Shopping", 66_250),
      line("Food & Dining", 18_710),
      line("Transport", 10_370),
      line("Groceries", 36_950),
      line("Housing", 90_000),
    ],
    [
      line("Shopping", 13_150),
      line("Food & Dining", 24_270),
      line("Transport", 8_970),
      line("Groceries", 33_590),
      line("Housing", 90_000),
    ],
  );
  const html = renderToStaticMarkup(<TrendWhatChanged change={demo} />);
  const words = text(html);

  it("leads with the exact difference between the halves and both totals", () => {
    expect(words).toContain("The recent 3 months against the earlier 3 months");
    expect(words).toContain("৳ 52,300 less went out");
    expect(words).toContain(
      `Earlier 3 months ${monthSpan(demo.earlier.months)} Spending, 1 Mar – 31 May 2026: ৳ 2,22,280`,
    );
    expect(words).toContain(
      `Recent 3 months ${monthSpan(demo.recent.months)} Spending, 1 Jun – 31 Aug 2026: ৳ 1,69,980`,
    );
  });

  it("groups the material changes as higher and lower, and keeps smaller ones together", () => {
    expect(words).toMatch(
      /Higher Food & Dining \+ ৳ 5,560 .*Lower Shopping − ৳ 53,100 .*Transport − ৳ 1,400/,
    );
    // Groceries −3,360 is under 10% of 36,950: a smaller change.
    expect(words).toContain("1 smaller change − ৳ 3,360");
    expect(words).toContain("No change: Housing.");
  });

  it("opens each half's rows in Activity, for the category and for the whole half", () => {
    const shopping = demo.explanation.offsets.find((l) => l.name === "Shopping")!;
    expect(html).toContain(
      `/activity?category=${shopping.categoryId}&amp;from=2026-03-01&amp;to=2026-05-31`,
    );
    expect(html).toContain(
      `/activity?category=${shopping.categoryId}&amp;from=2026-06-01&amp;to=2026-08-31`,
    );
    expect(html).toContain(`/activity?from=2026-06-01&amp;to=2026-08-31`);
  });

  it("carries no percentages, shares or judgement", () => {
    expect(words).not.toMatch(/%|share|good|bad|better|worse/i);
  });

  it("says when the halves spent the same, and when nothing went out at all", () => {
    const same = text(
      renderToStaticMarkup(
        <TrendWhatChanged change={change([line("Housing", 100)], [line("Housing", 100)])} />,
      ),
    );
    expect(same).toContain("The same went out");
    const none = text(renderToStaticMarkup(<TrendWhatChanged change={change([], [])} />));
    expect(none).toContain("Nothing went out in either half");
  });

  it("draws a track from a refund-heavy (negative) half without breaking the scale", () => {
    const refunds = renderToStaticMarkup(
      <TrendWhatChanged change={change([line("Health", 2_500)], [line("Health", -2_500)])} />,
    );
    expect(text(refunds)).toContain("Health − ৳ 5,000");
    expect(refunds).not.toContain("NaN");
  });
});
