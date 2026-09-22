import { and, asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import { accounts, categories, owners } from "@/db/schema";
import type { CalendarDate } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import { DEFAULT_CATEGORIES } from "@/domain/ledger/categories";
import type { CategoryKind } from "@/domain/ledger/transactions";
import type { IdGenerator } from "@/domain/ids";
import type { Money } from "@/domain/money";
import type { WriteContext } from "@/server/context";
import { LedgerRuleError } from "@/server/errors";

import { insertDraft } from "./ledger-repository";

const IMMEDIATE = { behavior: "immediate" } as const;

/** Creates an owner with the default categories, atomically. */
export function insertOwner(
  db: AppDatabase,
  input: { name: string; baseCurrency: string; timeZone: string },
  ids: IdGenerator,
  nowIso: string,
): string {
  return db.transaction((tx) => {
    const ownerId = ids.next();
    tx.insert(owners)
      .values({ id: ownerId, ...input, createdAt: nowIso, updatedAt: nowIso })
      .run();
    tx.insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((c) => ({
          id: ids.next(),
          ownerId,
          name: c.name,
          kind: c.kind,
          createdAt: nowIso,
          updatedAt: nowIso,
        })),
      )
      .run();
    return ownerId;
  }, IMMEDIATE);
}

/**
 * Creates an account and, for a non-zero start, its opening-balance transaction
 * dated opened_on — atomically. An account opened at zero has no opening-balance row.
 */
export function insertAccount(
  db: AppDatabase,
  ctx: WriteContext,
  input: {
    name: string;
    type: AccountType;
    openedOn: CalendarDate;
    openingBalance: Money;
    includedInAvailable: boolean;
  },
): string {
  return db.transaction((tx) => {
    const owner = tx
      .select({ currency: owners.baseCurrency })
      .from(owners)
      .where(eq(owners.id, ctx.ownerId))
      .get();
    if (!owner) throw new LedgerRuleError("owner_not_found", "The owner does not exist.");
    if (input.openedOn > ctx.today) {
      throw new LedgerRuleError("future_date", "An account cannot be opened in the future.");
    }
    if (input.name.trim().length === 0) {
      throw new LedgerRuleError("invalid_name", "The account needs a name.");
    }
    const duplicate = tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(eq(accounts.ownerId, ctx.ownerId), sql`lower(${accounts.name}) = lower(${input.name})`),
      )
      .get();
    if (duplicate) throw new LedgerRuleError("duplicate_name", "An account with this name exists.");

    const accountId = ctx.ids.next();
    tx.insert(accounts)
      .values({
        id: accountId,
        ownerId: ctx.ownerId,
        name: input.name,
        type: input.type,
        currency: owner.currency,
        includedInAvailable: input.includedInAvailable,
        openedOn: input.openedOn,
        archivedAt: null,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      })
      .run();
    if (input.openingBalance !== 0) {
      insertDraft(tx, ctx, {
        type: "opening_balance",
        balance: input.openingBalance,
        accountId,
        occurredOn: input.openedOn,
      });
    }
    return accountId;
  }, IMMEDIATE);
}

export function insertCategory(
  db: AppDatabase,
  ctx: WriteContext,
  input: { name: string; kind: CategoryKind },
): string {
  return db.transaction((tx) => {
    if (input.name.trim().length === 0) {
      throw new LedgerRuleError("invalid_name", "The category needs a name.");
    }
    const duplicate = tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.ownerId, ctx.ownerId),
          eq(categories.kind, input.kind),
          sql`lower(${categories.name}) = lower(${input.name})`,
        ),
      )
      .get();
    if (duplicate) throw new LedgerRuleError("duplicate_name", "A category with this name exists.");
    const id = ctx.ids.next();
    tx.insert(categories)
      .values({ id, ownerId: ctx.ownerId, ...input, createdAt: ctx.nowIso, updatedAt: ctx.nowIso })
      .run();
    return id;
  }, IMMEDIATE);
}

export function listAccounts(db: AppDatabase, ownerId: string) {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.ownerId, ownerId))
    .orderBy(asc(accounts.name))
    .all();
}

export function listCategories(db: AppDatabase, ownerId: string) {
  return db
    .select()
    .from(categories)
    .where(eq(categories.ownerId, ownerId))
    .orderBy(asc(categories.kind), asc(categories.name))
    .all();
}
