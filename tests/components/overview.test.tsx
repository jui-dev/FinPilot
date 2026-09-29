import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { spokenForBar } from "@/components/available/describe";
import { AvailableCard } from "@/components/overview/available-card";
import {
  assetRail,
  availableRing,
  monthFlow,
  monthGlance,
  shortNames,
} from "@/components/overview/describe";
import { ThisMonth } from "@/components/overview/this-month";
import { YourMonth } from "@/components/overview/your-month";
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
import { cashFlowPeriod, summarizeCashFlow } from "@/domain/ledger/cash-flow";
import { summarizePosition } from "@/domain/ledger/position";
import { fromMajor } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";
import type { CalendarDue, MonthCalendar } from "@/server/services/calendar-service";

/**
 * How the Overview reads: the Available card and its ring, Your month, This
 * month, and Where you stand with its asset rail. Views come from
 * the real bridge and position, as the services would build them.
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
const positionOf = (accounts: AvailableAccountInput[]) =>
  summarizePosition(accounts.map(({ accountId, type, balance }) => ({ accountId, type, balance })));

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

describe("monthFlow", () => {
  const flow = (income: number, spending: number) =>
    monthFlow(summarizeCashFlow(t(income), t(spending)));

  it("draws both on the longer one's scale, with the left-over span between their ends", () => {
    expect(flow(100_000, 75_000)).toEqual({
      kind: "flow",
      cameIn: 1,
      wentOut: 0.75,
      gap: { from: 0.75, to: 1, kind: "left" },
    });
  });

  it("marks what went out past what came in, including before anything came in", () => {
    expect(flow(50_000, 100_000)).toEqual({
      kind: "flow",
      cameIn: 0.5,
      wentOut: 1,
      gap: { from: 0.5, to: 1, kind: "over" },
    });
    expect(flow(0, 4_000)).toEqual({
      kind: "flow",
      cameIn: 0,
      wentOut: 1,
      gap: { from: 0, to: 1, kind: "over" },
    });
  });

  it("has no span when they are equal, nothing to draw before anything moves, and no bars below zero", () => {
    expect(flow(10_000, 10_000)).toMatchObject({ kind: "flow", gap: null });
    expect(flow(0, 0)).toEqual({ kind: "empty" });
    // Refunds larger than spending: a total below zero is not a length.
    expect(flow(10_000, -2_000)).toEqual({ kind: "text" });
  });
});

describe("ThisMonth", () => {
  const period = cashFlowPeriod("2026-09" as never, TODAY);
  const month = (income: number, spending: number) =>
    renderToStaticMarkup(
      <ThisMonth summary={summarizeCashFlow(t(income), t(spending))} period={period} />,
    );

  it("draws what came in and went out, and names what was left over", () => {
    const html = month(95_000, 66_487);
    const words = text(html);
    expect(words).toContain("This month 1–22 Sep 2026, so far");
    expect(words).toContain("Came in ৳ 95,000");
    expect(html).toContain('aria-label="Came in, 1–22 Sep 2026: ৳95,000"');
    expect(words).toContain("Went out ৳ 66,487");
    expect(html).toContain('aria-label="Went out, 1–22 Sep 2026: ৳66,487"');
    expect(words).toContain("Left over ৳ 28,513");
    expect(html).toContain('href="/activity?type=income&amp;from=2026-09-01&amp;to=2026-09-22"');
    expect(html).toContain('href="/activity?from=2026-09-01&amp;to=2026-09-22"');
    expect(html).toContain('href="/cash-flow"');
    // Came in splits into what went out again and what was left over (navy, as the figure).
    expect(html).toMatch(/bg-tide" style="width:69\.9\d*%/);
    expect(html).toMatch(/bg-navy" style="width:30\.0\d*%/);
    // No rate, percentage or comparison in the words.
    expect(words).not.toMatch(/%|Savings rate|vs /);
  });

  it("writes a month that spent more with a true minus, and links nothing that is zero", () => {
    const html = month(0, 4_000);
    expect(text(html)).toContain("Left over − ৳ 4,000");
    expect(html).not.toContain("type=income");
    // What went out past what came in is outlined, never filled in berry.
    expect(html).toContain("border-ocean");
    expect(html).not.toMatch(/negative/);
  });

  it("says so when nothing has moved, and draws no bars below zero", () => {
    expect(text(month(0, 0))).toContain("Nothing has come in or gone out yet this month.");
    expect(month(10_000, -2_000)).not.toContain("bg-ocean");
  });
});

describe("WhereYouStand", () => {
  const stand = (accounts: AvailableAccountInput[]) =>
    renderToStaticMarkup(
      <WhereYouStand position={positionOf(accounts)} available={view(accounts)} />,
    );

  it("shows net worth, what you own split by the rail, and what you owe on its own line", () => {
    const html = stand([
      acct("Bank", "bank", 100_000),
      acct("Savings", "savings", 60_000),
      acct("Visa", "credit_card", -6_000),
    ]);
    const words = text(html);
    expect(words).toContain("Net worth ৳ 1,54,000");
    expect(words).toContain("You own ৳ 1,60,000");
    expect(words).toContain("Counts toward Available ৳ 1,00,000");
    expect(words).toContain("Outside Available ৳ 60,000 · Savings");
    expect(words).toContain("You owe on cards ৳ 6,000");
    expect(words).not.toContain("Credit on cards");
    expect(html).toContain('data-testid="asset-rail"');
    expect(html).toContain('href="/accounts"');
  });

  it("reads a card holding credit as Credit on cards, never as owed", () => {
    const words = text(stand([acct("Bank", "bank", 10_000), acct("Visa", "credit_card", 500)]));
    expect(words).toContain("Credit on cards ৳ 500");
    expect(words).not.toContain("owe");
  });

  it("says nothing is outside Available when everything counts", () => {
    const words = text(stand([acct("Bank", "bank", 10_000), acct("Visa", "credit_card", 0)]));
    expect(words).toContain("You owe on cards ৳ 0");
    expect(words).toContain("Outside Available Nothing");
  });

  it("draws no rail when a part is negative or nothing is owned", () => {
    for (const accounts of [
      [acct("Bank", "bank", -2_000), acct("Savings", "savings", 5_000)],
      [acct("Bank", "bank", 0)],
    ]) {
      const html = stand(accounts);
      expect(html).not.toContain("asset-rail");
      expect(text(html)).not.toContain("Counts toward Available");
    }
  });

  it("shortens a long list of accounts outside Available", () => {
    expect(shortNames(["Savings"])).toBe("Savings");
    expect(shortNames(["Savings", "FD"])).toBe("Savings and FD");
    expect(shortNames(["Savings", "FD", "Locker"])).toBe("Savings and 2 more");
  });
});

describe("assetRail", () => {
  it("takes both parts from the read model, and names the accounts outside Available", () => {
    const accounts = [
      acct("Bank", "bank", 75_000),
      acct("Savings", "savings", 20_000),
      acct("Locker", "cash", 5_000, false),
      acct("Empty", "savings", 0),
    ];
    const v = view(accounts);
    expect(assetRail(v, positionOf(accounts).assets)).toEqual({
      counts: { amount: t(75_000), share: 0.75 },
      outside: { amount: t(25_000), share: 0.25, accounts: ["Savings", "Locker"] },
    });
  });
});

// ---------------------------------------------------------------------------
// Your month
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

describe("YourMonth", () => {
  it("shows the month at a glance, what is still due, the next payment, and the way to the Calendar", () => {
    const html = renderToStaticMarkup(
      <YourMonth calendar={september({ "2026-09-03": [0, 450] }, DUES)} />,
    );
    const words = text(html);
    expect(words).toContain("Your month September 2026");
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
    const words = text(renderToStaticMarkup(<YourMonth calendar={september({}, [DUES[1]!])} />));
    expect(words).toContain("Nothing still due this month");
    expect(words).toContain("No payment is still due this month.");
    expect(words).not.toContain("Next:");
  });
});

describe("YourMonth days", () => {
  const month = (selected: CalendarDate | null) =>
    renderToStaticMarkup(
      <YourMonth calendar={september({ "2026-09-03": [0, 450] }, DUES)} selected={selected} />,
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
