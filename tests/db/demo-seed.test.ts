import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { seedDemo, type DemoSeedOptions } from "@/db/seed/demo-seed";
import { calendarDateFromIso } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import { fromMajor } from "@/domain/money";
import { ATTENTION_KINDS } from "@/domain/signals/signals";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getAttention } from "@/server/services/attention-service";
import { getAvailable } from "@/server/services/available-service";
import { getOccurrences } from "@/server/services/commitment-service";
import { getAccountBalances, getTransactions } from "@/server/services/ledger-service";
import { getItems } from "@/server/services/protected-money-service";
import { getAccountVerifications } from "@/server/services/reconciliation-service";

import { freshDatabase } from "../support/database";

let handles: DatabaseHandle[] = [];
afterEach(() => {
  for (const h of handles) h.close();
  handles = [];
});

async function seeded(today: string, options?: DemoSeedOptions) {
  const handle = freshDatabase();
  handles.push(handle);
  const result = await seedDemo(handle, calendarDateFromIso(today), options);
  const ctx: ServiceContext = {
    db: handle.db,
    ownerId: result.ownerId,
    clock: fixedClock(calendarDateFromIso(today)),
    ids: uuidV7Generator,
    now: () => new Date(),
  };
  return { result, ctx };
}

const summary = async (ctx: ServiceContext) => ({
  balances: (await getAccountBalances(ctx)).map((b) => [b.name, b.balance]),
  count: (await getTransactions(ctx)).length,
});

/** The 1st, mid-month, month-ends of every length, a leap day and the scenario day. */
const DAYS = [
  "2026-09-22",
  "2026-03-01",
  "2026-09-15",
  "2026-12-31",
  "2026-04-30",
  "2027-02-28",
  "2028-02-29",
  "2026-03-03",
];

describe("demo seed", () => {
  it.each([...DAYS.map((d) => [d, true] as const), ["2026-09-22", false] as const])(
    "builds a valid ledger relative to %s (situations: %s): nothing in the future, no overdrawn cash or wallet",
    async (today, situations) => {
      const { result, ctx } = await seeded(today, { situations });
      const rows = await getTransactions(ctx);
      expect(result.transactions).toBeGreaterThan(80);
      expect(rows.every((r) => r.occurredOn <= today)).toBe(true);
      expect(rows.some((r) => r.type === "refund")).toBe(true);
      expect(rows.some((r) => r.groupId !== null)).toBe(true);
      for (const b of await getAccountBalances(ctx)) {
        if (b.type !== "credit_card") expect(b.balance, b.name).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it.each([undefined, { situations: false }])(
    "is deterministic for a given day (%o)",
    async (o) => {
      const a = await seeded("2026-09-22", o);
      const b = await seeded("2026-09-22", o);
      expect(await summary(b.ctx)).toEqual(await summary(a.ctx));
    },
  );

  it.each(DAYS)("raises every V1 Attention kind on a fresh demo, relative to %s", async (today) => {
    const { ctx } = await seeded(today);
    const kinds = new Set((await getAttention(ctx)).map((s) => s.kind));
    expect([...ATTENTION_KINDS].filter((k) => !kinds.has(k))).toEqual([]);
  });

  it.each(DAYS)("tells one believable story relative to %s", async (today) => {
    const { ctx } = await seeded(today);

    // Commitments: history paid through Pay, one month of the gym skipped,
    // and a payment later in the month that reduces Available with no signal.
    const occurrences = await getOccurrences(ctx);
    const gym = occurrences.filter((o) => o.name === "Gym membership");
    expect(occurrences.some((o) => o.state === "paid" && o.transactionId !== null)).toBe(true);
    expect(gym.some((o) => o.state === "skipped")).toBe(true);
    const available = await getAvailable(ctx);
    expect(
      available.commitments.some((c) => c.name === "Gym membership" && c.display === "upcoming"),
    ).toBe(true);

    // Set aside: covered in Bank and deducted; short in bKash; on Savings, not deducted.
    const earmarks = (await getItems(ctx)).flatMap((i) =>
      i.earmarks.map((e) => ({ ...e, item: i.name })),
    );
    const onAccount = (item: string, name: string) => {
      const id = available.accounts.find((a) => a.name === name)!.accountId;
      return earmarks.find((e) => e.item === item && e.accountId === id)!;
    };
    expect(onAccount("Emergency cushion", "Bank").short).toBe(0);
    expect(onAccount("New laptop", "bKash").short).toBeGreaterThan(0);
    expect(onAccount("New laptop", "Savings").covered).toBe(fromMajor(50_000));
    expect(
      available.earmarks
        .filter((e) => e.deducted)
        .map((e) => e.itemName)
        .sort(),
    ).toEqual(["Emergency cushion", "New laptop"]);
    expect(available.earmarks.find((e) => !e.deducted)?.itemName).toBe("New laptop");

    // Verification: Bank verified and still matching.
    const bank = available.accounts.find((a) => a.name === "Bank")!.accountId;
    expect((await getAccountVerifications(ctx, [bank])).get(bank)!.status).toBe("verified");

    // Own vs counts toward Available: Savings holds money outside it; the card owes.
    const savings = available.accounts.find((a) => a.name === "Savings")!;
    expect(savings.counted).toBe(false);
    expect(savings.balance).toBeGreaterThan(0);
    expect(available.liabilityBalances).toBeLessThan(0);

    // Available is positive, and a real part of what is in the counted accounts.
    const share = available.available / available.includedAssetBalances;
    expect(share).toBeGreaterThanOrEqual(0.3);
    expect(share).toBeLessThanOrEqual(0.6);
  });

  it("without situations is the plain ledger the end-to-end suite builds on", async () => {
    const { ctx } = await seeded("2026-09-22", { situations: false });
    expect(await getOccurrences(ctx)).toEqual([]);
    expect(await getItems(ctx)).toEqual([]);
    const ids = (await getAccountBalances(ctx)).map((b) => b.accountId);
    const statuses = [...(await getAccountVerifications(ctx, ids)).values()].map((v) => v.status);
    expect(new Set(statuses)).toEqual(new Set(["never_verified"]));
    expect((await getAttention(ctx)).every((s) => s.kind === "spending_up")).toBe(true);
  });
});
