import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { spokenForBar } from "@/components/available/describe";
import { AvailableCard } from "@/components/overview/available-card";
import { availableRing, monthGlance, monthJourney, standing } from "@/components/overview/describe";
import { ThisMonth } from "@/components/overview/this-month";
import { MonthAtAGlance } from "@/components/overview/month-at-a-glance";
import { WhereYouStand } from "@/components/overview/where-you-stand";
import {
  availableBridge,
  type AvailableAccountInput,
  type AvailableOccurrenceInput,
} from "@/domain/available/bridge";
import {
  addDays,
  calendarDateFromIso,
  type CalendarDate,
  type YearMonth,
} from "@/domain/calendar-date";
import { monthWeeks } from "@/domain/calendar-weeks";
import type { OccurrenceDisplayState } from "@/domain/commitments/occurrences";
import type { AccountType } from "@/domain/ledger/accounts";
import { cashFlowPeriod, spendingComposition, summarizeCashFlow } from "@/domain/ledger/cash-flow";
import { summarizePosition } from "@/domain/ledger/position";
import { fromMajor } from "@/domain/money";
import type { MonthlyCashFlow } from "@/server/services/analysis-service";
import type { AvailableView } from "@/server/services/available-service";
import type { CalendarDue, MonthCalendar } from "@/server/services/calendar-service";

/**
 * How the Overview reads: the Available card and its ring, Month at a glance,
 * This month's journey and Where you stand's net worth. Views come from the
 * real bridge, cash-flow summary and position, as the services would build them.
 */
const t = fromMajor;
const TODAY = calendarDateFromIso("2026-09-22");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

const acct = (
  id: string,
  type: AccountType,
  balance: number,
  included = type !== "savings",
): AvailableAccountInput => ({
  accountId: id,
  type,
  includedInAvailable: included,
  balance: t(balance),
});
const due = (id: string, amount: number): AvailableOccurrenceInput => ({
  occurrenceId: id,
  dueOn: calendarDateFromIso("2026-10-01"),
  expectedAmount: t(amount),
  state: "pending",
});

/** A view as the service returns it; account names are the ids. */
function view(accounts: AvailableAccountInput[], occurrences: AvailableOccurrenceInput[] = []) {
  const b = availableBridge({ today: TODAY, accounts, occurrences, earmarks: [] });
  return {
    ...b,
    accounts: b.accounts.map((a) => ({ ...a, name: a.accountId, archived: false })),
    commitments: b.commitments.map((c) => ({
      ...c,
      commitmentId: c.occurrenceId,
      name: c.occurrenceId,
      display: "upcoming" as const,
    })),
    earmarks: [],
  } satisfies AvailableView;
}
const card = (v: AvailableView) => renderToStaticMarkup(<AvailableCard view={v} />);

describe("availableRing", () => {
  it("divides the money on hand as the spoken-for bar does, what is free first", () => {
    const v = view(
      [acct("bank", "bank", 50_000), acct("visa", "credit_card", -6_000)],
      [due("rent", 20_000)],
    );
    const ring = availableRing(v)!;
    expect(ring.pool).toBe(t(50_000));
    expect(ring.arcs.map((a) => [a.kind, a.amount])).toEqual([
      ["available", t(24_000)],
      ["owed", t(6_000)],
      ["payments", t(20_000)],
    ]);
    // The same shares as the bar, back to back around the circle.
    const bar = spokenForBar(v)!;
    for (const arc of ring.arcs)
      expect(arc.length).toBeCloseTo(bar.segments.find((s) => s.kind === arc.kind)!.share);
    expect(ring.arcs.map((a) => a.start)).toEqual([0, 0.48, 0.6]);
  });

  it("ends with the over-commitment where the pool runs out, as the bar's gap", () => {
    const ring = availableRing(
      view(
        [acct("bank", "bank", 20_000), acct("visa", "credit_card", -15_000)],
        [due("rent", 30_000)],
      ),
    )!;
    expect(ring.arcs.map((a) => a.kind)).toEqual(["owed", "payments", "over"]);
    const over = ring.arcs.at(-1)!;
    expect(over.amount).toBe(t(25_000));
    expect(over.start).toBeCloseTo(20 / 45);
    expect(over.start + over.length).toBeCloseTo(1);
  });

  it("has nothing to divide when nothing is on hand", () => {
    expect(availableRing(view([acct("bank", "bank", 0)], [due("rent", 1_000)]))).toBeNull();
    expect(availableRing(view([acct("bank", "bank", -5_000)]))).toBeNull();
  });
});

