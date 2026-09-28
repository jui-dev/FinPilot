import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AttentionList } from "@/components/attention/attention-list";
import { countLine, describeSignal, evidenceHref } from "@/components/attention/describe";
import { calendarDateFromIso, type YearMonth } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import { cashFlowPeriod, type CategorySpending } from "@/domain/ledger/cash-flow";
import { comparisonPeriod, explainSpendingChange } from "@/domain/ledger/month-over-month";
import { verificationOf } from "@/domain/ledger/verification";
import { fromMajor } from "@/domain/money";
import {
  deriveAttention,
  type AttentionFacts,
  type AttentionOccurrenceFact,
} from "@/domain/signals/attention";
import type { AttentionSignal } from "@/domain/signals/signals";

// The list's Hide button calls server actions; rendering needs none of them.
vi.mock("@/app/_server/actions", () => ({
  dismissSignalAction: vi.fn(),
  undismissSignalAction: vi.fn(),
}));

/**
 * How Attention reads (Stage 9): the copy each signal gets, where its evidence
 * links, and the list's empty and non-empty forms. The signals are derived by
 * the real rules from small fact sets, as the service would derive them.
 */
const d = calendarDateFromIso;
const taka = fromMajor;
const TODAY = d("2026-09-22");

const facts = (patch: Partial<AttentionFacts>): AttentionFacts => ({
  today: TODAY,
  occurrences: [],
  earmarks: [],
  checkpoints: [],
  spending: null,
  ...patch,
});

const occurrence = (
  id: string,
  commitmentId: string,
  name: string,
  dueOn: string,
  amountTaka: number,
): AttentionOccurrenceFact => ({
  occurrenceId: id,
  commitmentId,
  name,
  dueOn: d(dueOn),
  expectedAmount: taka(amountTaka),
  display: dueOn > TODAY ? "upcoming" : dueOn === TODAY ? "due_today" : "overdue",
});

const checkpoint = (
  name: string,
  type: AccountType,
  asOf: string,
  stated: number,
  recorded: number,
  adjustment?: number,
) => ({
  accountId: `acc-${name}`,
  accountName: name,
  accountType: type,
  openedOn: d("2026-08-01"),
  archived: false,
  verification: verificationOf(d(asOf), taka(stated), taka(recorded)),
  adjustment:
    adjustment === undefined ? null : { transactionId: `adj-${name}`, amount: taka(adjustment) },
});

const line = (name: string, amountTaka: number): CategorySpending => ({
  categoryId: `cat-${name}`,
  name,
  amount: taka(amountTaka),
});

function spending(current: CategorySpending[], previous: CategorySpending[]) {
  const period = cashFlowPeriod("2026-09" as YearMonth, TODAY);
  const comparison = comparisonPeriod(period, ["2026-09", "2026-08"] as YearMonth[])!;
  return { month: period.month, comparison, change: explainSpendingChange(current, previous) };
}

const one = (f: Partial<AttentionFacts>): AttentionSignal => {
  const [signal] = deriveAttention(facts(f));
  if (!signal) throw new Error("fixture produced no signal");
  return signal;
};

const row = (f: Partial<AttentionFacts>) => describeSignal(one(f), TODAY);

// ---------------------------------------------------------------------------
// Copy per kind
// ---------------------------------------------------------------------------

