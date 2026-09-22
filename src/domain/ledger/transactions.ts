import type { CalendarDate } from "@/domain/calendar-date";
import { negate, type Money } from "@/domain/money";

/** Transaction types and shapes (docs/domain-model.md §4). */
export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "refund",
  "transfer",
  "opening_balance",
  "adjustment",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_KINDS = ["income", "expense"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

/** Only three types ever count as income or spending. */
export const countsAsIncome = (type: TransactionType): boolean => type === "income";
export const countsAsSpending = (type: TransactionType): boolean =>
  type === "expense" || type === "refund";

/** The category kind a type requires, or null when it must have no category. */
export function requiredCategoryKind(type: TransactionType): CategoryKind | null {
  switch (type) {
    case "income":
      return "income";
    case "expense":
    case "refund":
      return "expense";
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Stored shape (one row, Model S). Mirrors the ck_transactions_* CHECKs.
// ---------------------------------------------------------------------------

export interface LedgerRow {
  readonly type: TransactionType;
  /** Signed effect on accountId, in minor units. */
  readonly amountMinor: Money;
  readonly accountId: string;
  readonly counterAccountId: string | null;
  readonly categoryId: string | null;
  readonly refundOfId: string | null;
}

/** Names match the database CHECK constraints (ck_transactions_<name>). */
export type ShapeViolation = "income" | "expense" | "refund" | "transfer" | "opening_adjustment";

/**
 * The per-type shape rules, as a pure function. A differential property test
 * keeps this and the database CHECKs in exact agreement.
 */
export function shapeViolations(row: LedgerRow): ShapeViolation[] {
  const { type, amountMinor: a, counterAccountId: counter, categoryId: cat, refundOfId: ref } = row;
  const violations: ShapeViolation[] = [];
  if (type === "income" && !(a > 0 && cat !== null && counter === null && ref === null))
    violations.push("income");
  if (type === "expense" && !(a < 0 && cat !== null && counter === null && ref === null))
    violations.push("expense");
  if (type === "refund" && !(a > 0 && cat !== null && counter === null)) violations.push("refund");
  if (
    type === "transfer" &&
    !(a < 0 && counter !== null && counter !== row.accountId && cat === null && ref === null)
  )
    violations.push("transfer");
  if (
    (type === "opening_balance" || type === "adjustment") &&
    !(a !== 0 && cat === null && counter === null && ref === null)
  )
    violations.push("opening_adjustment");
  return violations;
}

// ---------------------------------------------------------------------------
// Drafts: what a person records. Amounts are positive magnitudes; the domain
// derives the signed stored amount. Opening balances are signed by nature.
// ---------------------------------------------------------------------------

interface DraftCommon {
  readonly occurredOn: CalendarDate;
  readonly description?: string | null;
  readonly note?: string | null;
}

export type TransactionDraft =
  | (DraftCommon & {
      readonly type: "income" | "expense";
      readonly amount: Money;
      readonly accountId: string;
      readonly categoryId: string;
    })
  | (DraftCommon & {
      readonly type: "refund";
      readonly amount: Money;
      readonly accountId: string;
      /** Optional when refundOfId is given: defaults to the original expense's category. */
      readonly categoryId?: string | null;
      readonly refundOfId?: string | null;
    })
  | (DraftCommon & {
      readonly type: "transfer";
      readonly amount: Money;
      readonly accountId: string;
      readonly counterAccountId: string;
    })
  | (DraftCommon & {
      readonly type: "opening_balance";
      /** Signed starting balance: negative for money owed on a credit card. */
      readonly balance: Money;
      readonly accountId: string;
    });

/** Converts a draft to its stored row. `categoryId` for refunds must be resolved first. */
export function toLedgerRow(
  draft: TransactionDraft,
  resolvedCategoryId?: string | null,
): LedgerRow {
  switch (draft.type) {
    case "income":
      return row("income", draft.amount, draft.accountId, null, draft.categoryId, null);
    case "expense":
      return row("expense", negate(draft.amount), draft.accountId, null, draft.categoryId, null);
    case "refund":
      return row(
        "refund",
        draft.amount,
        draft.accountId,
        null,
        resolvedCategoryId ?? draft.categoryId ?? null,
        draft.refundOfId ?? null,
      );
    case "transfer":
      return row(
        "transfer",
        negate(draft.amount),
        draft.accountId,
        draft.counterAccountId,
        null,
        null,
      );
    case "opening_balance":
      return row("opening_balance", draft.balance, draft.accountId, null, null, null);
  }
}

function row(
  type: TransactionType,
  amountMinor: Money,
  accountId: string,
  counterAccountId: string | null,
  categoryId: string | null,
  refundOfId: string | null,
): LedgerRow {
  return { type, amountMinor, accountId, counterAccountId, categoryId, refundOfId };
}

/** The draft that would reproduce a stored row (used to re-validate on restore). */
export function toDraft(
  stored: LedgerRow & { occurredOn: CalendarDate; description: string | null; note: string | null },
): TransactionDraft | null {
  const common = {
    occurredOn: stored.occurredOn,
    description: stored.description,
    note: stored.note,
  };
  const magnitude = (
    stored.amountMinor < 0 ? negate(stored.amountMinor) : stored.amountMinor
  ) as Money;
  switch (stored.type) {
    case "income":
    case "expense":
      return {
        ...common,
        type: stored.type,
        amount: magnitude,
        accountId: stored.accountId,
        categoryId: stored.categoryId ?? "",
      };
    case "refund":
      return {
        ...common,
        type: "refund",
        amount: magnitude,
        accountId: stored.accountId,
        categoryId: stored.categoryId,
        refundOfId: stored.refundOfId,
      };
    case "transfer":
      return {
        ...common,
        type: "transfer",
        amount: magnitude,
        accountId: stored.accountId,
        counterAccountId: stored.counterAccountId ?? "",
      };
    case "opening_balance":
      return {
        ...common,
        type: "opening_balance",
        balance: stored.amountMinor,
        accountId: stored.accountId,
      };
    case "adjustment":
      return null; // created only by reconciliation (Stage 4)
  }
}
