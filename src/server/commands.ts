import { z } from "zod";

import {
  commitmentFieldForRule,
  commitmentInputSchema,
  payOccurrenceInputSchema,
  type CommitmentValues,
} from "@/domain/commitments/input";
import {
  accountInputSchema,
  categoryInputSchema,
  categoryNameSchema,
  fieldForRule,
  openingBalanceInputSchema,
  signedBalance,
  toTransactionEntry,
  transactionInputSchema,
  verifyBalanceInputSchema,
} from "@/domain/ledger/input";
import type { Money } from "@/domain/money";
import {
  earmarkInputSchema,
  protectedMoneyFieldForRule,
  protectedMoneyItemInputSchema,
} from "@/domain/protected-money/input";
import type { ServiceContext } from "@/server/context";
import type { ServiceResult } from "@/server/errors";
import { getActivityItem } from "@/server/services/activity-service";
import * as commitments from "@/server/services/commitment-service";
import * as ledger from "@/server/services/ledger-service";
import * as protectedMoney from "@/server/services/protected-money-service";
import * as reconciliation from "@/server/services/reconciliation-service";
import * as setup from "@/server/services/setup-service";

/**
 * Commands: the application operations behind the UI's server actions.
 * Each validates untrusted input with the shared schemas, calls one service,
 * and reports failures in a form the UI can place next to the right field.
 * They take an explicit ServiceContext, so they are tested without Next.js.
 */

export type FieldErrors = Partial<Record<string, string>>;

export type CommandResult<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly message: string; readonly fieldErrors: FieldErrors };

const done = <T>(value: T): CommandResult<T> => ({ ok: true, value });

function invalid(error: z.ZodError): CommandResult<never> {
  const flat = z.flattenError(error);
  const fieldErrors: FieldErrors = {};
  for (const [field, messages] of Object.entries(flat.fieldErrors) as [string, string[]][]) {
    if (messages[0]) fieldErrors[field] = messages[0];
  }
  return {
    ok: false,
    message: flat.formErrors[0] ?? "Check the highlighted fields.",
    fieldErrors,
  };
}

function rejected(
  error: { code: string; message: string },
  rename: Partial<Record<string, string>> = {},
): CommandResult<never> {
  const field = fieldForRule(error.code);
  const target = field ? (rename[field] ?? field) : null;
  return {
    ok: false,
    message: error.message,
    fieldErrors: target ? { [target]: error.message } : {},
  };
}

const fromService = <T>(result: ServiceResult<T>, rename?: Partial<Record<string, string>>) =>
  result.ok ? done(result.value) : rejected(result.error, rename);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export interface BalanceEffect {
  readonly accountId: string;
  readonly name: string;
  readonly before: Money;
  readonly after: Money;
}

export interface RecordedTransaction {
  readonly ids: string[];
  /** Balances of the affected accounts before and after, derived by the ledger. */
  readonly effects: BalanceEffect[];
}

async function balancesOf(ctx: ServiceContext, accountIds: readonly string[]) {
  const all = await ledger.getAccountBalances(ctx);
  return accountIds.map((id) => all.find((b) => b.accountId === id)).filter((b) => b !== undefined);
}

/** Records an expense, income, refund or transfer (with an optional fee) from a Quick Add form. */
export async function recordEntry(
  ctx: ServiceContext,
  raw: unknown,
): Promise<CommandResult<RecordedTransaction>> {
  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { draft, fee } = toTransactionEntry(parsed.data);

  const affected =
    draft.type === "transfer" ? [draft.accountId, draft.counterAccountId] : [draft.accountId];
  const before = await balancesOf(ctx, affected);

  let ids: string[];
  if (draft.type === "transfer" && fee) {
    const result = await ledger.recordTransferWithFee(ctx, {
      fromAccountId: draft.accountId,
      toAccountId: draft.counterAccountId,
      amount: draft.amount,
      fee: fee.amount,
      feeCategoryId: fee.categoryId,
      occurredOn: draft.occurredOn,
      description: draft.description,
    });
    if (!result.ok) return rejected(result.error);
    ids = [result.value.transferId, result.value.feeId];
  } else {
    const result = await ledger.recordTransaction(ctx, draft);
    if (!result.ok) return rejected(result.error);
    ids = [result.value];
  }

  const after = await balancesOf(ctx, affected);
  return done({
    ids,
    effects: before.map((b) => ({
      accountId: b.accountId,
      name: b.name,
      before: b.balance,
      after: after.find((a) => a.accountId === b.accountId)?.balance ?? b.balance,
    })),
  });
}

