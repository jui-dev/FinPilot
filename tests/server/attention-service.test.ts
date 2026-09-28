import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { fixedClock } from "@/domain/clock";
import { ATTENTION_KINDS, type AttentionSignal } from "@/domain/signals/signals";
import { dismissSignal as dismissCommand } from "@/server/commands";
import type { ServiceContext } from "@/server/context";
import { dismissSignal, getAttention, undismissSignal } from "@/server/services/attention-service";
import { createCommitment } from "@/server/services/commitment-service";
import {
  deleteTransaction,
  recordTransaction,
  restoreTransaction,
  updateTransaction,
} from "@/server/services/ledger-service";
import { verifyAccountBalance } from "@/server/services/reconciliation-service";
import { createAccount, createOwner, getCategories } from "@/server/services/setup-service";

import { buildSeptember2026, type Scenario } from "../../acceptance/fixtures/september-2026";
import { d, errorCode, ok, setupLedger, taka } from "../support/ledger";

/**
 * Attention's read model (Stage 9): the pure rules fed from the real owning
 * read models, and the minimal dismissal store. The rules themselves are
 * covered in tests/domain/signals; these tests cover the composition, the
 * write boundary for Hide / Undo, owner isolation and the lifecycle over real
 * data.
 */

let handles: DatabaseHandle[] = [];
afterEach(() => {
  handles.forEach((h) => h.close());
  handles = [];
});

async function scenario(): Promise<Scenario> {
  const s = await buildSeptember2026();
  handles.push(s.handle);
  return s;
}

const kinds = (signals: readonly AttentionSignal[]) => signals.map((s) => s.kind);
const keyOf = async (ctx: ServiceContext, kind: AttentionSignal["kind"]) =>
  (await getAttention(ctx)).find((s) => s.kind === kind)?.key;
const dismissalCount = (h: DatabaseHandle) =>
  (h.sqlite.prepare("SELECT count(*) AS n FROM signal_dismissals").get() as { n: number }).n;

