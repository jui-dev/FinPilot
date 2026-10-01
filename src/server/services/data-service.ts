import { resetToDemo } from "@/db/seed/demo-reset";
import { writeContext, type ServiceContext } from "@/server/context";
import { LedgerRuleError, runScript, succeeded, type ServiceResult } from "@/server/errors";
import { resetOwnerToFreshStart } from "@/server/repositories/owner-data-repository";

/**
 * The owner's data as a whole: replace it with the demo, or clear it back to a
 * fresh start. Both act on the current owner only and keep its id.
 */

/** Replaces the owner's data with the demo ledger, dated from the owner's today. */
export async function resetDemoData(ctx: ServiceContext): Promise<ServiceResult<void>> {
  try {
    await resetToDemo(ctx.db, ctx.ownerId, ctx.clock.today());
    return succeeded(undefined);
  } catch (error) {
    if (error instanceof LedgerRuleError) {
      return { ok: false, error: { code: error.code, message: error.message } };
    }
    throw error;
  }
}

/** Removes every financial record and restores the default categories. */
export async function clearOwnerData(ctx: ServiceContext): Promise<ServiceResult<void>> {
  const { ownerId, ids, nowIso } = writeContext(ctx);
  return runScript(() => resetOwnerToFreshStart(ctx.db, ownerId, ids, nowIso));
}
