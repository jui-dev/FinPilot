import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AvailableBand } from "@/components/overview/available-band";
import { assetRail, freeShare, monthFlow, shortNames } from "@/components/overview/describe";
import { ThisMonth } from "@/components/overview/this-month";
import { WhereYouStand } from "@/components/overview/where-you-stand";
import {
  availableBridge,
  type AvailableAccountInput,
  type AvailableOccurrenceInput,
} from "@/domain/available/bridge";
import { calendarDateFromIso } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import { cashFlowPeriod, summarizeCashFlow } from "@/domain/ledger/cash-flow";
import { summarizePosition } from "@/domain/ledger/position";
import { fromMajor } from "@/domain/money";
import type { AvailableView } from "@/server/services/available-service";

/**
 * How the Overview reads (Stage 10): the Available band and its free-share
 * ring, This month, and Where you stand with its asset rail. Views come from
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

const band = (v: AvailableView) => renderToStaticMarkup(<AvailableBand view={v} />);
/** The circles of the ring itself: the track, and the arc when something is free. */
const ringCircles = (html: string) =>
  /data-testid="free-share-ring".*?<\/svg>/s.exec(html)![0].match(/<circle/g)!.length;

describe("freeShare", () => {
  it("draws Available against the pool", () => {
    expect(freeShare({ available: t(25_000), pool: t(100_000) })).toEqual({
      free: t(25_000),
      pool: t(100_000),
      fraction: 0.25,
    });
  });

  it("draws an empty track when nothing is free", () => {
    expect(freeShare({ available: t(0), pool: t(100_000) })).toEqual({
      free: null,
      pool: t(100_000),
      fraction: 0,
    });
    expect(freeShare({ available: t(-5_000), pool: t(100_000) })).toMatchObject({
      free: null,
      fraction: 0,
    });
  });

  it("draws no ring when the pool is zero or negative", () => {
    expect(freeShare({ available: t(-1_000), pool: t(0) })).toBeNull();
    expect(freeShare({ available: t(-6_000), pool: t(-5_000) })).toBeNull();
  });
});

describe("AvailableBand", () => {
  it("leads with the hero figure, the ring against the money on hand, the sentence and the way on", () => {
    const v = view(
      [acct("bank", "bank", 50_000), acct("visa", "credit_card", -6_000)],
      [due("rent", 20_000)],
    );
    const html = band(v);
    const words = text(html);
    expect(html).toMatch(/class="[^"]*text-hero[^"]*"/);
    expect(words).toContain("Available now ৳ 24,000");
    expect(words).toContain("Before new income");
    expect(words).toContain("What's left of ৳ 50,000 in your accounts after what you owe on cards");
    // The ring's short words, and the one precise sentence read in their place.
    expect(words).toContain("of ৳ 50,000 on hand");
    expect(words).toContain(
      "Free: ৳24,000 of the ৳50,000 on hand in the accounts and cards that count toward Available.",
    );
    expect(ringCircles(html)).toBe(2);
    expect(html).toContain('href="/available"');
    expect(words).not.toContain("Over-committed");
  });

  it("names the pool on hand, which includes a card's credit, never as what counts", () => {
    const words = text(
      band(view([acct("bank", "bank", 10_000), acct("visa", "credit_card", 500)])),
    );
    expect(words).toContain("of ৳ 10,500 on hand");
    expect(words).not.toMatch(/counted|Counts toward/);
  });

  it("never states a percentage, score or ratio", () => {
    const html = band(view([acct("bank", "bank", 40_000)], [due("rent", 10_000)]));
    expect(text(html)).not.toMatch(/%|percent|score|health/i);
    expect(html).toMatch(/<svg aria-hidden="true"/);
  });

  it("with zero Available: an empty track and nothing free", () => {
    const html = band(view([acct("bank", "bank", 10_000)], [due("rent", 10_000)]));
    expect(text(html)).toContain("Nothing free of ৳ 10,000 on hand");
    expect(ringCircles(html)).toBe(1);
    expect(text(html)).not.toContain("Over-committed");
  });

  it("when over-committed: a true minus, the tag, and an empty track", () => {
    const html = band(
      view(
        [acct("bank", "bank", 20_000), acct("visa", "credit_card", -15_000)],
        [due("rent", 30_000)],
      ),
    );
    const words = text(html);
    expect(words).toContain("Available now − ৳ 25,000");
    expect(words).toContain("Over-committed by ৳ 25,000");
    expect(words).toContain("Nothing free of ৳ 20,000 on hand");
    expect(ringCircles(html)).toBe(1);
  });

  it("with nothing on hand: words instead of a ring", () => {
    for (const accounts of [
      [acct("bank", "bank", 0), acct("savings", "savings", 90_000)],
      [acct("bank", "bank", -5_000)],
    ]) {
      const html = band(view(accounts, [due("rent", 1_000)]));
      expect(html).not.toContain("free-share-ring");
      expect(text(html)).toContain("Nothing on hand in the accounts and cards that count");
      expect(text(html)).not.toMatch(/Nothing free|of ৳/);
    }
  });

  it("does not redraw the bridge or the spoken-for bar", () => {
    const html = band(
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