describe("AvailableCard", () => {
  it("reads Available now, the figure, the sentence, then the ring and its legend", () => {
    const v = view(
      [acct("bank", "bank", 50_000), acct("visa", "credit_card", -6_000)],
      [due("rent", 20_000)],
    );
    const html = card(v);
    const words = text(html);
    expect(html).toMatch(/class="[^"]*text-hero[^"]*"/);
    expect(words).toContain("Available now Before new income ৳ 24,000 What's left of ৳ 50,000");
    expect(words).toContain("in your accounts after what you owe on cards");
    // The ring's middle, its legend, and the one precise sentence.
    expect(words).toContain("৳ 50,000 on hand");
    expect(words).toContain("Available ৳ 24,000 Owed on cards ৳ 6,000 Due by 22 Oct ৳ 20,000");
    expect(words).toContain(
      "Free: ৳24,000 of the ৳50,000 on hand in the accounts and cards that count toward Available.",
    );
    expect(html).toContain('data-testid="available-ring"');
    expect(html).toContain('href="/available"');
    expect(words).not.toContain("Over-committed");
    // A light card: navy is the figure, never the surface.
    expect(html).not.toMatch(/<section[^>]*bg-navy/);
  });

  it("names the pool on hand, which includes a card's credit, never as what counts", () => {
    const words = text(
      card(view([acct("bank", "bank", 10_000), acct("visa", "credit_card", 500)])),
    );
    expect(words).toContain("৳ 10,500 on hand");
    expect(words).not.toMatch(/counted|Counts toward/);
  });

  it("never states a percentage, score or ratio", () => {
    const html = card(view([acct("bank", "bank", 40_000)], [due("rent", 10_000)]));
    expect(text(html)).not.toMatch(/%|percent|score|health/i);
    expect(html).toMatch(/<svg aria-hidden="true"/);
  });

  it("with zero Available: nothing free, and no Available part", () => {
    const words = text(card(view([acct("bank", "bank", 10_000)], [due("rent", 10_000)])));
    expect(words).toContain("Nothing is free of the ৳10,000 on hand");
    expect(words).not.toMatch(/Available ৳/);
    expect(words).not.toContain("Over-committed");
  });

  it("when over-committed: a true minus, the tag, and the gap in the legend", () => {
    const words = text(
      card(
        view(
          [acct("bank", "bank", 20_000), acct("visa", "credit_card", -15_000)],
          [due("rent", 30_000)],
        ),
      ),
    );
    expect(words).toContain("− ৳ 25,000");
    expect(words).toContain("Over-committed by ৳ 25,000");
    expect(words).toContain("Over-committed ৳ 25,000");
    expect(words).toContain("Nothing is free of the ৳20,000 on hand");
  });

  it("with nothing on hand: words instead of a ring", () => {
    for (const accounts of [
      [acct("bank", "bank", 0), acct("savings", "savings", 90_000)],
      [acct("bank", "bank", -5_000)],
    ]) {
      const html = card(view(accounts, [due("rent", 1_000)]));
      expect(html).not.toContain("available-ring");
      expect(text(html)).toContain("Nothing on hand in the accounts and cards that count");
      expect(text(html)).not.toMatch(/Nothing is free|Free:/);
    }
  });

  it("does not redraw the bridge", () => {
    const html = card(
      view(
        [acct("bank", "bank", 50_000), acct("visa", "credit_card", -6_000)],
        [due("rent", 20_000)],
      ),
    );
    expect(html).not.toContain("<table");
    expect(text(html)).not.toMatch(/is spoken for|After cards|After upcoming payments/);
  });
});

// ---------------------------------------------------------------------------
// This month: what is left, and where it went
// ---------------------------------------------------------------------------

