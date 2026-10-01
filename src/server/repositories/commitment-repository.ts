import { and, eq, inArray, isNull, gt } from "drizzle-orm";

import type { AppDatabase, SyncDb } from "@/db/client";
import { categories, commitmentOccurrences, commitments, transactions } from "@/db/schema";
import { addDays, type CalendarDate } from "@/domain/calendar-date";
import {
  materialisedThrough,
  occurrenceState,
  regenerationPlan,
  type OccurrenceState,
  type StoredOccurrence,
} from "@/domain/commitments/occurrences";
import {
  checkCommitmentRule,
  dueDatesIn,
  type CommitmentFrequency,
  type CommitmentRule,
  type CommitmentSchedule,
} from "@/domain/commitments/schedule";
import { money, type Money } from "@/domain/money";
import type { WriteContext } from "@/server/context";
import { LedgerRuleError } from "@/server/errors";
import { accountFacts, IMMEDIATE, insertDraft } from "@/server/repositories/ledger-repository";

/**
 * Commitment write scripts (docs/domain-model.md §8). Each runs as ONE
 * synchronous immediate transaction: load facts → pure domain verdict → write.
 * Any throw rolls back everything, including the ledger sequence number Pay
 * takes through `insertDraft`.
 *
 * An occurrence's paid state is never stored: it is derived from the linked
 * transaction as the ledger holds it now. Ledger writes therefore never touch
 * this module, and deleting or restoring a payment needs no write here.
 */

export interface CommitmentDraft {
  readonly name: string;
  readonly categoryId: string;
  readonly expectedAmount: Money;
  readonly expectedAccountId: string | null;
  readonly frequency: CommitmentFrequency;
  readonly interval: number;
  readonly anchorOn: CalendarDate;
  readonly endOn: CalendarDate | null;
}

export interface PayOccurrenceDraft {
  readonly accountId: string;
  /** Defaults to the occurrence's expected amount. */
  readonly amount?: Money | undefined;
  /** Defaults to today. */
  readonly occurredOn?: CalendarDate | null | undefined;
}

type CommitmentRow = typeof commitments.$inferSelect;

const scheduleOf = (row: CommitmentRow): CommitmentSchedule => ({
  frequency: row.frequency,
  interval: row.intervalCount,
  anchorOn: row.anchorOn as CalendarDate,
  endOn: row.endOn as CalendarDate | null,
});

const ruleOfDraft = (draft: CommitmentDraft): CommitmentRule => ({
  schedule: {
    frequency: draft.frequency,
    interval: draft.interval,
    anchorOn: draft.anchorOn,
    endOn: draft.endOn,
  },
  expectedAmount: draft.expectedAmount,
});

const later = (a: CalendarDate, b: CalendarDate): CalendarDate => (a > b ? a : b);
const earlier = (a: CalendarDate, b: CalendarDate): CalendarDate => (a < b ? a : b);

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

function ownedCommitment(tx: SyncDb, ownerId: string, id: string): CommitmentRow {
  const row = tx
    .select()
    .from(commitments)
    .where(and(eq(commitments.ownerId, ownerId), eq(commitments.id, id)))
    .get();
  if (!row) throw new LedgerRuleError("commitment_not_found", "The commitment does not exist.");
  return row;
}

/**
 * Validates a commitment against its rule and the current facts. The archived
 * checks apply only to a category or account being newly chosen, so a
 * commitment whose account was later archived can still be renamed.
 */
