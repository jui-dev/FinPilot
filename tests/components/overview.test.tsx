import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AvailableBand } from "@/components/overview/available-band";
import { assetRail, freeShare } from "@/components/overview/describe";
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
  it("leads with Available, its sentence and the free share, and links to /available", () => {
    const v = view(
      [acct("bank", "bank", 50_000), acct("visa", "credit_card", -6_000)],
      [due("rent", 20_000)],
    );
    const html = band(v);
    const words = text(html);
    expect(words).toContain("Available now ৳ 24,000");
    expect(words).toContain("Before new income");
    expect(words).toContain("What's left of ৳ 50,000 in your accounts after what you owe on cards");
    expect(words).toContain("Free ৳ 24,000 of ৳ 50,000");
    expect(ringCircles(html)).toBe(2);
    expect(html).toContain('href="/available"');
    expect(words).not.toContain("Over-committed");
  });

  it("never states a percentage, score or ratio", () => {
    const html = band(view([acct("bank", "bank", 40_000)], [due("rent", 10_000)]));
    expect(text(html)).not.toMatch(/%|percent|score|health/i);
    // The drawing is hidden from assistive technology; the words carry the amounts.
    expect(html).toMatch(/<svg aria-hidden="true"/);
  });

  it("with zero Available: an empty track and nothing free", () => {
    const html = band(view([acct("bank", "bank", 10_000)], [due("rent", 10_000)]));
    expect(text(html)).toContain("Nothing free of ৳ 10,000");
    // The track only: one circle, no arc.
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
    expect(words).toContain("Nothing free of ৳ 20,000");
    expect(ringCircles(html)).toBe(1);
  });

  it("draws no ring when nothing is in the pool", () => {
    for (const accounts of [
      [acct("bank", "bank", 0), acct("savings", "savings", 90_000)],
      [acct("bank", "bank", -5_000)],
    ]) {
      const html = band(view(accounts, [due("rent", 1_000)]));
      expect(html).not.toContain("free-share-ring");
      expect(text(html)).not.toMatch(/Free|Nothing free/);
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

describe("ThisMonth", () => {
  const period = cashFlowPeriod("2026-09" as never, TODAY);

  it("states what came in, went out and was left over, with the rows behind them", () => {
    const html = renderToStaticMarkup(
      <ThisMonth summary={summarizeCashFlow(t(95_000), t(66_487))} period={period} />,
    );
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
    // No savings rate, comparison or chart.
    expect(words).not.toMatch(/%|Savings rate|vs /);
    expect(html).not.toContain('<svg aria-hidden="true" data-testid');
  });

  it("writes a month that spent more with a true minus, and links nothing that is zero", () => {
    const html = renderToStaticMarkup(
      <ThisMonth summary={summarizeCashFlow(t(0), t(4_000))} period={period} />,
    );
    expect(text(html)).toContain("Left over − ৳ 4,000");
    expect(html).not.toContain("type=income");
  });
});

describe("WhereYouStand", () => {
  const stand = (accounts: AvailableAccountInput[]) =>
    renderToStaticMarkup(
      <WhereYouStand position={positionOf(accounts)} available={view(accounts)} />,
    );

  it("shows net worth, Own and Owe, and how much of what you own counts toward Available", () => {
    const html = stand([
      acct("Bank", "bank", 100_000),
      acct("Savings", "savings", 60_000),
      acct("Visa", "credit_card", -6_000),
    ]);
    const words = text(html);
    expect(words).toContain("Net worth ৳ 1,54,000");
    expect(words).toContain("Own ৳ 1,60,000");
    expect(words).toContain("Owe ৳ 6,000");
    expect(words).not.toContain("Credit on cards");
    expect(words).toContain("Counts toward Available ৳ 1,00,000");
    expect(words).toContain("Outside Available ৳ 60,000 · Savings");
    expect(html).toContain('data-testid="asset-rail"');
    expect(html).toContain('href="/accounts"');
  });

  it("reads a card holding credit as Credit on cards, never Owe", () => {
    const words = text(stand([acct("Bank", "bank", 10_000), acct("Visa", "credit_card", 500)]));
    expect(words).toContain("Credit on cards ৳ 500");
    expect(words).not.toContain("Owe");
  });

  it("says everything counts when nothing is outside Available", () => {
    const html = stand([acct("Bank", "bank", 10_000), acct("Visa", "credit_card", 0)]);
    const words = text(html);
    expect(words).toContain("Owe ৳ 0");
    expect(words).toContain("Everything you own counts toward Available.");
    expect(words).not.toContain("Outside Available");
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
