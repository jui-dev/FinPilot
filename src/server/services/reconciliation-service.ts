import type { CalendarDate } from "@/domain/calendar-date";
import { money, type Money } from "@/domain/money";
import { NEVER_VERIFIED, verificationOf, type Verification } from "@/domain/ledger/verification";
import { writeContext, type ServiceContext } from "@/server/context";
import { runScript, type ServiceResult } from "@/server/errors";
import { currentCheckpoints } from "@/server/repositories/reconciliation-queries";
import * as reconciliation from "@/server/repositories/reconciliation-repository";
import type {
  VerifyBalanceInput,
  VerifyBalanceResult,
} from "@/server/repositories/reconciliation-repository";

/**
 * Reconciliation's application API: recording what an account really held, and
 * reading back whether that verification still holds. The status is derived on
 * every read, never stored.
 */

/**
 * Records what an account actually held on a date: posts the correcting
 * adjustment when the ledger disagrees, and the checkpoint either way.
 */
export async function verifyAccountBalance(
  ctx: ServiceContext,
  input: VerifyBalanceInput,
): Promise<ServiceResult<VerifyBalanceResult>> {
  return runScript(() => reconciliation.verifyBalance(ctx.db, writeContext(ctx), input));
}

/**
 * Whether each account is still as it was verified. Accounts that were never
 * verified are present too, so callers need no null handling.
 */
export async function getAccountVerifications(
  ctx: ServiceContext,
  accountIds: readonly string[],
): Promise<Map<string, Verification>> {
  const byAccount = new Map<string, Verification>(
    accountIds.map((id) => [id, NEVER_VERIFIED] as const),
  );
  for (const row of currentCheckpoints(ctx.db, ctx.ownerId)) {
    byAccount.set(
      row.accountId,
      verificationOf(
        row.asOf as CalendarDate,
        money(row.statedBalanceMinor),
        money(row.recordedBalanceMinor),
      ),
    );
  }
  return byAccount;
}

/** An account's current checkpoint: its status, and the adjustment that verifying it posted. */
export interface CurrentCheckpoint {
  readonly accountId: string;
  readonly verification: Verification;
  /** The correcting adjustment while it is active; null when the ledger already agreed. */
  readonly adjustment: { readonly transactionId: string; readonly amount: Money } | null;
}

/**
 * Each verified account's current checkpoint, with the same status as
 * getAccountVerifications and the adjustment that checkpoint posted. Accounts
 * that were never verified are absent.
 */
export async function getCurrentCheckpoints(ctx: ServiceContext): Promise<CurrentCheckpoint[]> {
  return currentCheckpoints(ctx.db, ctx.ownerId).map((row) => ({
    accountId: row.accountId,
    verification: verificationOf(
      row.asOf as CalendarDate,
      money(row.statedBalanceMinor),
      money(row.recordedBalanceMinor),
    ),
    adjustment:
      row.adjustmentId !== null && row.adjustmentAmountMinor !== null
        ? { transactionId: row.adjustmentId, amount: money(row.adjustmentAmountMinor) }
        : null,
  }));
}

export type { VerifyBalanceInput, VerifyBalanceResult, Verification };
