import type { CalendarDate } from "@/domain/calendar-date";
import {
  deriveAttention,
  type AttentionCheckpointFact,
  type AttentionEarmarkFact,
  type AttentionFacts,
  type AttentionOccurrenceFact,
  type AttentionSpendingFact,
} from "@/domain/signals/attention";
import type { AttentionSignal } from "@/domain/signals/signals";
import { writeContext, type ServiceContext } from "@/server/context";
import type { ServiceResult } from "@/server/errors";
import * as dismissals from "@/server/repositories/signal-dismissal-repository";
import { getMonthlyCashFlow } from "@/server/services/analysis-service";
import { getOccurrences } from "@/server/services/commitment-service";
import { getItems } from "@/server/services/protected-money-service";
import { getCurrentCheckpoints } from "@/server/services/reconciliation-service";
import { getAccounts } from "@/server/services/setup-service";

/**
 * Attention's read model (docs/domain-model.md §11). It loads each fact from
 * the feature that owns it and derives nothing financial itself:
 *
 * - occurrences and their display state from Commitments (getOccurrences);
 * - backing — reserved, covered, short — from Protected money (getItems,
 *   built on getEarmarkBacking);
 * - each account's current checkpoint status and adjustment from
 *   reconciliation (getCurrentCheckpoints);
 * - this month's same-days spending change from Cash flow (getMonthlyCashFlow);
 * - names, types, opening dates and archive state from Accounts (getAccounts).
 *
 * The pure rules select and order the signals; this layer only reshapes the
 * facts and leaves out the ones the owner has hidden. Recomputed on every
 * read; only dismissals are stored.
 */

async function attentionFacts(ctx: ServiceContext): Promise<AttentionFacts> {
  const accounts = new Map((await getAccounts(ctx)).map((a) => [a.id, a]));
  const account = (id: string) => {
    const found = accounts.get(id);
    if (!found) throw new Error(`No account ${id}.`);
    return found;
  };

  const occurrences: AttentionOccurrenceFact[] = (await getOccurrences(ctx)).map((o) => ({
    occurrenceId: o.id,
    commitmentId: o.commitmentId,
    name: o.name,
    dueOn: o.dueOn,
    expectedAmount: o.expectedAmount,
    display: o.display,
  }));

  const earmarks: AttentionEarmarkFact[] = (await getItems(ctx)).flatMap((item) =>
    item.earmarks.map((e) => ({
      itemId: item.id,
      itemName: item.name,
      accountId: e.accountId,
      accountName: account(e.accountId).name,
      reserved: e.reserved,
      covered: e.covered,
      short: e.short,
    })),
  );

  const checkpoints: AttentionCheckpointFact[] = (await getCurrentCheckpoints(ctx)).map((c) => {
    const a = account(c.accountId);
    return {
      accountId: c.accountId,
      accountName: a.name,
      accountType: a.type,
      openedOn: a.openedOn as CalendarDate,
      archived: a.archivedAt !== null,
      verification: c.verification,
      adjustment: c.adjustment,
    };
  });

  // The current month (the default) against the same days of the previous one.
  const cashFlow = await getMonthlyCashFlow(ctx);
  const spending: AttentionSpendingFact | null =
    cashFlow.period.kind === "month_to_date" && cashFlow.change !== null
      ? {
          month: cashFlow.period.month,
          comparison: cashFlow.change.comparison,
          change: cashFlow.change.explanation,
        }
      : null;

  return { today: ctx.clock.today(), occurrences, earmarks, checkpoints, spending };
}

/** Every signal the owner's facts support, before any dismissal. */
const derived = async (ctx: ServiceContext) => deriveAttention(await attentionFacts(ctx));

/** What deserves the owner's attention now, in priority order, without the signals they hid. */
export async function getAttention(ctx: ServiceContext): Promise<AttentionSignal[]> {
  const signals = await derived(ctx);
  const hidden = dismissals.dismissedKeys(ctx.db, ctx.ownerId);
  return signals.filter((s) => !(s.dismissible && hidden.has(s.key)));
}

/**
 * Hides a signal for its episode. Only a signal currently derived for this
 * owner, of a dismissible kind, can be hidden — never an arbitrary key.
 * Hiding a signal that is already hidden succeeds and changes nothing.
 */
export async function dismissSignal(
  ctx: ServiceContext,
  key: string,
): Promise<ServiceResult<void>> {
  const signal = (await derived(ctx)).find((s) => s.key === key);
  if (!signal) {
    return {
      ok: false,
      error: { code: "signal_not_found", message: "That no longer needs your attention." },
    };
  }
  if (!signal.dismissible) {
    return {
      ok: false,
      error: {
        code: "signal_not_dismissible",
        message: "This can't be hidden. It clears once it's resolved.",
      },
    };
  }
  dismissals.dismiss(ctx.db, writeContext(ctx), key);
  return { ok: true, value: undefined };
}

/** Undoes the owner's hiding of a signal. Undoing a key that isn't hidden changes nothing. */
export async function undismissSignal(
  ctx: ServiceContext,
  key: string,
): Promise<ServiceResult<void>> {
  dismissals.undismiss(ctx.db, writeContext(ctx), key);
  return { ok: true, value: undefined };
}