/** Edits one ledger row in place, including a change of type. */
export async function editEntry(
  ctx: ServiceContext,
  id: string,
  raw: unknown,
): Promise<CommandResult> {
  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { draft } = toTransactionEntry(parsed.data);
  return fromService(await ledger.updateTransaction(ctx, id, draft));
}

/** Changes the amount an account started with (its opening-balance row). */
export async function editOpeningBalance(
  ctx: ServiceContext,
  id: string,
  raw: unknown,
): Promise<CommandResult> {
  const parsed = openingBalanceInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const item = await getActivityItem(ctx, id);
  if (!item || item.primary.type !== "opening_balance") {
    return rejected({
      code: "transaction_not_found",
      message: "The opening balance does not exist.",
    });
  }
  const row = item.primary;
  return fromService(
    await ledger.updateTransaction(ctx, id, {
      type: "opening_balance",
      balance: signedBalance(row.account.type, parsed.data.startingAmount),
      accountId: row.account.id,
      occurredOn: row.occurredOn,
    }),
    { amount: "startingAmount" },
  );
}

/** Records a refund of an existing expense; it inherits the expense's category. */
export async function refundExpense(
  ctx: ServiceContext,
  expenseId: string,
  raw: unknown,
): Promise<CommandResult<RecordedTransaction>> {
  const input = typeof raw === "object" && raw !== null ? raw : {};
  return recordEntry(ctx, {
    ...input,
    type: "refund",
    refundOfId: expenseId,
    categoryId: undefined,
  });
}

/** Soft-deletes a transaction (or its whole group). Returns the ids, for Undo. */
export async function removeEntry(
  ctx: ServiceContext,
  id: string,
): Promise<CommandResult<string[]>> {
  return fromService(await ledger.deleteTransaction(ctx, id));
}

export async function restoreEntry(
  ctx: ServiceContext,
  id: string,
): Promise<CommandResult<string[]>> {
  return fromService(await ledger.restoreTransaction(ctx, id));
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface VerifiedBalance {
  /** The balance the ledger held as of that date, before verifying. */
  readonly recorded: Money;
  /** The balance stated by the person, signed by the account's type. */
  readonly stated: Money;
  /** stated − recorded; zero when the ledger already agreed. */
  readonly difference: Money;
  /** True when a correcting adjustment was posted. */
  readonly adjusted: boolean;
}

/** Records what an account actually held, correcting the ledger if it disagreed. */
export async function verifyBalance(
  ctx: ServiceContext,
  raw: unknown,
): Promise<CommandResult<VerifiedBalance>> {
  const parsed = verifyBalanceInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const result = await reconciliation.verifyAccountBalance(ctx, parsed.data);
  if (!result.ok) {
    return rejected(result.error, { amount: "countedAmount", occurredOn: "asOf" });
  }
  const { recorded, stated, difference, adjustmentId } = result.value;
  return done({ recorded, stated, difference, adjusted: adjustmentId !== null });
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

export async function openAccount(
  ctx: ServiceContext,
  raw: unknown,
): Promise<CommandResult<string>> {
  const parsed = accountInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { name, type, openedOn, startingAmount } = parsed.data;
  return fromService(
    await setup.createAccount(ctx, {
      name,
      type,
      openedOn,
      openingBalance: signedBalance(type, startingAmount),
    }),
    { occurredOn: "openedOn", amount: "startingAmount" },
  );
}

export const archiveAccount = async (ctx: ServiceContext, id: string) =>
  fromService(await setup.archiveAccount(ctx, id));

export const restoreAccount = async (ctx: ServiceContext, id: string) =>
  fromService(await setup.restoreAccount(ctx, id));

export const deleteAccount = async (ctx: ServiceContext, id: string) =>
  fromService(await setup.deleteAccount(ctx, id));

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function addCategory(
  ctx: ServiceContext,
  raw: unknown,
): Promise<CommandResult<string>> {
  const parsed = categoryInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return fromService(await setup.createCategory(ctx, parsed.data));
}

export async function renameCategory(
  ctx: ServiceContext,
  id: string,
  raw: unknown,
): Promise<CommandResult> {
  const parsed = categoryNameSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "Check the name.",
      fieldErrors: { name: parsed.error.issues[0]?.message ?? "Check the name." },
    };
  }
  return fromService(await setup.renameCategory(ctx, id, parsed.data));
}