const cat = (name: string, amount: number) => ({
  categoryId: `c-${name}`,
  name,
  amount: t(amount),
});

/** A month as the Cash flow read model builds it, from its sources and category lines. */
function month(
  sources: [string, number][],
  lines: [string, number][],
): Pick<MonthlyCashFlow, "summary" | "period" | "sources" | "composition"> {
  const composition = spendingComposition(lines.map(([n, a]) => cat(n, a)));
  const income = t(sources.reduce((n, [, a]) => n + a, 0));
  return {
    period: cashFlowPeriod("2026-09" as never, TODAY),
    summary: summarizeCashFlow(income, composition.total),
    sources: sources.map(([n, a]) => cat(n, a)),
    composition,
  };
}

const SPENT: [string, number][] = [
  ["Housing", 30_000],
  ["Groceries", 14_200],
  ["Transport", 9_800],
  ["Health", 6_000],
  ["Shopping", 3_000],
  ["Fees", 400],
];

describe("monthJourney", () => {
  it("lists the five largest categories, the rest as N more, each against what came in", () => {
    const journey = monthJourney(
      month(
        [
          ["Salary", 1_05_000],
          ["Other Income", 2_500],
        ],
        [...SPENT, ["Utilities", 5_270], ["Internet", 3_090], ["Entertainment", 850]],
      ),
    );
    if (journey.kind !== "journey") throw new Error(journey.kind);
    expect(journey.columns.map((c) => [c.name, c.amount])).toEqual([
      ["Housing", t(30_000)],
      ["Groceries", t(14_200)],
      ["Transport", t(9_800)],
      ["Health", t(6_000)],
      ["Utilities", t(5_270)],
      ["4 more", t(3_090 + 3_000 + 850 + 400)],
    ]);
    expect(journey.columns.at(-1)).toMatchObject({ categoryId: null, count: 4 });
    expect(journey.columns[0]!.length).toBeCloseTo(30_000 / 1_07_500);
    expect(journey.columns[1]!.length).toBeCloseTo(14_200 / 1_07_500);
    expect(journey.sources.map((s) => s.name)).toEqual(["Salary", "Other Income"]);
  });

  it("never groups a single category, measures against what went out when more did, and never lists a refunded category", () => {
    const six = monthJourney(month([["Salary", 1_00_000]], SPENT));
    if (six.kind !== "journey") throw new Error(six.kind);
    expect(six.columns.some((c) => c.categoryId === null)).toBe(false);
    const over = monthJourney(month([["Salary", 50_000]], [["Housing", 80_000]]));
    if (over.kind !== "journey") throw new Error(over.kind);
    expect(over.columns[0]!.length).toBe(1);
    const refunded = monthJourney(
      month(
        [["Salary", 10_000]],
        [
          ["Housing", 5_000],
          ["Shopping", -2_000],
        ],
      ),
    );
    expect(refunded).toMatchObject({ kind: "journey", refunded: ["Shopping"] });
    if (refunded.kind !== "journey") throw new Error(refunded.kind);
    expect(refunded.columns.map((c) => c.name)).toEqual(["Housing"]);
  });

  it("has nothing to tell before anything moves", () => {
    expect(monthJourney(month([], []))).toEqual({ kind: "empty" });
  });
});

