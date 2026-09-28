import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, calendarDateFromIso, type YearMonth } from "@/domain/calendar-date";
import type { OccurrenceDisplayState } from "@/domain/commitments/occurrences";
import type { AccountType } from "@/domain/ledger/accounts";
import { cashFlowPeriod, type CategorySpending } from "@/domain/ledger/cash-flow";
import { comparisonPeriod, explainSpendingChange } from "@/domain/ledger/month-over-month";
import { NEVER_VERIFIED, verificationOf, type Verification } from "@/domain/ledger/verification";
import { fromMajor, money } from "@/domain/money";
import {
  ADJUSTMENT_RECENT_DAYS,
  deriveAttention,
  DUE_SOON_DAYS,
  isSpendingUp,
  SPENDING_UP_FLOOR,
  type AttentionCheckpointFact,
  type AttentionEarmarkFact,
  type AttentionFacts,
  type AttentionOccurrenceFact,
  type AttentionSpendingFact,
} from "@/domain/signals/attention";
import {
  ATTENTION_KINDS,
  isDismissible,
  priorityOf,
  type AttentionSignal,
} from "@/domain/signals/signals";

const d = calendarDateFromIso;
const taka = fromMajor;
const ym = (value: string) => value as YearMonth;
const TODAY = d("2026-09-22");

// ---------------------------------------------------------------------------
// Facts, built from the owning features' own derivations where one exists
// ---------------------------------------------------------------------------

const occurrence = (
  occurrenceId: string,
  commitmentId: string,
  name: string,
  dueOn: string,
  amountTaka: number,
  display?: OccurrenceDisplayState,
): AttentionOccurrenceFact => {
  const due = d(dueOn);
  return {
    occurrenceId,
    commitmentId,
    name,
    dueOn: due,
    expectedAmount: taka(amountTaka),
    // Commitments' own display rule for a pending occurrence, unless given.
    display: display ?? (due > TODAY ? "upcoming" : due === TODAY ? "due_today" : "overdue"),
  };
};

const earmark = (
  itemId: string,
  itemName: string,
  accountId: string,
  accountName: string,
  reservedTaka: number,
  coveredTaka: number,
): AttentionEarmarkFact => ({
  itemId,
  itemName,
  accountId,
  accountName,
  reserved: taka(reservedTaka),
  covered: taka(coveredTaka),
  short: taka(reservedTaka - coveredTaka),
});

const checkpoint = (
  accountId: string,
  accountName: string,
  verification: Verification,
  options: {
    adjustment?: { transactionId: string; amountTaka: number };
    archived?: boolean;
    accountType?: AccountType;
    openedOn?: string;
  } = {},
): AttentionCheckpointFact => ({
  accountId,
  accountName,
  accountType: options.accountType ?? "cash",
  openedOn: d(options.openedOn ?? "2026-08-01"),
  archived: options.archived ?? false,
  verification,
  adjustment: options.adjustment
    ? {
        transactionId: options.adjustment.transactionId,
        amount: taka(options.adjustment.amountTaka),
      }
    : null,
});

/** A checkpoint status exactly as reconciliation derives it. */
const verified = (asOf: string, statedTaka: number, recordedTaka = statedTaka) =>
  verificationOf(d(asOf), taka(statedTaka), taka(recordedTaka));

const line = (name: string, amountTaka: number): CategorySpending => ({
  categoryId: `cat-${name}`,
  name,
  amount: taka(amountTaka),
});

/** The month-to-date comparison exactly as Cash flow builds it. */
const spending = (
  current: readonly CategorySpending[],
  previous: readonly CategorySpending[],
  today = TODAY,
): AttentionSpendingFact => {
  const period = cashFlowPeriod(ym(today.slice(0, 7)), today);
  const comparison = comparisonPeriod(period, [period.month, ym("2026-08"), ym("2026-09")]);
  if (comparison === null) throw new Error("fixture: no comparison");
  return { month: period.month, comparison, change: explainSpendingChange(current, previous) };
};

const facts = (patch: Partial<AttentionFacts>): AttentionFacts => ({
  today: TODAY,
  occurrences: [],
  earmarks: [],
  checkpoints: [],
  spending: null,
  ...patch,
});

const kinds = (signals: readonly AttentionSignal[]) => signals.map((s) => s.kind);
const keys = (signals: readonly AttentionSignal[]) => signals.map((s) => s.key);

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