function checkDraft(
  tx: SyncDb,
  ctx: WriteContext,
  draft: CommitmentDraft,
  existing?: CommitmentRow,
): void {
  if (draft.name.trim().length === 0) {
    throw new LedgerRuleError("invalid_name", "The commitment needs a name.");
  }
  const broken = checkCommitmentRule(ruleOfDraft(draft));
  if (broken) throw new LedgerRuleError(broken.code, broken.message);

  const category = tx
    .select()
    .from(categories)
    .where(and(eq(categories.ownerId, ctx.ownerId), eq(categories.id, draft.categoryId)))
    .get();
  if (!category) throw new LedgerRuleError("category_not_found", "The category does not exist.");
  if (category.kind !== "expense") {
    throw new LedgerRuleError("category_kind_mismatch", "A commitment needs an expense category.");
  }
  if (category.archivedAt !== null && category.id !== existing?.categoryId) {
    throw new LedgerRuleError("category_archived", "The category is archived.");
  }

  if (draft.expectedAccountId !== null) {
    const account = accountFacts(tx, ctx.ownerId, draft.expectedAccountId);
    if (!account) throw new LedgerRuleError("account_not_found", "The account does not exist.");
    if (account.archived && account.id !== existing?.expectedAccountId) {
      throw new LedgerRuleError("account_archived", "The account is archived.");
    }
  }
}

// ---------------------------------------------------------------------------
// Materialisation
// ---------------------------------------------------------------------------

/**
 * Creates the occurrences each commitment's current rule has due from its
 * generation boundary through today + 60 days. Idempotent: the unique
 * (commitment_id, due_on) key ignores dates that already exist, so an existing
 * occurrence is never overwritten. Must be called inside a write transaction.
 */
function materialiseIn(tx: SyncDb, ctx: WriteContext, commitmentId?: string): void {
  const rows = tx
    .select()
    .from(commitments)
    .where(
      commitmentId
        ? and(eq(commitments.ownerId, ctx.ownerId), eq(commitments.id, commitmentId))
        : eq(commitments.ownerId, ctx.ownerId),
    )
    .all();
  const end = addDays(materialisedThrough(ctx.today), 1);

  for (const row of rows) {
    const start = later(row.anchorOn as CalendarDate, row.generateFrom as CalendarDate);
    const dates = dueDatesIn(scheduleOf(row), { start, end });
    if (dates.length === 0) continue;
    tx.insert(commitmentOccurrences)
      .values(
        dates.map((dueOn) => ({
          id: ctx.ids.next(),
          ownerId: ctx.ownerId,
          commitmentId: row.id,
          dueOn,
          expectedAmountMinor: row.expectedAmountMinor,
          transactionId: null,
          skippedAt: null,
          createdAt: ctx.nowIso,
          updatedAt: ctx.nowIso,
        })),
      )
      .onConflictDoNothing({
        target: [commitmentOccurrences.commitmentId, commitmentOccurrences.dueOn],
      })
      .run();
  }
}

/** Brings every commitment's occurrences up to today + 60 days. Run before each occurrence read. */
export function materialiseOccurrences(db: AppDatabase, ctx: WriteContext): void {
  db.transaction((tx) => materialiseIn(tx, ctx), IMMEDIATE);
}

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

export function createCommitment(db: AppDatabase, ctx: WriteContext, draft: CommitmentDraft) {
  return db.transaction((tx) => {
    checkDraft(tx, ctx, draft);
    const id = ctx.ids.next();
    tx.insert(commitments)
      .values({
        id,
        ownerId: ctx.ownerId,
        name: draft.name.trim(),
        categoryId: draft.categoryId,
        expectedAmountMinor: draft.expectedAmount,
        expectedAccountId: draft.expectedAccountId,
        frequency: draft.frequency,
        intervalCount: draft.interval,
        anchorOn: draft.anchorOn,
        endOn: draft.endOn,
        // A new rule has no history yet: it may generate from its anchor. The
        // boundary marks history only, so it is never set in the future — a
        // future anchor already bounds generation on its own, and a future
        // boundary would outlive an edit that moves the anchor earlier.
        generateFrom: earlier(draft.anchorOn, ctx.today),
        createdAt: ctx.nowIso,
        updatedAt: ctx.nowIso,
      })
      .run();
    return id;
  }, IMMEDIATE);
}

