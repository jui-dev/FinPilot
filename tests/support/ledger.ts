import { and, eq } from "drizzle-orm";

import { accounts } from "@/db/schema";
import { calendarDateFromIso, type CalendarDate } from "@/domain/calendar-date";
import { fixedClock } from "@/domain/clock";
import type { AccountType } from "@/domain/ledger/accounts";
import { fromMajor } from "@/domain/money";
import type { ServiceContext } from "@/server/context";
import type { ServiceResult } from "@/server/errors";
import { uuidV7Generator } from "@/server/ids";
import { createAccount, createOwner, getCategories } from "@/server/services/setup-service";

import { freshDatabase } from "./database";

export const d = calendarDateFromIso;
export const taka = fromMajor;

/** Unwraps a successful ServiceResult or CommandResult, failing the test with the error otherwise. */
export function ok<T>(
  result: { readonly ok: true; readonly value: T } | { readonly ok: false },
): T {
  if (!result.ok) throw new Error(`Expected success, got ${JSON.stringify(result)}`);
  return result.value;
}

export function errorCode<T>(result: ServiceResult<T>): string | undefined {
  return result.ok ? undefined : result.error.code;
}

/**
 * A fresh database with one owner (BDT, Asia/Dhaka) and its default categories,
 * a fixed clock and a deterministic, strictly increasing `now`.
 */
export async function setupLedger(today = "2026-09-22") {
  const handle = freshDatabase();
  let tick = Date.UTC(2026, 8, 22, 6, 0, 0);
  const now = () => new Date((tick += 1000));
  const ownerId = ok(
    await createOwner(
      { db: handle.db, ids: uuidV7Generator, now },
      { name: "Demo", baseCurrency: "BDT", timeZone: "Asia/Dhaka" },
    ),
  );
  const ctx: ServiceContext = {
    db: handle.db,
    ownerId,
    clock: fixedClock(calendarDateFromIso(today)),
    ids: uuidV7Generator,
    now,
  };
  const categoryIds = new Map((await getCategories(ctx)).map((c) => [c.name, c.id]));
  const category = (name: string) => {
    const id = categoryIds.get(name);
    if (!id) throw new Error(`No category ${name}`);
    return id;
  };
  const account = async (
    name: string,
    type: AccountType,
    openedOn: CalendarDate | string,
    openingBalanceTaka = 0,
  ) =>
    ok(
      await createAccount(ctx, {
        name,
        type,
        openedOn: typeof openedOn === "string" ? d(openedOn) : openedOn,
        openingBalance: taka(openingBalanceTaka),
      }),
    );
  return { handle, ctx, category, account };
}

/**
 * Runs `change` on an archived account's entries as the ledger allowed before
 * 2026-11-07, when deleting or editing an entry away could give an archived
 * account a balance again. Databases from then may still hold such accounts,
 * so the readers are tested against them; the write path now refuses it.
 */
export async function asBeforeArchivedEntriesFroze<T>(
  ctx: ServiceContext,
  accountId: string,
  change: () => Promise<T>,
): Promise<T> {
  const where = and(eq(accounts.ownerId, ctx.ownerId), eq(accounts.id, accountId));
  const row = ctx.db.select({ archivedAt: accounts.archivedAt }).from(accounts).where(where).get();
  if (!row?.archivedAt) throw new Error("The account is not archived.");
  ctx.db.update(accounts).set({ archivedAt: null }).where(where).run();
  try {
    return await change();
  } finally {
    ctx.db.update(accounts).set({ archivedAt: row.archivedAt }).where(where).run();
  }
}
