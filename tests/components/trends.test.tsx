import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { periodName } from "@/components/trends/describe";
import { monthLabel } from "@/components/format";
import { MonthByMonth } from "@/components/trends/month-by-month";
import { axisAmount, niceDomain } from "@/components/trends/scale";
import { TrendTotals } from "@/components/trends/totals";
import { TrendWhatChanged } from "@/components/trends/what-changed";
import { monthRange, type YearMonth } from "@/domain/calendar-date";
import type { CategorySpending } from "@/domain/ledger/cash-flow";
import { explainSpendingChange } from "@/domain/ledger/month-over-month";
import { comparisonHalves } from "@/domain/ledger/trends";
import { fromMajor, subtract } from "@/domain/money";
import type { TrendChange, TrendMonth } from "@/server/services/analysis-service";

/**
 * How Trends is drawn and read (Stage 12): the chart's scale, including the
 * negative and extreme cases the demo never shows, and what each section says,
 * each figure once. Figures come from the real domain functions, as the service
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

describe("the chart's scale", () => {
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
});

describe("the months added up", () => {
  const words = text(renderToStaticMarkup(<TrendTotals months={SIX} />));

  it("names the window and states it as one equation, with each side's monthly average", () => {
    expect(words).toContain("Six months Mar–Aug 2026, added up.");
    expect(words).toContain("Came in ৳ 6,10,000 ৳ 1,01,667 a month on average");
    expect(words).toContain("Went out ৳ 4,63,302 ৳ 77,217 a month on average");
    expect(words).toContain("Left over ৳ 1,46,698 Of what came in 24.0%");
  });

  it("names a shorter or longer window by its length", () => {
    expect(periodName(12)).toBe("Twelve months");
    expect(periodName(4)).toBe("4 months");
  });

  it("keeps a true minus when more went out than came in over the window", () => {
    const over = text(renderToStaticMarkup(<TrendTotals months={SIX.slice(1, 2)} />));
    expect(over).toContain("Left over − ৳ 25,657");
  });
});

describe("month by month", () => {
  const html = renderToStaticMarkup(
    <MonthByMonth months={SIX} currentMonth={"2026-09" as YearMonth} />,
  );
  const words = text(html);

  it("gives the table the months oldest first and the phone rows newest first, each opening Cash flow", () => {
    const heads = [...html.matchAll(/aria-label="(\w+ 2026)"/g)].map((m) => m[1]);
    expect(heads).toEqual(SIX.map((m) => monthLabel(m.month)));
    const phone = html.slice(html.indexOf('aria-label="Months"'));
    const rows = [...phone.matchAll(/href="\/cash-flow\?month=(\d{4}-\d{2})"/g)].map((m) => m[1]);
    expect(rows).toEqual(SIX.map((m) => m.month).reverse());
  });

  it("puts each figure under its own month, in three rows", () => {
    expect(words).toContain(
      "Came in ৳ 95,000 ৳ 95,000 ৳ 1,05,000 ৳ 1,05,000 ৳ 1,05,000 ৳ 1,05,000",
    );
    expect(words).toContain("Went out ৳ 68,297 ৳ 1,20,657 ৳ 68,257 ৳ 68,237 ৳ 69,297 ৳ 68,557");
    expect(words).toContain("Left over ৳ 26,703 − ৳ 25,657 ৳ 36,743 ৳ 36,763 ৳ 35,703 ৳ 36,443");
  });

  it("draws both bars on one scale, hatching only what went out beyond what came in", () => {
    // ৳1,20,657 is the largest amount: the grid tops out at ৳1.5L.
    expect(html).toContain("height:80.438");
    expect(words).toContain("Went out more than came in");
    // Only April went over: one hatched part, and its navy share is ৳95,000 of ৳1,20,657.
    expect(html.match(/data-part="over"/g)).toHaveLength(1);
    expect(html).toContain("height:78.73");
    // A month in the minus is a direction, not an error: no berry anywhere.
    expect(html).not.toMatch(/bg-negative|text-negative/);
  });

  it("leaves the key out when no month went over", () => {
    const calm = text(
      renderToStaticMarkup(
        <MonthByMonth months={SIX.slice(2)} currentMonth={"2026-09" as YearMonth} />,
      ),
    );
    expect(calm).not.toContain("Went out more than came in");
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

  it("leads with the exact difference between the halves, then both totals", () => {
    expect(words).toContain("The recent 3 months against the earlier 3 months.");
    expect(words).toContain("Spending ৳ 52,300 lower");
    expect(words).toContain("Mar–May Jun–Aug Change");
    expect(words).toContain("All spending ৳ 2,22,280 ৳ 1,69,980 − ৳ 52,300");
  });

  it("lists the material changes, higher then lower, and keeps smaller ones together", () => {
    expect(html).toContain('aria-label="Categories that were higher"');
    expect(html).toContain('aria-label="Categories that were lower"');
    expect(words).toMatch(
      /Food & Dining .*৳ 18,710 .*৳ 24,270 \+ ৳ 5,560 .*Shopping .*৳ 66,250 .*৳ 13,150 − ৳ 53,100 .*Transport .*− ৳ 1,400/,
    );
    // Groceries −3,360 is under 10% of 36,950: a smaller change.
    expect(words).toContain("1 smaller change − ৳ 3,360");
    expect(words).toContain("No change: Housing.");
  });

  it("opens each half's rows in Activity, for each category", () => {
    const shopping = demo.explanation.offsets.find((l) => l.name === "Shopping")!;
    expect(html).toContain(
      `/activity?category=${shopping.categoryId}&amp;from=2026-03-01&amp;to=2026-05-31`,
    );
    expect(html).toContain(
      `/activity?category=${shopping.categoryId}&amp;from=2026-06-01&amp;to=2026-08-31`,
    );
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
    expect(same).toContain("Spending unchanged");
    const none = text(renderToStaticMarkup(<TrendWhatChanged change={change([], [])} />));
    expect(none).toContain("Nothing went out in either half");
  });

  it("shows a refund-heavy (negative) half without breaking the bars", () => {
    const refunds = renderToStaticMarkup(
      <TrendWhatChanged change={change([line("Health", 2_500)], [line("Health", -2_500)])} />,
    );
    expect(text(refunds)).toContain("Health, 1 Jun – 31 Aug 2026: − ৳ 2,500 − ৳ 5,000");
    expect(refunds).not.toContain("NaN");
  });
});