describe("ThisMonth", () => {
  it("leads with Left over, then where it went, in exact figures leading to their rows, and no rate", () => {
    const html = renderToStaticMarkup(
      <ThisMonth
        cashFlow={month(
          [
            ["Salary", 1_00_000],
            ["Other Income", 7_500],
          ],
          SPENT,
        )}
      />,
    );
    const words = text(html);
    expect(words).toMatch(
      /Left over ৳ 44,100 Of ৳ 1,07,500 that came in, ৳ 63,400 went out, net of refunds\. From Salary ৳ 1,00,000 · Other Income ৳ 7,500/,
    );
    expect(words).toMatch(/Where it went .*Housing ৳ 30,000 .*Went out · net of refunds ৳ 63,400/);
    expect(html).toContain('aria-label="Came in, 1–22 Sep 2026: ৳1,07,500"');
    expect(html).toContain('aria-label="Went out, 1–22 Sep 2026: ৳63,400"');
    expect(html).toContain('data-testid="month-journey"');
    expect(html).toContain('aria-label="Housing: ৳30,000"');
    expect(html).toContain("category=c-Housing");
    expect(html).toContain("category=c-Salary&amp;type=income");
    expect(words).not.toMatch(/%|rate/i);
  });

  it("when more went out: a true minus, an outlined panel and lines against what went out, never berry", () => {
    const html = renderToStaticMarkup(
      <ThisMonth cashFlow={month([["Salary", 50_000]], [["Housing", 80_000]])} />,
    );
    expect(text(html)).toContain("Went out more than came in − ৳ 30,000");
    expect(text(html)).toContain("Each line against what went out");
    expect(html).toContain("border-dashed border-ocean");
    expect(html).not.toContain("negative");
  });

  it("names refunded categories instead of drawing them, and says when nothing moved", () => {
    const refunds = text(
      renderToStaticMarkup(
        <ThisMonth
          cashFlow={month(
            [["Salary", 10_000]],
            [
              ["Housing", 5_000],
              ["Shopping", -2_000],
            ],
          )}
        />,
      ),
    );
    expect(refunds).toContain(
      "Refunds in Shopping were larger than what was spent there, so it isn't listed.",
    );
    const empty = renderToStaticMarkup(<ThisMonth cashFlow={month([], [])} />);
    expect(text(empty)).toContain("Nothing has come in or gone out yet this month.");
    expect(empty).not.toContain("month-journey");
  });
});

// ---------------------------------------------------------------------------
// Where you stand: Net worth = You own − You owe
// ---------------------------------------------------------------------------

const held = (id: string, type: AccountType, balance: number, archived = false) => ({
  accountId: id,
  name: id,
  type,
  balance: t(balance),
  archived,
});

describe("standing", () => {
  it("lists what you own largest first, and an archived account only while it holds money", () => {
    const { own, owe } = standing([
      held("Bank", "bank", 1_47_180),
      held("Savings", "savings", 4_05_000),
      held("Old wallet", "mobile_wallet", 0, true),
      held("Old cash", "cash", 300, true),
      held("Cash", "cash", 0),
      held("Visa", "credit_card", -35_290),
      held("Old card", "credit_card", 0),
    ]);
    expect(own.map((a) => a.name)).toEqual(["Savings", "Bank", "Old cash", "Cash"]);
    expect(owe).toEqual([
      { accountId: "Visa", name: "Visa", amount: t(35_290), kind: "owed", archived: false },
    ]);
  });

  it("puts what is owed before a card's credit", () => {
    const { owe } = standing([
      held("Amex", "credit_card", 2_000),
      held("Visa", "credit_card", -9_000),
    ]);
    expect(owe.map((l) => [l.name, l.kind])).toEqual([
      ["Visa", "owed"],
      ["Amex", "credit"],
    ]);
  });
});

describe("WhereYouStand", () => {
  const render = (accounts: ReturnType<typeof held>[]) =>
    renderToStaticMarkup(
      <WhereYouStand
        position={summarizePosition(
          accounts.map(({ accountId, type, balance }) => ({ accountId, type, balance })),
        )}
        accounts={accounts}
      />,
    );

  it("leads with net worth, then You own − You owe = Net worth, then the accounts", () => {
    const html = render([
      held("Savings", "savings", 4_05_000),
      held("Bank", "bank", 1_47_180),
      held("Visa", "credit_card", -35_290),
    ]);
    const words = text(html);
    // Net worth first; then the statement: You own (its accounts) − You owe (its cards) = Net worth.
    expect(words).toMatch(/^ ?Where you stand Your accounts Net worth ৳ 5,16,890 /);
    expect(words).toContain(
      "You own ৳ 5,52,180 Savings ৳ 4,05,000 Bank ৳ 1,47,180 − You owe ৳ 35,290 Visa ৳ 35,290 = Net worth ৳ 5,16,890",
    );
    // What you owe is berry, restrained: a soft surface with a berry figure.
    expect(html).toContain("bg-negative-soft");
    expect(html).toContain("text-negative");
    // Liquidity is Available's question.
    expect(words).not.toMatch(/Available/);
  });

  it("keeps a negative net worth navy with a true minus, and reads a card's credit as credit", () => {
    const under = render([held("Cash", "cash", 1_000), held("Visa", "credit_card", -6_000)]);
    expect(text(under)).toContain("Net worth − ৳ 5,000");
    const credit = render([held("Bank", "bank", 10_000), held("Visa", "credit_card", 500)]);
    expect(text(credit)).toMatch(/\+ Credit on cards ৳ 500/);
    expect(text(credit)).toContain("Net worth ৳ 10,500");
    expect(text(credit)).toMatch(/Visa \+ ?৳ 500 credit/);
    expect(credit).not.toContain("bg-negative-soft");
  });

  it("says nothing is owed when no card owes", () => {
    expect(text(render([held("Bank", "bank", 10_000)]))).toContain("Nothing is owed on cards.");
  });
});

