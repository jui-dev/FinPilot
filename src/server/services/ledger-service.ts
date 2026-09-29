import type { CalendarDate, DateRange } from "@/domain/calendar-date";
import type { AccountType } from "@/domain/ledger/accounts";
import { savingsRate, type Ratio } from "@/domain/ledger/analytics";
import { summarizePosition, type Position } from "@/domain/ledger/position";
import type { TransactionDraft } from "@/domain/ledger/transactions";
import { money, sum, type Money } from "@/domain/money";
import { writeContext, type ServiceContext } from "@/server/context";
import { runScript, type ServiceResult } from "@/server/errors";
import * as queries from "@/server/repositories/ledger-queries";
import * as ledger from "@/server/repositories/ledger-repository";

/**
 * The ledger's application API. Public functions are async (the boundary that
 * stays unchanged when persistence becomes PostgreSQL); each write delegates to
 * exactly one synchronous repository transaction script. Services never open
 * transactions themselves (enforced by ESLint).
 */

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Records one income, expense, refund or transfer. */
export async function recordTransaction(
  ctx: ServiceContext,
  draft: TransactionDraft,
): Promise<ServiceResult<string>> {
  return runScript(() => ledger.recordDrafts(ctx.db, writeContext(ctx), [draft])[0]!);
}

/** A transfer plus its fee, as one atomic group (e.g. a mobile-wallet cash-out). */
export async function recordTransferWithFee(
  ctx: ServiceContext,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amount: Money;
    fee: Money;
    feeCategoryId: string;
    occurredOn: CalendarDate;
    description?: string | null;
  },
): Promise<ServiceResult<{ transferId: string; feeId: string }>> {
  return runScript(() => {
    const [transferId, feeId] = ledger.recordDrafts(ctx.db, writeContext(ctx), [
      {
        type: "transfer",
        amount: input.amount,
        accountId: input.fromAccountId,
        counterAccountId: input.toAccountId,
        occurredOn: input.occurredOn,
        description: input.description ?? null,
      },
      {
        type: "expense",
        amount: input.fee,
        accountId: input.fromAccountId,
        categoryId: input.feeCategoryId,
        occurredOn: input.occurredOn,
        description: input.description ? `${input.description} (fee)` : "Fee",
      },
    ]);
    return { transferId: transferId!, feeId: feeId! };
  });
}

/** Edits a transaction in place — including its type (one-row update; id and sequence unchanged). */
export async function updateTransaction(
  ctx: ServiceContext,
  id: string,
  draft: TransactionDraft,
): Promise<ServiceResult<void>> {
  return runScript(() => ledger.updateTransaction(ctx.db, writeContext(ctx), id, draft));
}

/** Soft-deletes a transaction (or its whole group). */
export async function deleteTransaction(
  ctx: ServiceContext,
  id: string,
): Promise<ServiceResult<string[]>> {
  return runScript(() => ledger.deleteTransaction(ctx.db, writeContext(ctx), id));
}

/** Restores a soft-deleted transaction (or its whole group), re-checking every rule. */
export async function restoreTransaction(
  ctx: ServiceContext,
  id: string,
): Promise<ServiceResult<string[]>> {
  return runScript(() => ledger.restoreTransaction(ctx.db, writeContext(ctx), id));
}

// ---------------------------------------------------------------------------
// Reads (derived, never stored)
// ---------------------------------------------------------------------------

export interface AccountBalanceView {
  readonly accountId: string;
  readonly name: string;
  readonly type: AccountType;
  readonly balance: Money;
}

export async function getAccountBalances(
  ctx: ServiceContext,
  asOf?: CalendarDate,
): Promise<AccountBalanceView[]> {
  return queries.accountBalances(ctx.db, ctx.ownerId, asOf).map((r) => ({
    accountId: r.accountId,
    name: r.name,
    type: r.type,
    balance: money(r.balanceMinor),
  }));
}

export async function getPosition(ctx: ServiceContext, asOf?: CalendarDate): Promise<Position> {
  return summarizePosition(await getAccountBalances(ctx, asOf));
}

/** Spending per category id (expenses net of refunds) over a half-open range. */
export async function getSpendingByCategory(
  ctx: ServiceContext,
  range: DateRange,
): Promise<Map<string, Money>> {
  return new Map(
    queries
      .spendingByCategory(ctx.db, ctx.ownerId, range)
      .map((r) => [r.categoryId ?? "", money(r.spendingMinor)] as const),
  );
}

export async function getTotalSpending(ctx: ServiceContext, range: DateRange): Promise<Money> {
  return sum((await getSpendingByCategory(ctx, range)).values());
}

/** Income per income category id over a half-open range; the values sum to getIncome. */
export async function getIncomeByCategory(
  ctx: ServiceContext,
  range: DateRange,
): Promise<Map<string, Money>> {
  return new Map(
    queries
      .incomeByCategory(ctx.db, ctx.ownerId, range)
      .map((r) => [r.categoryId ?? "", money(r.incomeMinor)] as const),
  );
}

export async function getIncome(ctx: ServiceContext, range: DateRange): Promise<Money> {
  return money(queries.incomeTotal(ctx.db, ctx.ownerId, range));
}

export async function getSavingsRate(ctx: ServiceContext, range: DateRange): Promise<Ratio | null> {
  return savingsRate(await getIncome(ctx, range), await getTotalSpending(ctx, range));
}

/** Active transactions in business order: (occurred_on, sequence). */
export async function getTransactions(ctx: ServiceContext, range?: DateRange) {
  return queries.listTransactions(ctx.db, ctx.ownerId, range);
}
