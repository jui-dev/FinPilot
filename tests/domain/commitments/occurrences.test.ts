import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, calendarDateFromIso, type CalendarDate } from "@/domain/calendar-date";
import {
  displayState,
  isRegenerable,
  isUntouched,
  materialisedThrough,
  occurrenceState,
  pendingTiming,
  regenerationPlan,
  type StoredOccurrence,
} from "@/domain/commitments/occurrences";
import { dueDatesIn, type CommitmentRule } from "@/domain/commitments/schedule";
import { fromMajor } from "@/domain/money";

const d = calendarDateFromIso;
const TODAY = d("2026-09-22");

describe("occurrenceState is derived from the ledger link, never stored", () => {
  it("is pending with no link and no skip", () => {
    expect(occurrenceState({ skipped: false, link: null })).toBe("pending");
  });

  it("is paid while the linked transaction is an active expense", () => {
    expect(occurrenceState({ skipped: false, link: { type: "expense", deleted: false } })).toBe(
      "paid",
    );
  });

  it("returns to pending when the linked expense is deleted (and to paid on restore)", () => {
    expect(occurrenceState({ skipped: false, link: { type: "expense", deleted: true } })).toBe(
      "pending",
    );
  });

  it("is pending when the linked transaction was edited into something that is not spending", () => {
    for (const type of ["transfer", "income", "refund"] as const) {
      expect(occurrenceState({ skipped: false, link: { type, deleted: false } })).toBe("pending");
    }
  });

  it("is skipped when the person skipped it", () => {
    expect(occurrenceState({ skipped: true, link: null })).toBe("skipped");
  });

  it("refuses the impossible skipped-and-linked combination", () => {
    expect(() =>
      occurrenceState({ skipped: true, link: { type: "expense", deleted: false } }),
    ).toThrow(RangeError);
  });
});

describe("pending timing", () => {
  it("reads upcoming, due today or overdue relative to today", () => {
    expect(pendingTiming(d("2026-09-25"), TODAY)).toBe("upcoming");
    expect(pendingTiming(d("2026-09-23"), TODAY)).toBe("upcoming");
    expect(pendingTiming(TODAY, TODAY)).toBe("due_today");
    expect(pendingTiming(d("2026-09-21"), TODAY)).toBe("overdue");
    // M1-1: the Rent occurrence of Sep 1, back to pending, reads overdue.
    expect(pendingTiming(d("2026-09-01"), TODAY)).toBe("overdue");
  });

  it("applies only while pending; paid and skipped read as themselves", () => {
    expect(displayState("pending", d("2026-09-01"), TODAY)).toBe("overdue");
    expect(displayState("paid", d("2026-09-01"), TODAY)).toBe("paid");
    expect(displayState("skipped", d("2026-10-01"), TODAY)).toBe("skipped");
  });
});

describe("materialisation horizon", () => {
  it("runs through today + 60 days (Sep 22 → Nov 21)", () => {
    expect(materialisedThrough(TODAY)).toBe("2026-11-21");
  });
});

// ---------------------------------------------------------------------------
// Regeneration after a rule edit
// ---------------------------------------------------------------------------

const occurrence = (
  id: string,
  dueOn: string,
  amount: number,
  outcome: { skipped?: boolean; linked?: boolean } = {},
): StoredOccurrence => ({
  id,
  dueOn: d(dueOn),
  expectedAmount: fromMajor(amount),
  skipped: outcome.skipped ?? false,
  linked: outcome.linked ?? false,
});

const monthlyRule = (anchorOn: string, amount: number, endOn: string | null = null) =>
  ({
    schedule: {
      frequency: "monthly",
      interval: 1,
      anchorOn: d(anchorOn),
      endOn: endOn === null ? null : d(endOn),
    },
    expectedAmount: fromMajor(amount),
  }) satisfies CommitmentRule;

/** Rent as materialised on Sep 22: three paid, then Oct 1 and Nov 1 pending. */
const rent = [
  occurrence("aug", "2026-08-01", 30_000, { linked: true }),
  occurrence("sep", "2026-09-01", 30_000, { linked: true }),
  occurrence("oct", "2026-10-01", 30_000),
  occurrence("nov", "2026-11-01", 30_000),
];