// ---------------------------------------------------------------------------
// Month at a glance
// ---------------------------------------------------------------------------

const SEPT = "2026-09" as YearMonth;
const d = calendarDateFromIso;

const dueOn = (
  name: string,
  date: string,
  amount: number,
  display: OccurrenceDisplayState,
): CalendarDue => ({
  occurrenceId: `o-${name}`,
  commitmentId: `c-${name}`,
  name,
  dueOn: d(date),
  expectedAmount: t(amount),
  display,
  payment: null,
});

/** September 2026 as the Calendar read model gives it, today the 22nd. */
function september(moved: Record<string, [number, number]>, dues: CalendarDue[]): MonthCalendar {
  const days = [];
  for (let day = d("2026-09-01"); day < d("2026-10-01"); day = addDays(day, 1)) {
    const [income, spending] = moved[day] ?? [0, 0];
    days.push({
      date: day,
      money: day > TODAY ? null : { income: t(income), spending: t(spending) },
      dues: dues.filter((x) => x.dueOn === day),
      counts: { entries: 0, moved: 0, adjustments: 0, verifications: 0 },
      scheduled: true,
    });
  }
  const pending = dues.filter((x) => ["upcoming", "due_today", "overdue"].includes(x.display));
  return {
    month: SEPT,
    today: TODAY,
    horizon: addDays(TODAY, 60),
    weekStartsOn: "saturday",
    months: [SEPT],
    when: "current",
    summary: null,
    due: {
      occurrences: dues,
      pendingCount: pending.length,
      pendingTotal: t(pending.reduce((n, x) => n + x.expectedAmount / 100, 0)),
    },
    days,
    weeks: monthWeeks(SEPT, "saturday").map((w) => ({
      range: w.range,
      income: t(0),
      spending: t(0),
    })),
    selected: null,
    detail: null,
  };
}

const DUES = [
  dueOn("Rent", "2026-09-28", 25_000, "upcoming"),
  dueOn("Gym", "2026-09-10", 2_000, "paid"),
  dueOn("Internet", "2026-09-15", 1_500, "overdue"),
];

describe("monthGlance", () => {
  const glance = monthGlance(
    september({ "2026-09-03": [0, 450], "2026-09-05": [60_000, 0] }, DUES),
  );
  const day = (date: string) =>
    glance.weeks.flat().find((x) => x?.date === (date as CalendarDate))!;

  it("lays the month out in Saturday-first weeks, blank before the 1st and after the 30th", () => {
    expect(glance.weekdays[0]).toBe("saturday");
    // 1 September 2026 is a Tuesday: Saturday, Sunday and Monday come before it.
    expect(glance.weeks[0]!.slice(0, 4).map((x) => x?.day ?? null)).toEqual([null, null, null, 1]);
    expect(glance.weeks.every((w) => w.length === 7)).toBe(true);
    expect(glance.weeks.flat().filter(Boolean)).toHaveLength(30);
  });

  it("marks only the days money came in or went out, today, and what is later", () => {
    expect(day("2026-09-03").moved).toBe(true);
    expect(day("2026-09-05").moved).toBe(true);
    expect(day("2026-09-04").moved).toBe(false);
    expect(glance.movedDays).toBe(2);
    expect(day("2026-09-22")).toMatchObject({ today: true, later: false });
    expect(day("2026-09-23")).toMatchObject({ today: false, later: true, moved: false });
  });

  it("circles a day with a payment still due, amber when a decision is needed, none once paid", () => {
    expect(day("2026-09-28").due).toBe("expected");
    expect(day("2026-09-15").due).toBe("attention");
    expect(day("2026-09-10").due).toBeNull();
    expect(glance.pending.map((x) => x.name)).toEqual(["Internet", "Rent"]);
  });
});