const ruleChanged = (row: CommitmentRow, draft: CommitmentDraft): boolean =>
  row.frequency !== draft.frequency ||
  row.intervalCount !== draft.interval ||
  row.anchorOn !== draft.anchorOn ||
  row.endOn !== draft.endOn ||
  row.expectedAmountMinor !== draft.expectedAmount;

/**
 * Edits a commitment. A name, category or expected-account change touches no
 * occurrence. A rule change (schedule or amount), atomically:
 *   1. materialises the OLD rule, so an obligation that fell due since the
 *      last read exists before anything else happens;
 *   2. plans against the new rule — only untouched occurrences due after today
 *      may be removed or added (regenerationPlan);
 *   3. removes those, updates the rule and moves the generation boundary to at
 *      least tomorrow (never back), then adds the regenerated occurrences.
 * The boundary is what stops the new rule manufacturing historical dates on a
 * later read.
 */
export function editCommitment(
  db: AppDatabase,
  ctx: WriteContext,
  id: string,
  draft: CommitmentDraft,
): void {
  db.transaction((tx) => {
    const existing = ownedCommitment(tx, ctx.ownerId, id);
    checkDraft(tx, ctx, draft, existing);

    const details = {
      name: draft.name.trim(),
      categoryId: draft.categoryId,
      expectedAccountId: draft.expectedAccountId,
      updatedAt: ctx.nowIso,
    };
    const where = and(eq(commitments.ownerId, ctx.ownerId), eq(commitments.id, id));

    if (!ruleChanged(existing, draft)) {
      tx.update(commitments).set(details).where(where).run();
      return;
    }

    materialiseIn(tx, ctx, id);

    const stored: StoredOccurrence[] = tx
      .select()
      .from(commitmentOccurrences)
      .where(
        and(
          eq(commitmentOccurrences.ownerId, ctx.ownerId),
          eq(commitmentOccurrences.commitmentId, id),
        ),
      )
      .all()
      .map((o) => ({
        id: o.id,
        dueOn: o.dueOn as CalendarDate,
        expectedAmount: money(o.expectedAmountMinor),
        skipped: o.skippedAt !== null,
        linked: o.transactionId !== null,
      }));
    const plan = regenerationPlan(stored, ruleOfDraft(draft), ctx.today);

    if (plan.remove.length > 0) {
      // The plan only removes untouched future occurrences; the conditions are
      // repeated here so a planning bug can never delete history.
      const removed = tx
        .delete(commitmentOccurrences)
        .where(
          and(
            eq(commitmentOccurrences.ownerId, ctx.ownerId),
            inArray(commitmentOccurrences.id, [...plan.remove]),
            isNull(commitmentOccurrences.transactionId),
            isNull(commitmentOccurrences.skippedAt),
            gt(commitmentOccurrences.dueOn, ctx.today),
          ),
        )
        .run();
      if (removed.changes !== plan.remove.length) {
        throw new Error("Regeneration tried to remove a protected occurrence.");
      }
    }

    tx.update(commitments)
      .set({
        ...details,
        expectedAmountMinor: draft.expectedAmount,
        frequency: draft.frequency,
        intervalCount: draft.interval,
        anchorOn: draft.anchorOn,
        endOn: draft.endOn,
        generateFrom: later(existing.generateFrom as CalendarDate, addDays(ctx.today, 1)),
      })
      .where(where)
      .run();

    if (plan.add.length > 0) {
      tx.insert(commitmentOccurrences)
        .values(
          plan.add.map((o) => ({
            id: ctx.ids.next(),
            ownerId: ctx.ownerId,
            commitmentId: id,
            dueOn: o.dueOn,
            expectedAmountMinor: o.expectedAmount,
            transactionId: null,
            skippedAt: null,
            createdAt: ctx.nowIso,
            updatedAt: ctx.nowIso,
          })),
        )
        .run();
    }
  }, IMMEDIATE);
}

// ---------------------------------------------------------------------------
// Occurrence outcomes
// ---------------------------------------------------------------------------