/** A second owner in the same database, whose September spending is also up. */
async function otherOwner(s: Scenario) {
  const ownerId = ok(
    await createOwner(
      { db: s.ctx.db, ids: s.ctx.ids, now: s.ctx.now },
      { name: "Other", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
    ),
  );
  const ctx: ServiceContext = { ...s.ctx, ownerId };
  const groceries = (await getCategories(ctx)).find((c) => c.name === "Groceries")!.id;
  const bank = ok(
    await createAccount(ctx, {
      name: "Bank",
      type: "bank",
      openedOn: d("2026-08-01"),
      openingBalance: taka(100_000),
    }),
  );
  for (const [on, amount] of [
    ["2026-08-05", 1_000],
    ["2026-09-05", 10_000],
  ] as const) {
    ok(
      await recordTransaction(ctx, {
        type: "expense",
        amount: taka(amount),
        accountId: bank,
        categoryId: groceries,
        occurredOn: d(on),
      }),
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

describe("composition from the owning read models", () => {
  it("gives the base scenario exactly its four signals, in priority order", async () => {
    const s = await scenario();
    const signals = await getAttention(s.ctx);

    expect(kinds(signals)).toEqual([
      "set_aside_short",
      "commitment_due_soon",
      "spending_up",
      "unexplained_adjustment",
    ]);
    // Rent (Oct 1, 9 days) and Streaming (Oct 3) are outside due soon.
    const dueSoon = signals[1]!;
    expect(dueSoon).toMatchObject({ name: "Internet", commitmentId: s.commitments.internet });
    expect(signals.map((x) => x.key)).toEqual([
      `set_aside_short:${s.items.laptop}:${s.accounts.savings}`,
      dueSoon.kind === "commitment_due_soon" ? `commitment_due_soon:${dueSoon.occurrenceId}` : "",
      "spending_up:2026-09",
      `unexplained_adjustment:${s.rows.R10}`,
    ]);
  });

  it("produces all seven kinds from real data", async () => {
    const s = await scenario();
    const monthly = (name: string, anchorOn: string) =>
      createCommitment(s.ctx, {
        name,
        categoryId: s.category("Utilities"),
        expectedAmount: taka(2_000),
        expectedAccountId: null,
        frequency: "monthly",
        interval: 1,
        anchorOn: d(anchorOn),
        endOn: null,
      });
    // Overdue: a bill due on Sep 10 that was never paid. (Deleting the Sep 2
    // rent would also turn September's spending increase into a decrease.)
    ok(await monthly("Water", "2026-09-10"));
    // Due today: a commitment that starts today.
    ok(await monthly("Gym", "2026-09-22"));
    // Verification changed: bKash verified on Sep 18, then an entry backdated before it.
    ok(
      await verifyAccountBalance(s.ctx, {
        accountId: s.accounts.bkash,
        asOf: d("2026-09-18"),
        countedAmount: taka(8_963),
      }),
    );
    ok(
      await recordTransaction(s.ctx, {
        type: "expense",
        amount: taka(100),
        accountId: s.accounts.bkash,
        categoryId: s.category("Food & Dining"),
        occurredOn: d("2026-09-17"),
      }),
    );

    const signals = await getAttention(s.ctx);
    expect(kinds(signals)).toEqual([...ATTENTION_KINDS]);
    expect(signals.find((x) => x.kind === "verification_changed")).toMatchObject({
      accountId: s.accounts.bkash,
      accountName: "bKash",
      accountType: "mobile_wallet",
      drift: taka(-100),
      evidence: {
        page: "activity",
        accountId: s.accounts.bkash,
        range: { start: "2026-08-01", end: "2026-09-19" },
      },
    });
    expect(signals.find((x) => x.kind === "commitment_due_today")).toMatchObject({
      name: "Gym",
      amount: taka(2_000),
    });
  });

  it("writes nothing to the dismissal store, and reads twice to the same result", async () => {
    const s = await scenario();
    const first = await getAttention(s.ctx);
    // The first read may materialise occurrences (Commitments' own behaviour);
    // later reads change nothing at all.
    const image = s.handle.sqlite.serialize();
    const second = await getAttention(s.ctx);

    expect(second).toEqual(first);
    expect(Buffer.compare(s.handle.sqlite.serialize(), image)).toBe(0);
    expect(dismissalCount(s.handle)).toBe(0);
  });

  it("gives an owner with nothing to report no signals", async () => {
    const { ctx, handle, account } = await setupLedger();
    handles.push(handle);
    await account("Cash", "cash", "2026-09-01", 1_000);
    expect(await getAttention(ctx)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Hide and Undo
// ---------------------------------------------------------------------------

describe("hide and undo", () => {
  it("hides a dismissible signal, idempotently, and Undo shows it again", async () => {
    const s = await scenario();

    expect(await dismissSignal(s.ctx, "spending_up:2026-09")).toEqual({
      ok: true,
      value: undefined,
    });
    expect(kinds(await getAttention(s.ctx))).not.toContain("spending_up");
    expect(dismissalCount(s.handle)).toBe(1);

    // Hiding it again changes nothing, though it is no longer visible.
    expect((await dismissSignal(s.ctx, "spending_up:2026-09")).ok).toBe(true);
    expect(dismissalCount(s.handle)).toBe(1);

    expect((await undismissSignal(s.ctx, "spending_up:2026-09")).ok).toBe(true);
    expect(kinds(await getAttention(s.ctx))).toContain("spending_up");
    expect(dismissalCount(s.handle)).toBe(0);
    // Undoing again is harmless.
    expect((await undismissSignal(s.ctx, "spending_up:2026-09")).ok).toBe(true);
  });

  it("hides an unexplained adjustment too", async () => {
    const s = await scenario();
    ok(await dismissSignal(s.ctx, `unexplained_adjustment:${s.rows.R10}`));
    expect(kinds(await getAttention(s.ctx))).not.toContain("unexplained_adjustment");
  });

  it("refuses a key that isn't currently a signal, and writes nothing", async () => {
    const s = await scenario();
    for (const key of ["spending_up:2026-08", "hello", `unexplained_adjustment:${s.rows.R1}`]) {
      expect(errorCode(await dismissSignal(s.ctx, key))).toBe("signal_not_found");
    }
    expect(dismissalCount(s.handle)).toBe(0);
  });

  it("refuses to hide a kind that is resolved by acting, and writes nothing", async () => {
    const s = await scenario();
    const short = (await keyOf(s.ctx, "set_aside_short"))!;
    const dueSoon = (await keyOf(s.ctx, "commitment_due_soon"))!;
    expect(errorCode(await dismissSignal(s.ctx, short))).toBe("signal_not_dismissible");
    expect(errorCode(await dismissSignal(s.ctx, dueSoon))).toBe("signal_not_dismissible");
    expect(dismissalCount(s.handle)).toBe(0);
    expect(kinds(await getAttention(s.ctx))).toContain("set_aside_short");
  });

  it("accepts only a string key from untrusted input", async () => {
    const s = await scenario();
    for (const raw of [undefined, 42, { key: "spending_up:2026-09" }, "", "k".repeat(201)]) {
      expect((await dismissCommand(s.ctx, raw)).ok).toBe(false);
    }
    expect(dismissalCount(s.handle)).toBe(0);
    expect((await dismissCommand(s.ctx, "spending_up:2026-09")).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Owner isolation
// ---------------------------------------------------------------------------

describe("owner isolation", () => {
  it("reads only the owner's own facts", async () => {
    const s = await scenario();
    const other = await otherOwner(s);
    const signals = await getAttention(other);
    expect(kinds(signals)).toEqual(["spending_up"]);
    expect(signals[0]).toMatchObject({ net: taka(9_000), previousTotal: taka(1_000) });
  });

  it("never lets one owner's dismissal hide another owner's signal with the same key", async () => {
    const s = await scenario();
    const other = await otherOwner(s);
    ok(await dismissSignal(s.ctx, "spending_up:2026-09"));

    expect(kinds(await getAttention(s.ctx))).not.toContain("spending_up");
    expect(await keyOf(other, "spending_up")).toBe("spending_up:2026-09");
  });

  it("does not let one owner hide another owner's signal by its key", async () => {
    const s = await scenario();
    const other = await otherOwner(s);
    expect(errorCode(await dismissSignal(other, `unexplained_adjustment:${s.rows.R10}`))).toBe(
      "signal_not_found",
    );
    expect(dismissalCount(s.handle)).toBe(0);
    expect(kinds(await getAttention(s.ctx))).toContain("unexplained_adjustment");
  });

  it("undoes only the owner's own dismissal", async () => {
    const s = await scenario();
    const other = await otherOwner(s);
    ok(await dismissSignal(s.ctx, "spending_up:2026-09"));
    ok(await dismissSignal(other, "spending_up:2026-09"));

    ok(await undismissSignal(s.ctx, "spending_up:2026-09"));

    expect(kinds(await getAttention(s.ctx))).toContain("spending_up");
    expect(kinds(await getAttention(other))).not.toContain("spending_up");
  });
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

describe("lifecycle", () => {
  it("stays hidden when the amount changes under the same key", async () => {
    const s = await scenario();
    ok(await dismissSignal(s.ctx, "spending_up:2026-09"));
    ok(
      await recordTransaction(s.ctx, {
        type: "expense",
        amount: taka(5_000),
        accountId: s.accounts.bank,
        categoryId: s.category("Health"),
        occurredOn: d("2026-09-22"),
      }),
    );
    expect(kinds(await getAttention(s.ctx))).not.toContain("spending_up");
  });

  it("stays hidden when it disappears and returns within the same month", async () => {
    const s = await scenario();
    ok(await dismissSignal(s.ctx, "spending_up:2026-09"));
    // Without the Sep 21 medical bill, spending is down: no signal to hide.
    ok(await deleteTransaction(s.ctx, s.rows.R11!));
    expect(kinds(await getAttention(s.ctx))).not.toContain("spending_up");
    ok(await restoreTransaction(s.ctx, s.rows.R11!));
    expect(kinds(await getAttention(s.ctx))).not.toContain("spending_up");
    expect(dismissalCount(s.handle)).toBe(1);
  });

  it("shows the next month's spending_up though last month's was hidden", async () => {
    const { ctx, handle, account, category } = await setupLedger("2026-09-22");
    handles.push(handle);
    const bank = await account("Bank", "bank", "2026-08-01", 200_000);
    const spend = async (c: ServiceContext, on: string, amount: number) =>
      ok(
        await recordTransaction(c, {
          type: "expense",
          amount: taka(amount),
          accountId: bank,
          categoryId: category("Groceries"),
          occurredOn: d(on),
        }),
      );
    await spend(ctx, "2026-08-05", 1_000);
    await spend(ctx, "2026-09-05", 10_000);
    ok(await dismissSignal(ctx, "spending_up:2026-09"));

    const october: ServiceContext = { ...ctx, clock: fixedClock(d("2026-10-22")) };
    await spend(october, "2026-10-05", 30_000);
    expect(await keyOf(october, "spending_up")).toBe("spending_up:2026-10");
  });

  it("shows a new adjustment though the previous one was hidden", async () => {
    const s = await scenario();
    ok(await dismissSignal(s.ctx, `unexplained_adjustment:${s.rows.R10}`));
    // Cash verified again today at ৳100 less than recorded: a new adjustment.
    const again = ok(
      await verifyAccountBalance(s.ctx, {
        accountId: s.accounts.cash,
        asOf: d("2026-09-22"),
        countedAmount: taka(4_100),
      }),
    );
    expect(await keyOf(s.ctx, "unexplained_adjustment")).toBe(
      `unexplained_adjustment:${again.adjustmentId}`,
    );
  });

  it("replaces a hidden adjustment with the changed checkpoint, which cannot be hidden", async () => {
    const s = await scenario();
    ok(await dismissSignal(s.ctx, `unexplained_adjustment:${s.rows.R10}`));
    // M2: the Sep 15 lunch was really paid from bKash.
    ok(
      await updateTransaction(s.ctx, s.rows.R8!, {
        type: "expense",
        amount: taka(450),
        accountId: s.accounts.bkash,
        categoryId: s.category("Food & Dining"),
        occurredOn: d("2026-09-15"),
      }),
    );
    const signals = await getAttention(s.ctx);
    expect(kinds(signals)).toContain("verification_changed");
    expect(kinds(signals)).not.toContain("unexplained_adjustment");
    expect(
      errorCode(await dismissSignal(s.ctx, (await keyOf(s.ctx, "verification_changed"))!)),
    ).toBe("signal_not_dismissible");
  });

  it("moves one occurrence from due soon to due today to overdue as the days pass", async () => {
    const { ctx, handle, account, category } = await setupLedger("2026-09-22");
    handles.push(handle);
    await account("Bank", "bank", "2026-08-01", 10_000);
    const commitmentId = ok(
      await createCommitment(ctx, {
        name: "Internet",
        categoryId: category("Utilities"),
        expectedAmount: taka(1_500),
        expectedAccountId: null,
        frequency: "monthly",
        interval: 1,
        anchorOn: d("2026-09-25"),
        endOn: null,
      }),
    );
    const on = (today: string) => ({ ...ctx, clock: fixedClock(d(today)) });

    const soon = (await getAttention(on("2026-09-22")))[0]!;
    expect(soon.kind).toBe("commitment_due_soon");
    const occurrenceId = soon.kind === "commitment_due_soon" ? soon.occurrenceId : "";

    expect((await getAttention(on("2026-09-25"))).map((x) => x.key)).toEqual([
      `commitment_due_today:${occurrenceId}`,
    ]);
    expect((await getAttention(on("2026-09-26"))).map((x) => x.key)).toEqual([
      `commitment_overdue:${commitmentId}`,
    ]);
  });
});