describe("the signal model", () => {
  it("has seven kinds in the committed priority order", () => {
    expect(ATTENTION_KINDS).toEqual([
      "commitment_overdue",
      "commitment_due_today",
      "set_aside_short",
      "verification_changed",
      "commitment_due_soon",
      "spending_up",
      "unexplained_adjustment",
    ]);
    expect(ATTENTION_KINDS.map(priorityOf)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("lets only spending_up and unexplained_adjustment be dismissed", () => {
    expect(ATTENTION_KINDS.filter(isDismissible)).toEqual([
      "spending_up",
      "unexplained_adjustment",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

describe("commitment signals", () => {
  it("is due soon 1 to 7 days ahead, and nothing from day 8", () => {
    const signals = deriveAttention(
      facts({
        occurrences: [
          occurrence("o1", "c1", "Internet", "2026-09-23", 1_500),
          occurrence("o7", "c7", "Gym", addDays(TODAY, DUE_SOON_DAYS), 2_000),
          occurrence("o8", "c8", "Rent", addDays(TODAY, DUE_SOON_DAYS + 1), 30_000),
        ],
      }),
    );
    expect(signals.map((s) => [s.kind, s.key])).toEqual([
      ["commitment_due_soon", "commitment_due_soon:o1"],
      ["commitment_due_soon", "commitment_due_soon:o7"],
    ]);
    expect(signals[1]).toMatchObject({ daysUntil: 7, amount: taka(2_000), name: "Gym" });
  });

  it("is due today at 0 days", () => {
    const [signal] = deriveAttention(
      facts({ occurrences: [occurrence("o1", "c1", "Internet", "2026-09-22", 1_500)] }),
    );
    expect(signal).toMatchObject({
      kind: "commitment_due_today",
      key: "commitment_due_today:o1",
      daysUntil: 0,
      amount: taka(1_500),
      evidence: { page: "commitments" },
      dismissible: false,
    });
  });

  it("groups a commitment's overdue occurrences into one signal, dated by the oldest", () => {
    const signals = deriveAttention(
      facts({
        occurrences: [
          occurrence("rent-sep", "rent", "Rent", "2026-09-01", 30_000),
          occurrence("rent-aug", "rent", "Rent", "2026-08-01", 30_000),
          occurrence("net-sep", "net", "Internet", "2026-09-20", 1_500),
        ],
      }),
    );
    expect(signals).toHaveLength(2);
    expect(signals[0]).toMatchObject({
      kind: "commitment_overdue",
      key: "commitment_overdue:rent",
      commitmentId: "rent",
      occurrenceIds: ["rent-aug", "rent-sep"],
      oldestDueOn: "2026-08-01",
      daysOverdue: 52,
      total: taka(60_000),
    });
    expect(signals[1]).toMatchObject({ key: "commitment_overdue:net", daysOverdue: 2 });
  });

  it("ignores paid and skipped occurrences, whatever their date", () => {
    expect(
      deriveAttention(
        facts({
          occurrences: [
            occurrence("o1", "c1", "Rent", "2026-09-01", 30_000, "paid"),
            occurrence("o2", "c2", "Internet", "2026-09-22", 1_500, "skipped"),
            occurrence("o3", "c3", "Gym", "2026-09-24", 2_000, "paid"),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("changes kind and key as one occurrence moves from due soon to due today to overdue", () => {
    const keyOn = (today: string) =>
      keys(
        deriveAttention(
          facts({
            today: d(today),
            occurrences: [
              {
                ...occurrence("o1", "c1", "Internet", "2026-09-25", 1_500),
                display:
                  today < "2026-09-25"
                    ? "upcoming"
                    : today === "2026-09-25"
                      ? "due_today"
                      : "overdue",
              },
            ],
          }),
        ),
      );
    expect(keyOn("2026-09-22")).toEqual(["commitment_due_soon:o1"]);
    expect(keyOn("2026-09-25")).toEqual(["commitment_due_today:o1"]);
    expect(keyOn("2026-09-26")).toEqual(["commitment_overdue:c1"]);
  });
});

// ---------------------------------------------------------------------------
// Set aside
// ---------------------------------------------------------------------------

describe("set_aside_short", () => {
  it("is one signal per (item, account) that the backing reports short, and none when covered", () => {
    const signals = deriveAttention(
      facts({
        earmarks: [
          earmark("laptop", "Laptop", "savings", "Savings", 100_000, 90_000),
          earmark("laptop", "Laptop", "bank", "Bank", 20_000, 20_000),
        ],
      }),
    );
    expect(signals).toEqual([
      expect.objectContaining({
        kind: "set_aside_short",
        key: "set_aside_short:laptop:savings",
        itemName: "Laptop",
        accountName: "Savings",
        short: taka(10_000),
        evidence: { page: "set_aside" },
        dismissible: false,
      }),
    ]);
  });

  it("keeps its key when the shortfall changes", () => {
    const keyAt = (coveredTaka: number) =>
      keys(
        deriveAttention(
          facts({
            earmarks: [earmark("laptop", "Laptop", "savings", "Savings", 100_000, coveredTaka)],
          }),
        ),
      );
    expect(keyAt(90_000)).toEqual(keyAt(40_000));
  });

  it("rejects the same earmark twice", () => {
    const e = earmark("laptop", "Laptop", "savings", "Savings", 100_000, 90_000);
    expect(() => deriveAttention(facts({ earmarks: [e, e] }))).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

describe("checkpoint signals", () => {
  it("says nothing about an account that was never verified, or still matches with no adjustment", () => {
    expect(
      deriveAttention(
        facts({
          checkpoints: [
            checkpoint("bank", "Bank", NEVER_VERIFIED),
            checkpoint("cash", "Cash", verified("2026-09-20", 4_200)),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("flags a checkpoint that no longer matches, with the entries through its date as evidence", () => {
    const [signal] = deriveAttention(
      facts({ checkpoints: [checkpoint("cash", "Cash", verified("2026-09-20", 4_200, 4_650))] }),
    );
    expect(signal).toMatchObject({
      kind: "verification_changed",
      key: "verification_changed:cash:2026-09-20",
      asOf: "2026-09-20",
      stated: taka(4_200),
      recorded: taka(4_650),
      drift: taka(450),
      dismissible: false,
      evidence: {
        page: "activity",
        accountId: "cash",
        range: { start: "2026-08-01", end: "2026-09-21" },
      },
    });
  });

  it("gives one signal per checkpoint: a changed checkpoint replaces its adjustment", () => {
    const signals = deriveAttention(
      facts({
        checkpoints: [
          checkpoint("cash", "Cash", verified("2026-09-20", 4_200, 4_650), {
            adjustment: { transactionId: "adj-1", amountTaka: -350 },
          }),
        ],
      }),
    );
    expect(kinds(signals)).toEqual(["verification_changed"]);
  });

  it("flags a recent adjustment on a checkpoint that still matches, for exactly 7 days", () => {
    const at = (asOf: string) =>
      deriveAttention(
        facts({
          checkpoints: [
            checkpoint("cash", "Cash", verified(asOf, 4_200), {
              adjustment: { transactionId: "adj-1", amountTaka: -350 },
            }),
          ],
        }),
      );
    const lastDay = addDays(TODAY, -ADJUSTMENT_RECENT_DAYS);
    expect(at(lastDay)).toEqual([
      expect.objectContaining({
        kind: "unexplained_adjustment",
        key: "unexplained_adjustment:adj-1",
        asOf: lastDay,
        amount: taka(-350),
        dismissible: true,
        evidence: {
          page: "activity",
          accountId: "cash",
          range: { start: lastDay, end: addDays(lastDay, 1) },
        },
      }),
    ]);
    expect(at(addDays(lastDay, -1))).toEqual([]);
  });

  it("gives no checkpoint signal for an archived account", () => {
    expect(
      deriveAttention(
        facts({
          checkpoints: [
            checkpoint("old", "Old wallet", verified("2026-09-20", 0, 500), { archived: true }),
            checkpoint("spare", "Spare", verified("2026-09-21", 1_000), {
              archived: true,
              adjustment: { transactionId: "adj-2", amountTaka: 200 },
            }),
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("still flags a shortfall on an archived account, because Release from it is allowed", () => {
    // Backing facts carry no archive filter: the rule never drops them.
    expect(
      kinds(
        deriveAttention(
          facts({ earmarks: [earmark("trip", "Trip", "old", "Old wallet", 5_000, 0)] }),
        ),
      ),
    ).toEqual(["set_aside_short"]);
  });
});

// ---------------------------------------------------------------------------
// Spending
// ---------------------------------------------------------------------------

describe("spending_up", () => {
  it("fires at exactly max(৳5,000, 20% of the previous total), and not one poisha below", () => {
    // 20% of ৳40,000 is ৳8,000, above the floor.
    expect(isSpendingUp(taka(8_000), taka(40_000))).toBe(true);
    expect(isSpendingUp(money(taka(8_000) - 1), taka(40_000))).toBe(false);
    // 20% of ৳10,000 is ৳2,000, so the ৳5,000 floor decides.
    expect(isSpendingUp(SPENDING_UP_FLOOR, taka(10_000))).toBe(true);
    expect(isSpendingUp(money(SPENDING_UP_FLOOR - 1), taka(10_000))).toBe(false);
  });

  it("never fires on a previous total of zero, however large the increase", () => {
    expect(isSpendingUp(taka(50_000), taka(0))).toBe(false);
    expect(deriveAttention(facts({ spending: spending([line("Housing", 30_000)], []) }))).toEqual(
      [],
    );
  });

  it("never fires for a decrease", () => {
    expect(
      deriveAttention(facts({ spending: spending([line("Food", 1_000)], [line("Food", 30_000)]) })),
    ).toEqual([]);
  });

  it("fires from the first day of the month: there is no day-of-month guard", () => {
    const first = d("2026-09-01");
    const signals = deriveAttention(
      facts({
        today: first,
        spending: spending([line("Housing", 30_000)], [line("Housing", 1_000)], first),
      }),
    );
    expect(kinds(signals)).toEqual(["spending_up"]);
  });

  it("is one signal for the month's total, carrying What changed's material drivers and offsets", () => {
    // A-72's numbers: Sep 1–22 against Aug 1–22.
    const change = spending(
      [
        line("Housing", 30_000),
        line("Health", 30_000),
        line("Groceries", 4_200),
        line("Shopping", 1_800),
        line("Food & Dining", 450),
        line("Fees & Charges", 37),
      ],
      [
        line("Housing", 30_000),
        line("Groceries", 5_000),
        line("Shopping", 3_800),
        line("Food & Dining", 1_200),
        line("Fees & Charges", 37),
      ],
    );
    const [signal] = deriveAttention(facts({ spending: change }));
    expect(signal).toMatchObject({
      kind: "spending_up",
      key: "spending_up:2026-09",
      dismissible: true,
      evidence: { page: "cash_flow_change", month: "2026-09" },
      month: "2026-09",
      comparisonRange: { start: "2026-08-01", end: "2026-08-23" },
      previousTotal: taka(40_037),
      currentTotal: taka(66_487),
      net: taka(26_450),
      grossIncreases: taka(30_000),
    });
    if (signal?.kind !== "spending_up") throw new Error("expected spending_up");
    expect(signal.drivers.map((l) => [l.name, l.change, l.shareOfIncreases])).toEqual([
      ["Health", taka(30_000), { numerator: taka(30_000), denominator: taka(30_000) }],
    ]);
    expect(signal.offsets.map((l) => [l.name, l.change])).toEqual([
      ["Shopping", taka(-2_000)],
      ["Groceries", taka(-800)],
      ["Food & Dining", taka(-750)],
    ]);
  });

  it("leaves immaterial changes out of the drivers and offsets", () => {
    const [signal] = deriveAttention(
      facts({
        spending: spending(
          [line("Health", 20_000), line("Transport", 1_300)],
          [line("Health", 1_000), line("Transport", 1_200)],
        ),
      }),
    );
    if (signal?.kind !== "spending_up") throw new Error("expected spending_up");
    expect(signal.drivers.map((l) => l.name)).toEqual(["Health"]);
    expect(signal.offsets).toEqual([]);
  });

  it("does not fire for a complete month's comparison", () => {
    const period = cashFlowPeriod(ym("2026-08"), TODAY);
    const comparison = comparisonPeriod(period, [ym("2026-09"), ym("2026-08"), ym("2026-07")])!;
    expect(comparison.kind).toBe("complete");
    expect(
      deriveAttention(
        facts({
          spending: {
            month: ym("2026-08"),
            comparison,
            change: explainSpendingChange([line("Health", 50_000)], [line("Health", 1_000)]),
          },
        }),
      ),
    ).toEqual([]);
  });

  it("keeps the month's key as the amounts change", () => {
    const keyFor = (healthTaka: number) =>
      keys(
        deriveAttention(
          facts({ spending: spending([line("Health", healthTaka)], [line("Health", 1_000)]) }),
        ),
      );
    expect(keyFor(20_000)).toEqual(["spending_up:2026-09"]);
    expect(keyFor(60_000)).toEqual(["spending_up:2026-09"]);
  });
});

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

/** One fact behind each of the seven kinds. */
const everyKind = (): AttentionFacts =>
  facts({
    occurrences: [
      occurrence("net-sep", "net", "Internet", "2026-09-25", 1_500),
      occurrence("gym-sep", "gym", "Gym", "2026-09-22", 2_000),
      occurrence("rent-sep", "rent", "Rent", "2026-09-01", 30_000),
    ],
    earmarks: [earmark("laptop", "Laptop", "savings", "Savings", 100_000, 90_000)],
    checkpoints: [
      checkpoint("cash", "Cash", verified("2026-09-20", 4_200), {
        adjustment: { transactionId: "adj-1", amountTaka: -350 },
      }),
      checkpoint("bkash", "bKash", verified("2026-09-18", 9_000, 8_500), {
        accountType: "mobile_wallet",
      }),
    ],
    spending: spending([line("Health", 30_000)], [line("Health", 1_000)]),
  });

describe("ordering", () => {
  it("orders the seven kinds by their fixed priority", () => {
    expect(kinds(deriveAttention(everyKind()))).toEqual([...ATTENTION_KINDS]);
  });

  it("breaks ties within a kind by its own rule, then by name, then by key", () => {
    const signals = deriveAttention(
      facts({
        occurrences: [
          occurrence("b", "cb", "Water", "2026-09-25", 500),
          occurrence("a", "ca", "Gas", "2026-09-25", 500),
          occurrence("c", "cc", "Phone", "2026-09-23", 500),
          occurrence("r2", "rent", "Rent", "2026-09-10", 30_000),
          occurrence("x1", "school", "School", "2026-09-05", 8_000),
        ],
        earmarks: [
          earmark("trip", "Trip", "bank", "Bank", 5_000, 4_000),
          earmark("car", "Car", "bank", "Bank", 50_000, 20_000),
        ],
        checkpoints: [
          checkpoint("cash", "Cash", verified("2026-09-20", 4_200, 4_300)),
          checkpoint("visa", "Visa", verified("2026-09-19", -6_000, -9_000), {
            accountType: "credit_card",
          }),
        ],
      }),
    );
    expect(keys(signals)).toEqual([
      // Overdue: oldest first.
      "commitment_overdue:school",
      "commitment_overdue:rent",
      // Short: larger shortfall first.
      "set_aside_short:car:bank",
      "set_aside_short:trip:bank",
      // Verification: larger drift first, whatever its sign.
      "verification_changed:visa:2026-09-19",
      "verification_changed:cash:2026-09-20",
      // Due soon: earliest first, then by name on the same date.
      "commitment_due_soon:c",
      "commitment_due_soon:a",
      "commitment_due_soon:b",
    ]);
  });

  it("gives the same signals in the same order whatever order the facts arrive in", () => {
    const base = everyKind();
    const expected = deriveAttention(base);
    fc.assert(
      fc.property(
        fc.shuffledSubarray([...base.occurrences], { minLength: base.occurrences.length }),
        fc.shuffledSubarray([...base.checkpoints], { minLength: base.checkpoints.length }),
        (occurrences, checkpoints) => {
          const signals = deriveAttention({ ...base, occurrences, checkpoints });
          expect(signals).toEqual(expected);
          expect(new Set(keys(signals)).size).toBe(signals.length);
        },
      ),
    );
  });

  it("has no severity or score: the kind is the priority", () => {
    for (const signal of deriveAttention(everyKind())) {
      expect(signal).not.toHaveProperty("severity");
      expect(signal).not.toHaveProperty("score");
      expect(signal.priority).toBe(priorityOf(signal.kind));
      expect(signal.dismissible).toBe(isDismissible(signal.kind));
    }
  });
});