describe("how each signal reads", () => {
  it("an overdue payment: when it was due and that it is unpaid", () => {
    expect(row({ occurrences: [occurrence("o1", "rent", "Rent", "2026-09-01", 30_000)] })).toEqual({
      key: "commitment_overdue:rent",
      tag: { label: "Overdue", tone: "warning", icon: "calendar" },
      title: "Rent is overdue",
      detail: "Due 1 Sep, 21 days ago, and not paid or skipped.",
      amount: { value: taka(30_000), sign: "none" },
      evidence: { href: "/commitments", label: "Pay or skip in Commitments" },
      hide: null,
    });
    const two = row({
      occurrences: [
        occurrence("o1", "rent", "Rent", "2026-08-01", 30_000),
        occurrence("o2", "rent", "Rent", "2026-09-01", 30_000),
      ],
    });
    expect(two.detail).toBe(
      "2 payments are not paid or skipped; the oldest was due 1 Aug, 52 days ago.",
    );
    expect(two.amount.value).toBe(taka(60_000));
  });

  it("a payment due today, and one coming up, told apart", () => {
    const today = row({ occurrences: [occurrence("o1", "net", "Internet", "2026-09-22", 1_500)] });
    expect(today).toMatchObject({
      tag: { label: "Due today", tone: "warning" },
      title: "Internet is due today",
      evidence: { href: "/commitments", label: "Pay or skip in Commitments" },
      hide: null,
    });
    const soon = row({ occurrences: [occurrence("o1", "net", "Internet", "2026-09-25", 1_500)] });
    expect(soon).toMatchObject({
      tag: { label: "In 3 days", tone: "info", icon: "calendar-soon" },
      title: "Internet is due Fri, 25 Sep",
      hide: null,
    });
    const tomorrow = row({ occurrences: [occurrence("o1", "net", "Gas", "2026-09-23", 900)] });
    expect(tomorrow).toMatchObject({ tag: { label: "Tomorrow" }, title: "Gas is due tomorrow" });
  });

  it("money set aside that is short: berry, with what is still covered", () => {
    expect(
      row({
        earmarks: [
          {
            itemId: "laptop",
            itemName: "Laptop",
            accountId: "savings",
            accountName: "Savings",
            reserved: taka(100_000),
            covered: taka(90_000),
            short: taka(10_000),
          },
        ],
      }),
    ).toMatchObject({
      tag: { label: "Short", tone: "negative", icon: "alert" },
      title: "Laptop is short on Savings",
      detail:
        "Savings now holds less than is set aside there: ৳90,000 of ৳1,00,000 is still covered.",
      amount: { value: taka(10_000), note: "short", negative: true },
      evidence: { href: "/set-aside", label: "Refill or release in Set aside" },
      hide: null,
    });
  });

  it("a verification that no longer matches, worded as Accounts words it, with its entries", () => {
    const cash = row({ checkpoints: [checkpoint("Cash", "cash", "2026-09-20", 4_200, 4_650)] });
    expect(cash).toMatchObject({
      tag: { label: "Doesn't match", tone: "warning" },
      title: "Cash no longer matches its 20 Sep verification",
      detail: "The ledger now records ৳4,650 for that day; you verified ৳4,200.",
      amount: { value: taka(450), note: "off" },
      evidence: {
        href: "/activity?account=acc-Cash&from=2026-08-01&to=2026-09-20",
        label: "Review entries through 20 Sep",
      },
      hide: null,
    });
    // A card's balance reads as an amount owed.
    const visa = row({
      checkpoints: [checkpoint("Visa", "credit_card", "2026-09-19", -6_000, -9_000)],
    });
    expect(visa.detail).toBe(
      "The ledger now records ৳9,000 owed for that day; you verified ৳6,000 owed.",
    );
    expect(visa.amount.value).toBe(taka(3_000));
  });

  it("spending up: the month's increase, what accounts for it, and what was lower", () => {
    const signal = row({
      spending: spending(
        [
          line("Housing", 30_000),
          line("Health", 30_000),
          line("Groceries", 4_200),
          line("Shopping", 1_800),
          line("Food & Dining", 450),
        ],
        [
          line("Housing", 30_000),
          line("Groceries", 5_000),
          line("Shopping", 3_800),
          line("Food & Dining", 1_200),
        ],
      ),
    });
    expect(signal).toMatchObject({
      key: "spending_up:2026-09",
      tag: { label: "Spending up", tone: "neutral", icon: "trend" },
      title: "Spending is up ৳26,450 on the same days last month",
      detail:
        "Health accounts for all of the increase. Shopping, Groceries and Food & Dining were lower.",
      amount: { value: taka(26_450), sign: "always" },
      evidence: { href: "/cash-flow#cash-flow-change", label: "See what changed" },
      hide: { until: "September" },
    });

    const shared = row({
      spending: spending(
        [line("Health", 20_000), line("Shopping", 11_000)],
        [line("Health", 1_000), line("Shopping", 1_000)],
      ),
    });
    // 19,000 and 10,000 of a 29,000 increase, as whole percentages.
    expect(shared.detail).toBe("Health accounts for 66% of the increase, Shopping for 34%.");
  });

  it("an unexplained adjustment: which way the count differed, and the day to look at", () => {
    const cash = row({
      checkpoints: [checkpoint("Cash", "cash", "2026-09-20", 4_200, 4_200, -350)],
    });
    expect(cash).toMatchObject({
      key: "unexplained_adjustment:adj-Cash",
      tag: { label: "Adjusted", tone: "neutral", icon: "scale" },
      title: "Cash had an unexplained difference",
      detail:
        "Verifying on 20 Sep found ৳350 less than the ledger recorded, so an adjustment was added.",
      amount: { value: taka(350), sign: "none" },
      evidence: {
        href: "/activity?account=acc-Cash&from=2026-09-20&to=2026-09-20",
        label: "See the adjustment",
      },
      hide: { until: null },
    });
    const card = row({
      checkpoints: [checkpoint("Visa", "credit_card", "2026-09-20", -6_000, -6_000, 200)],
    });
    expect(card.detail).toBe(
      "Verifying on 20 Sep corrected the recorded balance by ৳200 with an adjustment.",
    );
  });

  it("never exposes internal names in what a person reads", () => {
    const all = deriveAttention(
      facts({
        occurrences: [
          occurrence("o1", "rent", "Rent", "2026-09-01", 30_000),
          occurrence("o2", "gym", "Gym", "2026-09-22", 2_000),
          occurrence("o3", "net", "Internet", "2026-09-25", 1_500),
        ],
        checkpoints: [
          checkpoint("Cash", "cash", "2026-09-20", 4_200, 4_200, -350),
          checkpoint("bKash", "mobile_wallet", "2026-09-18", 9_000, 8_500),
        ],
        spending: spending([line("Health", 30_000)], [line("Health", 1_000)]),
      }),
    );
    for (const signal of all) {
      const { title, detail, tag, evidence } = describeSignal(signal, TODAY);
      expect(`${tag.label} ${title} ${detail} ${evidence.label}`).not.toMatch(
        /occurrence|checkpoint|earmark|signal|drift|_/i,
      );
    }
  });
});

