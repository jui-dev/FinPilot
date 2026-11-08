import type { AppDatabase } from "@/db/client";
import { reconciliationCheckpoints } from "@/db/schema";
import type { CalendarDate } from "@/domain/calendar-date";
import { statedBalance } from "@/domain/ledger/input";
import { reconcile } from "@/domain/ledger/reconciliation";
import { money, type Money } from "@/domain/money";
import type { WriteContext } from "@/server/context";
import { LedgerRuleError } from "@/server/errors";
import { accountBalanceAsOf } from "@/server/repositories/ledger-queries";
import { accountFacts, IMMEDIATE, insertDraft } from "@/server/repositories/ledger-repository";

/**
 * Verifying an account balance (docs/domain-model.md §2, §6).
 *
 * The recorded balance is read and the adjustment and checkpoint are written
 * inside ONE transaction, so nothing can be recorded between measuring the
 * difference and correcting it. Any throw rolls back the checkpoint, the
 * adjustment and the sequence number the adjustment consumed.
 */

export interface VerifyBalanceInput {
  readonly accountId: string;
  readonly asOf: CalendarDate;
  /** The magnitude the person counted; the sign comes from the account's type (and inCredit). */
  readonly countedAmount: Money;
  /** A card that holds credit rather than owing (docs/domain-model.md §5). Cards only. */
  readonly inCredit?: boolean;
}

export interface VerifyBalanceResult {
  readonly checkpointId: string;
  /** Null when the ledger already agreed: the checkpoint is recorded, nothing is posted. */
  readonly adjustmentId: string | null;
  readonly recorded: Money;
  readonly stated: Money;
  readonly difference: Money;
}

export function verifyBalance(
  db: AppDatabase,
  ctx: WriteContext,
  input: VerifyBalanceInput,
): VerifyBalanceResult {
  return db.transaction((tx) => {
    const account = accountFacts(tx, ctx.ownerId, input.accountId);

    // These repeat checks that checkLedgerRules would make on the adjustment,
    // and they are not redundant: when the difference is zero no draft is
    // inserted, so only these stop a checkpoint being recorded against an
    // archived account, a future date, or a date before the account existed.
    if (!account) throw new LedgerRuleError("account_not_found", "The account does not exist.");
    if (account.archived) {
      throw new LedgerRuleError("account_archived", "The account is archived.");
    }
    if (input.asOf > ctx.today) {
      throw new LedgerRuleError("future_date", "A balance cannot be verified for a future date.");
    }
    if (input.asOf < account.openedOn) {
      throw new LedgerRuleError("before_opened_on", "The date is before the account was opened.");
    }

    const stated = statedBalance(account.type, input.countedAmount, input.inCredit);
    if (stated === null) {
      throw new LedgerRuleError("credit_not_liability", "Only a card can be in credit.");
    }
    const recorded = money(accountBalanceAsOf(tx, ctx.ownerId, input.accountId, input.asOf));
    const { difference, needsAdjustment } = reconcile(recorded, stated);

    const adjustmentId = needsAdjustment
      ? insertDraft(tx, ctx, {
          type: "adjustment",
          difference,
          accountId: input.accountId,
          occurredOn: input.asOf,
          description: "Balance adjustment",
        })
      : null;

    const checkpointId = ctx.ids.next();
    tx.insert(reconciliationCheckpoints)
      .values({
        id: checkpointId,
        ownerId: ctx.ownerId,
        accountId: input.accountId,
        asOf: input.asOf,
        statedBalanceMinor: stated,
        adjustmentId,
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      })
      .run();

    return { checkpointId, adjustmentId, recorded, stated, difference };
  }, IMMEDIATE);
}
