import { afterAll, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { seedDemo, type DemoSeedOptions } from "@/db/seed/demo-seed";
import { addMonths, calendarDateFromIso, firstDayOf, yearMonthOf } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import { fromMajor, money, negate, sum } from "@/domain/money";
import { ATTENTION_KINDS } from "@/domain/signals/signals";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getTrends } from "@/server/services/analysis-service";
import { getAttention } from "@/server/services/attention-service";
import { getAvailable } from "@/server/services/available-service";
import { getOccurrences } from "@/server/services/commitment-service";
import { getAccountBalances, getPosition, getTransactions } from "@/server/services/ledger-service";
import { getItems } from "@/server/services/protected-money-service";
import { getAccountVerifications } from "@/server/services/reconciliation-service";

import { freshDatabase } from "../support/database";

let handles: DatabaseHandle[] = [];
afterAll(() => {
  for (const h of handles) h.close();
  handles = [];
});

async function seedFresh(today: string, options?: DemoSeedOptions) {
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

/**
 * A year of history takes a moment to seed, and every test here only reads,
 * so each day (and set of options) is seeded once for the file.
 */
const cache = new Map<string, ReturnType<typeof seedFresh>>();
function seeded(today: string, options?: DemoSeedOptions) {
  const key = JSON.stringify([today, options ?? {}]);
  if (!cache.has(key)) cache.set(key, seedFresh(today, options));
  return cache.get(key)!;
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
      const a = await seedFresh("2026-09-22", o);
      const b = await seedFresh("2026-09-22", o);
      expect(await summary(b.ctx)).toEqual(await summary(a.ctx));
    },
  );

  it.each(DAYS)("raises every V1 Attention kind on a fresh demo, relative to %s", async (today) => {
    const { ctx } = await seeded(today);
    const kinds = new Set((await getAttention(ctx)).map((s) => s.kind));
    expect([...ATTENTION_KINDS].filter((k) => !kinds.has(k))).toEqual([]);
  });

  it.each(DAYS)(
    "splits what you own into what counts toward Available and what doesn't, relative to %s",
    async (today) => {
      const { ctx } = await seeded(today);
      const available = await getAvailable(ctx);
      const position = await getPosition(ctx);
      expect(available.includedAssetBalances + available.excludedAssetBalances).toBe(
        position.assets,
      );
      // Savings holds money outside Available; the card owes, so the pool is the included assets.
      expect(available.excludedAssetBalances).toBeGreaterThan(0);
      expect(available.liabilityBalances).toBeLessThan(0);
      expect(available.pool).toBe(available.includedAssetBalances);
      expect(available.available).toBeGreaterThan(0);
      expect(available.available).toBeLessThan(available.pool);
    },
  );

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

  it.each(DAYS)("gives Trends a year with a believable shape, relative to %s", async (today) => {
    const { ctx } = await seeded(today);
    const { months, change } = await getTrends(ctx, "12");

    // Twelve complete months, ending last month; both halves compared.
    expect(months).toHaveLength(12);
    expect(months.at(-1)!.month).toBe(addMonths(yearMonthOf(calendarDateFromIso(today)), -1));
    expect(change!.recent.months).toHaveLength(6);

    // A raise four months ago; one festival bonus earlier in the year. (The
    // late "Sold old phone" can add 2,500 to a recent month.)
    const salaryish = months.map((m) => m.income);
    expect(salaryish.slice(-4).every((i) => i >= fromMajor(1_05_000))).toBe(true);
    expect(salaryish.filter((i) => i >= fromMajor(1_40_000))).toHaveLength(1);

    // Most months leave something over; only the refrigerator's month is in the minus.
    const minus = months.filter((m) => m.leftOver < 0);
    expect(minus.map((m) => m.month)).toEqual([months[months.length - 5]!.month]);
    expect(months.filter((m) => m.leftOver >= fromMajor(15_000)).length).toBeGreaterThanOrEqual(10);
  });

  it.each([
    ...DAYS.map((d) => [d, undefined] as const),
    ["2026-09-22", { situations: false }] as const,
  ])(
    "pays the card for what went on it, so what it owes never piles up, relative to %s",
    async (today, options) => {
      const { ctx } = await seeded(today, options);
      const visa = (await getAccountBalances(ctx)).find((b) => b.type === "credit_card")!;
      // Since the start of last month: what the latest payment hasn't covered yet.
      const since = firstDayOf(addMonths(yearMonthOf(calendarDateFromIso(today)), -1));
      const recentCharges = negate(
        sum(
          (await getTransactions(ctx))
            .filter((r) => r.accountId === visa.accountId && r.occurredOn >= since)
            .filter((r) => r.type === "expense" || r.type === "refund")
            .map((r) => money(r.amountMinor)),
        ),
      );
      expect(visa.balance).toBeLessThan(0);
      expect(negate(visa.balance)).toBeLessThanOrEqual(recentCharges);
    },
  );

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