describe("isUntouched / isRegenerable", () => {
  it("treats any link, even to a since-deleted expense, and any skip as touched", () => {
    expect(isUntouched(occurrence("a", "2026-10-01", 1))).toBe(true);
    expect(isUntouched(occurrence("b", "2026-10-01", 1, { linked: true }))).toBe(false);
    expect(isUntouched(occurrence("c", "2026-10-01", 1, { skipped: true }))).toBe(false);
  });

  it("regenerable = untouched AND dueOn > today", () => {
    const at = (dueOn: string, outcome = {}) => occurrence("x", dueOn, 1, outcome);
    expect(isRegenerable(at("2026-09-21"), TODAY)).toBe(false); // past
    expect(isRegenerable(at("2026-09-22"), TODAY)).toBe(false); // due today
    expect(isRegenerable(at("2026-09-23"), TODAY)).toBe(true); // future, untouched
    expect(isRegenerable(at("2026-10-01", { linked: true }), TODAY)).toBe(false); // paid / ever linked
    expect(isRegenerable(at("2026-10-01", { skipped: true }), TODAY)).toBe(false); // skipped
  });

  it("regenerates only untouched occurrences due strictly after today", () => {
    expect(isRegenerable(occurrence("a", "2026-09-23", 1), TODAY)).toBe(true);
    expect(isRegenerable(occurrence("b", "2026-09-22", 1), TODAY)).toBe(false);
    expect(isRegenerable(occurrence("c", "2026-09-01", 1), TODAY)).toBe(false);
  });
});

describe("regenerationPlan", () => {
  it("changes nothing when the rule is unchanged", () => {
    expect(regenerationPlan(rent, monthlyRule("2026-08-01", 30_000), TODAY)).toEqual({
      remove: [],
      add: [],
    });
  });

  it("re-prices future untouched occurrences and keeps paid history", () => {
    expect(regenerationPlan(rent, monthlyRule("2026-08-01", 32_000), TODAY)).toEqual({
      remove: ["oct", "nov"],
      add: [
        { dueOn: "2026-10-01", expectedAmount: fromMajor(32_000) },
        { dueOn: "2026-11-01", expectedAmount: fromMajor(32_000) },
      ],
    });
  });

  it("moves future dates when the day changes, leaving past occurrences where they were", () => {
    expect(regenerationPlan(rent, monthlyRule("2026-08-05", 30_000), TODAY)).toEqual({
      remove: ["oct", "nov"],
      add: [
        { dueOn: "2026-10-05", expectedAmount: fromMajor(30_000) },
        { dueOn: "2026-11-05", expectedAmount: fromMajor(30_000) },
      ],
    });
  });

  it("never rewrites skipped, linked, overdue or due-today occurrences", () => {
    const stored = [
      occurrence("overdue", "2026-09-01", 1_500),
      occurrence("today", "2026-09-22", 1_500),
      occurrence("skipped", "2026-10-22", 1_500, { skipped: true }),
      occurrence("paid-early", "2026-11-22", 1_500, { linked: true }),
    ];
    const plan = regenerationPlan(stored, monthlyRule("2026-09-22", 2_000), TODAY);
    expect(plan.remove).toEqual([]);
    // Oct 22 and Nov 22 are held by touched occurrences; Nov 22 is also past the horizon.
    expect(plan.add).toEqual([]);
  });

  it("does not add a date a kept occurrence already holds", () => {
    const stored = [occurrence("oct", "2026-10-01", 30_000, { skipped: true })];
    expect(regenerationPlan(stored, monthlyRule("2026-08-01", 32_000), TODAY)).toEqual({
      remove: [],
      add: [{ dueOn: "2026-11-01", expectedAmount: fromMajor(32_000) }],
    });
  });

  it("drops future untouched occurrences after a new end date", () => {
    expect(regenerationPlan(rent, monthlyRule("2026-08-01", 30_000, "2026-10-15"), TODAY)).toEqual({
      remove: ["nov"],
      add: [],
    });
  });

  it("drops future occurrences before a new, later anchor", () => {
    expect(regenerationPlan(rent, monthlyRule("2026-11-01", 30_000), TODAY)).toEqual({
      remove: ["oct"],
      add: [],
    });
  });

  it("only plans dates within the materialisation horizon", () => {
    const plan = regenerationPlan([], monthlyRule("2026-08-01", 30_000), TODAY);
    expect(plan.add.map((a) => a.dueOn)).toEqual(["2026-10-01", "2026-11-01"]);
  });
});

