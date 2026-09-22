import type { AppDatabase } from "@/db/client";
import type { CalendarDate } from "@/domain/calendar-date";
import type { IdGenerator } from "@/domain/ids";
import { defaultIncludedInAvailable, type AccountType } from "@/domain/ledger/accounts";
import type { CategoryKind } from "@/domain/ledger/transactions";
import { ZERO, type Money } from "@/domain/money";
import { writeContext, type ServiceContext } from "@/server/context";
import { runScript, type ServiceResult } from "@/server/errors";
import {
  insertAccount,
  insertCategory,
  insertOwner,
  listAccounts,
  listCategories,
} from "@/server/repositories/setup-repository";

/** Owners, accounts and categories. Services are async; repositories do the (synchronous) work. */

export async function createOwner(
  deps: { db: AppDatabase; ids: IdGenerator; now: () => Date },
  input: { name: string; baseCurrency: string; timeZone: string },
): Promise<ServiceResult<string>> {
  return runScript(() => insertOwner(deps.db, input, deps.ids, deps.now().toISOString()));
}

export async function createAccount(
  ctx: ServiceContext,
  input: {
    name: string;
    type: AccountType;
    openedOn: CalendarDate;
    /** Signed starting balance; negative for money owed on a card. Zero → no opening-balance row. */
    openingBalance?: Money;
    includedInAvailable?: boolean;
  },
): Promise<ServiceResult<string>> {
  return runScript(() =>
    insertAccount(ctx.db, writeContext(ctx), {
      name: input.name,
      type: input.type,
      openedOn: input.openedOn,
      openingBalance: input.openingBalance ?? ZERO,
      includedInAvailable: input.includedInAvailable ?? defaultIncludedInAvailable(input.type),
    }),
  );
}

export async function createCategory(
  ctx: ServiceContext,
  input: { name: string; kind: CategoryKind },
): Promise<ServiceResult<string>> {
  return runScript(() => insertCategory(ctx.db, writeContext(ctx), input));
}

export async function getAccounts(ctx: ServiceContext) {
  return listAccounts(ctx.db, ctx.ownerId);
}

export async function getCategories(ctx: ServiceContext) {
  return listCategories(ctx.db, ctx.ownerId);
}