export const archiveCategory = async (ctx: ServiceContext, id: string) =>
  fromService(await setup.archiveCategory(ctx, id));

export const restoreCategory = async (ctx: ServiceContext, id: string) =>
  fromService(await setup.restoreCategory(ctx, id));

export const deleteCategory = async (ctx: ServiceContext, id: string) =>
  fromService(await setup.deleteCategory(ctx, id));

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

function commitmentRejected(error: { code: string; message: string }): CommandResult<never> {
  const field = commitmentFieldForRule(error.code);
  return {
    ok: false,
    message: error.message,
    fieldErrors: field ? { [field]: error.message } : {},
  };
}

const commitmentDraft = (values: CommitmentValues): commitments.CommitmentDraft => ({
  name: values.name,
  categoryId: values.categoryId,
  expectedAmount: values.expectedAmount,
  expectedAccountId: values.expectedAccountId,
  frequency: values.frequency,
  interval: values.interval,
  anchorOn: values.anchorOn,
  endOn: values.endOn,
});

export async function createCommitment(
  ctx: ServiceContext,
  raw: unknown,
): Promise<CommandResult<string>> {
  const parsed = commitmentInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const result = await commitments.createCommitment(ctx, commitmentDraft(parsed.data));
  return result.ok ? done(result.value) : commitmentRejected(result.error);
}

/** Edits a commitment; a schedule or amount change regenerates only its untouched future. */
export async function editCommitment(
  ctx: ServiceContext,
  id: string,
  raw: unknown,
): Promise<CommandResult> {
  const parsed = commitmentInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const result = await commitments.editCommitment(ctx, id, commitmentDraft(parsed.data));
  return result.ok ? done(undefined) : commitmentRejected(result.error);
}

/** Records an occurrence's payment as a real expense. Returns the transaction id. */
export async function payOccurrence(
  ctx: ServiceContext,
  occurrenceId: string,
  raw: unknown,
): Promise<CommandResult<string>> {
  const parsed = payOccurrenceInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return fromService(await commitments.payOccurrence(ctx, occurrenceId, parsed.data));
}

export const skipOccurrence = async (ctx: ServiceContext, occurrenceId: string) =>
  fromService(await commitments.skipOccurrence(ctx, occurrenceId));

// ---------------------------------------------------------------------------
// Protected money ("Set aside")
// ---------------------------------------------------------------------------

function protectedMoneyResult<T>(result: ServiceResult<T>): CommandResult<T> {
  if (result.ok) return done(result.value);
  const field = protectedMoneyFieldForRule(result.error.code);
  return {
    ok: false,
    message: result.error.message,
    fieldErrors: field ? { [field]: result.error.message } : {},
  };
}

export async function createProtectedMoneyItem(
  ctx: ServiceContext,
  raw: unknown,
): Promise<CommandResult<string>> {
  const parsed = protectedMoneyItemInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return protectedMoneyResult(await protectedMoney.createItem(ctx, parsed.data));
}

/** Renames an item or changes its target; neither reserves nor releases anything. */
export async function editProtectedMoneyItem(
  ctx: ServiceContext,
  id: string,
  raw: unknown,
): Promise<CommandResult> {
  const parsed = protectedMoneyItemInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return protectedMoneyResult(await protectedMoney.editItem(ctx, id, parsed.data));
}

export const archiveProtectedMoneyItem = async (ctx: ServiceContext, id: string) =>
  protectedMoneyResult(await protectedMoney.archiveItem(ctx, id));

/** Sets money aside from an asset account for the item. */
export async function reserveProtectedMoney(
  ctx: ServiceContext,
  itemId: string,
  raw: unknown,
): Promise<CommandResult> {
  const parsed = earmarkInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return protectedMoneyResult(await protectedMoney.reserve(ctx, itemId, parsed.data));
}

/** Releases money set aside for the item, partly or fully. */
export async function releaseProtectedMoney(
  ctx: ServiceContext,
  itemId: string,
  raw: unknown,
): Promise<CommandResult> {
  const parsed = earmarkInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  return protectedMoneyResult(await protectedMoney.release(ctx, itemId, parsed.data));
}