describe("regeneration safety (property)", () => {
  const anyOccurrenceSet = fc
    .uniqueArray(
      fc.record({
        offset: fc.integer({ min: -60, max: 60 }),
        amount: fc.integer({ min: 1, max: 5 }),
        outcome: fc.constantFrom("untouched", "skipped", "linked"),
      }),
      { selector: (o) => o.offset, maxLength: 12 },
    )
    .map((rows) =>
      rows.map((r, i): StoredOccurrence => ({
        id: `o${i}`,
        dueOn: addDays(TODAY, r.offset),
        expectedAmount: fromMajor(r.amount * 1_000),
        skipped: r.outcome === "skipped",
        linked: r.outcome === "linked",
      })),
    );
  const anyRule = fc
    .record({
      offset: fc.integer({ min: -90, max: 90 }),
      amount: fc.integer({ min: 1, max: 5 }),
      interval: fc.integer({ min: 1, max: 3 }),
      end: fc.option(fc.integer({ min: 0, max: 120 })),
    })
    .map(({ offset, amount, interval, end }): CommitmentRule => {
      const anchorOn = addDays(TODAY, offset);
      return {
        schedule: {
          frequency: "monthly",
          interval,
          anchorOn,
          endOn: end === null ? null : addDays(anchorOn, end),
        },
        expectedAmount: fromMajor(amount * 1_000),
      };
    });

  it("removes only regenerable occurrences, and the result is exactly the new rule's future plus everything kept", () => {
    fc.assert(
      fc.property(anyOccurrenceSet, anyRule, (stored, rule) => {
        const plan = regenerationPlan(stored, rule, TODAY);
        const removed = new Set(plan.remove);

        // Nothing touched, and nothing due today or earlier, is ever removed.
        for (const o of stored) {
          if (removed.has(o.id)) expect(isRegenerable(o, TODAY)).toBe(true);
        }

        const after = [
          ...stored.filter((o) => !removed.has(o.id)).map((o) => o.dueOn),
          ...plan.add.map((a) => a.dueOn),
        ];
        // No date is held twice (the unique key (commitment, due_on) holds).
        expect(new Set(after).size).toBe(after.length);

        // Every future date the new rule wants now exists; every added one is wanted.
        const wanted = dueDatesIn(rule.schedule, {
          start: addDays(TODAY, 1),
          end: addDays(materialisedThrough(TODAY), 1),
        });
        for (const date of wanted) expect(after).toContain(date);
        for (const a of plan.add) {
          expect(wanted).toContain(a.dueOn);
          expect(a.expectedAmount).toBe(rule.expectedAmount);
        }

        // A regenerable occurrence that survives already matches the new rule.
        for (const o of stored) {
          if (isRegenerable(o, TODAY) && !removed.has(o.id)) {
            expect(wanted).toContain(o.dueOn);
            expect(o.expectedAmount).toBe(rule.expectedAmount);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  it("is idempotent: applying a plan and planning again changes nothing", () => {
    fc.assert(
      fc.property(anyOccurrenceSet, anyRule, (stored, rule) => {
        const plan = regenerationPlan(stored, rule, TODAY);
        const removed = new Set(plan.remove);
        const applied: StoredOccurrence[] = [
          ...stored.filter((o) => !removed.has(o.id)),
          ...plan.add.map((a, i) => ({
            id: `new${i}`,
            dueOn: a.dueOn as CalendarDate,
            expectedAmount: a.expectedAmount,
            skipped: false,
            linked: false,
          })),
        ];
        expect(regenerationPlan(applied, rule, TODAY)).toEqual({ remove: [], add: [] });
      }),
      { numRuns: 200 },
    );
  });
});