describe("evidence links", () => {
  it("opens a past month's What changed with its month", () => {
    expect(evidenceHref({ page: "cash_flow_change", month: "2026-08" as YearMonth }, TODAY)).toBe(
      "/cash-flow?month=2026-08#cash-flow-change",
    );
  });
});

describe("the count line", () => {
  it("counts in words", () => {
    expect(countLine(1)).toBe("1 thing needs a look");
    expect(countLine(3)).toBe("3 things need a look");
  });
});

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

describe("AttentionList", () => {
  it("says plainly when nothing needs attention, with one way on to Available", () => {
    const html = renderToStaticMarkup(
      <AttentionList signals={[]} today={TODAY} labelledBy="attention-title" />,
    );
    expect(html).toContain("Nothing needs your attention");
    expect(html).toContain('href="/available"');
    expect(html).not.toMatch(/safe|healthy|good/i);
  });

  it("lists the signals in order, and offers Hide only where a signal can be hidden", () => {
    const signals = deriveAttention(
      facts({
        occurrences: [occurrence("o3", "net", "Internet", "2026-09-25", 1_500)],
        checkpoints: [checkpoint("Cash", "cash", "2026-09-20", 4_200, 4_200, -350)],
        spending: spending([line("Health", 30_000)], [line("Health", 1_000)]),
      }),
    );
    const html = renderToStaticMarkup(
      <AttentionList signals={signals} today={TODAY} labelledBy="attention-title" />,
    );
    const titles = [
      "Internet is due Fri, 25 Sep",
      "Spending is up ৳29,000 on the same days last month",
      "Cash had an unexplained difference",
    ];
    const positions = titles.map((t) => html.indexOf(t));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.match(/<li/g)).toHaveLength(3);
    // Two Hide buttons: spending up (for the month) and the adjustment.
    expect(html.match(/>Hide</g)).toHaveLength(2);
    expect(html).toContain(" for September");
    expect(html).toContain('aria-labelledby="attention-title"');
  });
});
