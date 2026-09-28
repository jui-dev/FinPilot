import type { CalendarDate } from "@/domain/calendar-date";
import {
  displayState,
  occurrenceState,
  type OccurrenceDisplayState,
  type OccurrenceState,
} from "@/domain/commitments/occurrences";
import type { CommitmentFrequency } from "@/domain/commitments/schedule";
import { abs, money, type Money } from "@/domain/money";
import { writeContext, type ServiceContext } from "@/server/context";
import { runScript, type ServiceResult } from "@/server/errors";
import * as queries from "@/server/repositories/commitment-queries";
import * as repository from "@/server/repositories/commitment-repository";
import type {
  CommitmentDraft,
  PayOccurrenceDraft,
} from "@/server/repositories/commitment-repository";

/**
 * Commitments' application API: scheduled obligations and their occurrences
 * (docs/domain-model.md §8). Occurrences are materialised lazily — every read
 * first brings them up to today + 60 days — and their state is derived from
 * the ledger on every read, never stored.
 */

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createCommitment(
  ctx: ServiceContext,
  draft: CommitmentDraft,
): Promise<ServiceResult<string>> {
  return runScript(() => repository.createCommitment(ctx.db, writeContext(ctx), draft));
}

export async function editCommitment(
  ctx: ServiceContext,
  id: string,
  draft: CommitmentDraft,
): Promise<ServiceResult<void>> {
  return runScript(() => repository.editCommitment(ctx.db, writeContext(ctx), id, draft));
}

/** Records the occurrence's payment as a real expense and links it. Returns the transaction id. */
export async function payOccurrence(
  ctx: ServiceContext,
  occurrenceId: string,
  draft: PayOccurrenceDraft,
): Promise<ServiceResult<string>> {
  return runScript(() => repository.payOccurrence(ctx.db, writeContext(ctx), occurrenceId, draft));
}

export async function skipOccurrence(
  ctx: ServiceContext,
  occurrenceId: string,
): Promise<ServiceResult<void>> {
  return runScript(() => repository.skipOccurrence(ctx.db, writeContext(ctx), occurrenceId));
}

// ---------------------------------------------------------------------------
// Reads (derived, never stored)
// ---------------------------------------------------------------------------

export interface CommitmentView {
  readonly id: string;
  readonly name: string;
  readonly categoryId: string;
  readonly expectedAmount: Money;
  readonly expectedAccountId: string | null;
  readonly frequency: CommitmentFrequency;
  readonly interval: number;
  readonly anchorOn: CalendarDate;
  readonly endOn: CalendarDate | null;
  readonly generateFrom: CalendarDate;
}

export async function getCommitments(ctx: ServiceContext): Promise<CommitmentView[]> {
  return queries.listCommitments(ctx.db, ctx.ownerId).map((r) => ({
    id: r.id,
    name: r.name,
    categoryId: r.categoryId,
    expectedAmount: money(r.expectedAmountMinor),
    expectedAccountId: r.expectedAccountId,
    frequency: r.frequency,
    interval: r.intervalCount,
    anchorOn: r.anchorOn as CalendarDate,
    endOn: r.endOn as CalendarDate | null,
    generateFrom: r.generateFrom as CalendarDate,
  }));
}

export interface OccurrenceView {
  readonly id: string;
  readonly commitmentId: string;
  readonly name: string;
  readonly categoryId: string;
  readonly expectedAccountId: string | null;
  readonly dueOn: CalendarDate;
  readonly expectedAmount: Money;
  readonly state: OccurrenceState;
  readonly display: OccurrenceDisplayState;
  /** The payment evidence pointer, kept even after that transaction stops paying. */
  readonly transactionId: string | null;
  /** The ledger payment, only while it pays the occurrence (state "paid"). */
  readonly payment: {
    readonly amount: Money;
    readonly paidOn: CalendarDate;
    readonly accountId: string;
  } | null;
}

/** Every occurrence through today + 60 days, in due order, materialising first. */
export async function getOccurrences(ctx: ServiceContext): Promise<OccurrenceView[]> {
  const write = writeContext(ctx);
  repository.materialiseOccurrences(ctx.db, write);
  return queries.listOccurrences(ctx.db, ctx.ownerId).map((r) => {
    const dueOn = r.dueOn as CalendarDate;
    const state = occurrenceState({
      skipped: r.skippedAt !== null,
      link:
        r.transactionId !== null && r.linkType !== null
          ? { type: r.linkType, deleted: r.linkDeletedAt !== null }
          : null,
    });
    return {
      id: r.id,
      commitmentId: r.commitmentId,
      name: r.name,
      categoryId: r.categoryId,
      expectedAccountId: r.expectedAccountId,
      dueOn,
      expectedAmount: money(r.expectedAmountMinor),
      state,
      display: displayState(state, dueOn, write.today),
      transactionId: r.transactionId,
      payment:
        state === "paid" && r.linkAmountMinor !== null && r.linkAccountId !== null
          ? {
              amount: abs(money(r.linkAmountMinor)),
              paidOn: r.linkOccurredOn as CalendarDate,
              accountId: r.linkAccountId,
            }
          : null,
    };
  });
}

export type { CommitmentDraft, PayOccurrenceDraft };