/** An owned occurrence, its commitment, and its derived state. */
function occurrenceFacts(tx: SyncDb, ownerId: string, id: string) {
  const row = tx
    .select({
      occurrence: commitmentOccurrences,
      commitment: commitments,
      linkType: transactions.type,
      linkDeletedAt: transactions.deletedAt,
    })
    .from(commitmentOccurrences)
    .innerJoin(
      commitments,
      and(
        eq(commitments.ownerId, commitmentOccurrences.ownerId),
        eq(commitments.id, commitmentOccurrences.commitmentId),
      ),
    )
    .leftJoin(
      transactions,
      and(
        eq(transactions.ownerId, commitmentOccurrences.ownerId),
        eq(transactions.id, commitmentOccurrences.transactionId),
      ),
    )
    .where(and(eq(commitmentOccurrences.ownerId, ownerId), eq(commitmentOccurrences.id, id)))
    .get();
  if (!row) throw new LedgerRuleError("occurrence_not_found", "The occurrence does not exist.");
  const state: OccurrenceState = occurrenceState({
    skipped: row.occurrence.skippedAt !== null,
    link:
      row.occurrence.transactionId !== null && row.linkType !== null
        ? { type: row.linkType, deleted: row.linkDeletedAt !== null }
        : null,
  });
  return { ...row, state };
}

function assertPending(state: OccurrenceState): void {
  if (state === "paid") {
    throw new LedgerRuleError("occurrence_paid", "This occurrence is already paid.");
  }
  if (state === "skipped") {
    throw new LedgerRuleError("occurrence_skipped", "This occurrence was skipped.");
  }
}

/**
 * Pay: the explicit act that records an occurrence's payment. It creates a real
 * expense through the ledger's own insertDraft, so every ledger rule applies
 * (no future date, an active account, not before the account
 * opened), and links it in the same transaction. A dead link — a payment since
 * deleted or edited into something that is not spending — is replaced by the
 * new one; the old transaction is left exactly as it is.
 */
export function payOccurrence(
  db: AppDatabase,
  ctx: WriteContext,
  occurrenceId: string,
  draft: PayOccurrenceDraft,
): string {
  return db.transaction((tx) => {
    const { occurrence, commitment, state } = occurrenceFacts(tx, ctx.ownerId, occurrenceId);
    assertPending(state);

    // The payment keeps the commitment's own category, archived or not.
    const transactionId = insertDraft(
      tx,
      ctx,
      {
        type: "expense",
        amount: draft.amount ?? money(occurrence.expectedAmountMinor),
        accountId: draft.accountId,
        categoryId: commitment.categoryId,
        occurredOn: draft.occurredOn ?? ctx.today,
        description: commitment.name,
      },
      null,
      commitment.categoryId,
    );
    tx.update(commitmentOccurrences)
      .set({ transactionId, updatedAt: ctx.nowIso })
      .where(
        and(
          eq(commitmentOccurrences.ownerId, ctx.ownerId),
          eq(commitmentOccurrences.id, occurrence.id),
        ),
      )
      .run();
    return transactionId;
  }, IMMEDIATE);
}

/**
 * Skip: the explicit decision that this occurrence will not be paid. Allowed
 * only while pending. When the pending state comes from a dead link, that
 * pointer is cleared in the same write — an explicit resolution by the person;
 * the old transaction itself stays in the ledger untouched.
 */
export function skipOccurrence(db: AppDatabase, ctx: WriteContext, occurrenceId: string): void {
  db.transaction((tx) => {
    const { occurrence, state } = occurrenceFacts(tx, ctx.ownerId, occurrenceId);
    assertPending(state);
    tx.update(commitmentOccurrences)
      .set({ transactionId: null, skippedAt: ctx.nowIso, updatedAt: ctx.nowIso })
      .where(
        and(
          eq(commitmentOccurrences.ownerId, ctx.ownerId),
          eq(commitmentOccurrences.id, occurrence.id),
        ),
      )
      .run();
  }, IMMEDIATE);
}
