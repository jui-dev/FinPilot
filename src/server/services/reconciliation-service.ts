import { writeContext, type ServiceContext } from "@/server/context";
import { runScript, type ServiceResult } from "@/server/errors";
import * as reconciliation from "@/server/repositories/reconciliation-repository";
import type {
  VerifyBalanceInput,
  VerifyBalanceResult,
} from "@/server/repositories/reconciliation-repository";

/**
 * Reconciliation's application API. Stage 4a is the write path only: a
 * checkpoint's status ("verified" vs "changed since verified") is derived in a
 * later boundary, so nothing here reads checkpoints back.
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

export type { VerifyBalanceInput, VerifyBalanceResult };