describe("MonthAtAGlance", () => {
  it("shows the month at a glance, what is still due, the next payment, and the way to the Calendar", () => {
    const html = renderToStaticMarkup(
      <MonthAtAGlance calendar={september({ "2026-09-03": [0, 450] }, DUES)} />,
    );
    const words = text(html);
    expect(words).toContain("Month at a glance September 2026");
    expect(html).toContain('href="/calendar?month=2026-09"');
    expect(words).toMatch(/Still due this month ৳ 26,500 · 2 payments/);
    expect(words).toMatch(/Next: Rent\s?, 28 Sep/);
    // One coral day, today; no amount inside the grid.
    const grid = /data-testid="month-glance".*?<p class="sr-only"/s.exec(html)![0];
    expect(grid.match(/bg-coral/g)).toHaveLength(1);
    expect(grid).not.toContain("৳");
    // What the grid shows, in words.
    expect(words).toContain("Today is Tuesday, 22 Sep.");
    expect(words).toContain("Money came in or went out on 1 day this month so far.");
    expect(words).toContain("Still due: Internet on 15 Sep, overdue; Rent on 28 Sep.");
    // This month owns Came in and Went out.
    expect(words).not.toMatch(/Came in|Went out/);
  });

  it("says so when nothing is still due", () => {
    const words = text(
      renderToStaticMarkup(<MonthAtAGlance calendar={september({}, [DUES[1]!])} />),
    );
    expect(words).toContain("Nothing still due this month");
    expect(words).toContain("No payment is still due this month.");
    expect(words).not.toContain("Next:");
  });
});

describe("MonthAtAGlance days", () => {
  const month = (selected: CalendarDate | null) =>
    renderToStaticMarkup(
      <MonthAtAGlance calendar={september({ "2026-09-03": [0, 450] }, DUES)} selected={selected} />,
    );

  it("makes every day of the month a link that opens it on the Overview", () => {
    const html = month(null);
    const days = [...html.matchAll(/href="\/\?day=(2026-09-\d\d)"/g)].map((m) => m[1]);
    expect(days).toHaveLength(30);
    expect(days[0]).toBe("2026-09-01");
    expect(days.at(-1)).toBe("2026-09-30");
    // Each link says its date and its marks in words; today is the current date.
    const words = text(html);
    expect(words).toContain("Tuesday, 22 Sep, today");
    expect(words).toContain("Thursday, 3 Sep, money in or out");
    expect(words).toContain("Monday, 28 Sep, payment due");
    expect(words).toContain("Tuesday, 15 Sep, payment overdue or due today");
    expect(html.match(/aria-current="date"/g)).toHaveLength(1);
    expect(html).not.toContain("ring-ocean");
  });

  it("rings the selected day in ocean and says it is shown", () => {
    const html = month(d("2026-09-10"));
    expect(html.match(/ring-ocean/g)).toHaveLength(1);
    expect(text(html)).toContain("Thursday, 10 Sep, shown");
    // Today keeps coral.
    expect(html.match(/bg-coral/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("selects only a day of the month", () => {
    const glance = monthGlance(september({}, []), d("2026-09-10"));
    expect(glance.weeks.flat().filter((x) => x?.selected)).toHaveLength(1);
    const none = monthGlance(september({}, []), d("2026-10-10"));
    expect(none.weeks.flat().some((x) => x?.selected)).toBe(false);
  });
});
