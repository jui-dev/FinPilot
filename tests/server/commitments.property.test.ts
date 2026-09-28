import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { addDays, type CalendarDate } from "@/domain/calendar-date";
import { materialisedThrough } from "@/domain/commitments/occurrences";
import { dueDatesIn } from "@/domain/commitments/schedule";
import type { Clock } from "@/domain/clock";
import type { ServiceContext } from "@/server/context";
import {
  createCommitment,
  editCommitment,
  getCommitments,
  getOccurrences,
  payOccurrence,
  skipOccurrence,
  type CommitmentDraft,
  type OccurrenceView,
} from "@/server/services/commitment-service";
import { deleteTransaction } from "@/server/services/ledger-service";

import { d, ok, setupLedger, taka } from "../support/ledger";

/**
 * Commitment invariants under random histories: people read, pay, skip,
 * delete payments and edit rules while time passes. After every step:
 *   - reading twice changes nothing (materialisation is idempotent);
 *   - an edit never removes or changes a protected occurrence (due on or before
 *     the edit day, or ever paid/skipped);
 *   - an edit never manufactures an occurrence due on or before the edit day;
 *   - no date the current rule has due from its boundary through the horizon
 *     is ever missing (whatever the anchor, including a future one).
 */

type Action =
  | { kind: "read" }
  | { kind: "pay" | "skip" | "unpay"; pick: number }
  | {
      kind: "edit";
      frequency: "monthly" | "yearly";
      interval: number;
      anchorOffset: number;
      amount: number;
      endAfter: number | null;
    };

const anyAction: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ kind: "read" }),
  fc.record({ kind: fc.constantFrom("pay", "skip", "unpay" as const), pick: fc.nat(40) }),
  fc.record({
    kind: fc.constant("edit" as const),
    frequency: fc.constantFrom("monthly", "yearly" as const),
    interval: fc.integer({ min: 1, max: 3 }),
    anchorOffset: fc.integer({ min: -120, max: 60 }),
    amount: fc.integer({ min: 1, max: 5 }),
    endAfter: fc.option(fc.integer({ min: 0, max: 400 })),
  }),
);

const history = fc.array(
  fc.record({ action: anyAction, daysLater: fc.integer({ min: 0, max: 45 }) }),
  { minLength: 1, maxLength: 8 },
);

/** Identity and snapshot: what a protected occurrence must keep. */
const identity = (o: OccurrenceView) => ({ id: o.id, dueOn: o.dueOn, amount: o.expectedAmount });

describe("commitment histories (property)", () => {
  it("stay idempotent, protected and free of backfill", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -90, max: 400 }), history, async (firstAnchor, steps) => {
        const setup = await setupLedger("2026-09-22");
        try {
          let today = d("2026-09-22");
          const clock: Clock = { today: () => today };
          const ctx: ServiceContext = { ...setup.ctx, clock };
          const bank = await setup.account("Bank", "bank", "2020-01-01", 10_000_000);
          const draft = (patch: Partial<CommitmentDraft> = {}): CommitmentDraft => ({
            name: "Rent",
            categoryId: setup.category("Housing"),
            expectedAmount: taka(1_000),
            expectedAccountId: bank,
            frequency: "monthly",
            interval: 1,
            anchorOn: addDays(d("2026-09-22"), firstAnchor),
            endOn: null,
            ...patch,
          });
          const id = ok(await createCommitment(ctx, draft()));
          const payments: string[] = [];
          /** The day of the last rule edit, tracked independently of generate_from. */
          let lastRuleEdit: CalendarDate | null = null;
          const pending = (all: OccurrenceView[]) => all.filter((o) => o.state === "pending");

          for (const { action, daysLater } of steps) {
            today = addDays(today, daysLater) as CalendarDate;
            const before = await getOccurrences(ctx);
            expect(await getOccurrences(ctx)).toEqual(before);

            // Complete: every date the current rule has due from its anchor —
            // or, after an edit, from the day after that edit — is there.
            const [rule] = await getCommitments(ctx);
            const resumes = lastRuleEdit === null ? rule!.anchorOn : addDays(lastRuleEdit, 1);
            const from = rule!.anchorOn > resumes ? rule!.anchorOn : resumes;
            const wanted = dueDatesIn(
              {
                frequency: rule!.frequency,
                interval: rule!.interval,
                anchorOn: rule!.anchorOn,
                endOn: rule!.endOn,
              },
              { start: from, end: addDays(materialisedThrough(today), 1) },
            );
            const present = new Set(before.map((o) => o.dueOn));
            for (const date of wanted) expect(present.has(date), date).toBe(true);

            if (action.kind === "pay" || action.kind === "skip") {
              const target = pending(before)[action.pick % Math.max(1, pending(before).length)];
              if (!target) continue;
              if (action.kind === "pay") {
                payments.push(ok(await payOccurrence(ctx, target.id, { accountId: bank })));
              } else {
                ok(await skipOccurrence(ctx, target.id));
              }
            } else if (action.kind === "unpay") {
              const paid = payments.splice(action.pick % Math.max(1, payments.length), 1)[0];
              if (paid) ok(await deleteTransaction(ctx, paid));
            } else if (action.kind === "edit") {
              const anchorOn = addDays(today, action.anchorOffset);
              ok(
                await editCommitment(
                  ctx,
                  id,
                  draft({
                    frequency: action.frequency,
                    interval: action.interval,
                    anchorOn,
                    expectedAmount: taka(action.amount * 1_000),
                    endOn: action.endAfter === null ? null : addDays(anchorOn, action.endAfter),
                  }),
                ),
              );
              lastRuleEdit = today;
              const current = await getOccurrences(ctx);
              expect(await getOccurrences(ctx)).toEqual(current);

              const protectedBefore = before.filter(
                (o) => o.dueOn <= today || o.state !== "pending" || o.transactionId !== null,
              );
              const afterById = new Map(current.map((o) => [o.id, o]));
              for (const o of protectedBefore) {
                expect(afterById.get(o.id) && identity(afterById.get(o.id)!)).toEqual(identity(o));
              }
              // Nothing due on or before the edit day appeared that was not there before.
              const beforeIds = new Set(before.map((o) => o.id));
              for (const o of current) {
                if (o.dueOn <= today) expect(beforeIds.has(o.id)).toBe(true);
              }
            }
          }
        } finally {
          setup.handle.close();
        }
      }),
      { numRuns: 40 },
    );
  }, 120_000);
});
