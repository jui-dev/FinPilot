import { afterEach, describe, expect, it } from "vitest";

import type { DatabaseHandle } from "@/db/client";
import { seedDemo } from "@/db/seed/demo-seed";
import { calendarDateFromIso } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import type { ServiceContext } from "@/server/context";
import { uuidV7Generator } from "@/server/ids";
import { getAccountBalances, getTransactions } from "@/server/services/ledger-service";

import { freshDatabase } from "../support/database";

let handles: DatabaseHandle[] = [];
afterEach(() => {
  for (const h of handles) h.close();
  handles = [];
});

async function seeded(today: string) {
  const handle = freshDatabase();
  handles.push(handle);
  const result = await seedDemo(handle, calendarDateFromIso(today));
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

describe("demo seed v1", () => {
  it.each(["2026-09-22", "2026-03-01", "2026-12-31", "2028-02-29"])(
    "builds a valid ledger relative to %s: nothing in the future, no overdrawn cash or wallet",
    async (today) => {
      const { result, ctx } = await seeded(today);
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

  it("is deterministic for a given day", async () => {
    const a = await seeded("2026-09-22");
    const b = await seeded("2026-09-22");
    expect(await summary(b.ctx)).toEqual(await summary(a.ctx));
  });
});
