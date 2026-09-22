import type { CalendarDate } from "@/domain/calendar-date";

import type { AccountType } from "./accounts";
import { requiredCategoryKind, type CategoryKind, type TransactionDraft } from "./transactions";

/**
 * Invariants that span rows (docs/domain-model.md §4.2, §5, §6). They cannot be
 * single-row CHECKs, so repositories load the facts inside the write
 * transaction and ask this pure function for a verdict.
 */
export type LedgerRuleCode =
  | "invalid_amount"
  | "future_date"
  | "account_not_found"
  | "account_archived"
  | "counter_account_not_found"
  | "counter_account_archived"
  | "same_account_transfer"
  | "currency_mismatch"
  | "before_opened_on"
  | "category_not_found"
  | "category_archived"
  | "category_kind_mismatch"
  | "refund_target_invalid"
  | "refund_category_mismatch"
  | "opening_balance_date";

export interface LedgerRuleViolation {
  readonly code: LedgerRuleCode;
  readonly message: string;
}

export interface AccountFacts {
  readonly id: string;
  readonly type: AccountType;
  readonly currency: string;
  readonly openedOn: CalendarDate;
  readonly archived: boolean;
}

export interface CategoryFacts {
  readonly id: string;
  readonly kind: CategoryKind;
  readonly archived: boolean;
}

export interface RefundTargetFacts {
  readonly id: string;
  /** Present only if the target exists and is not deleted. */
  readonly type: string;
  readonly categoryId: string | null;
}

export interface LedgerFacts {
  readonly today: CalendarDate;
  readonly ownerCurrency: string;
  readonly account: AccountFacts | undefined;
  readonly counterAccount?: AccountFacts | undefined;
  readonly category?: CategoryFacts | undefined;
  /** Active (non-deleted) refund target, if refundOfId was given and found. */
  readonly refundTarget?: RefundTargetFacts | undefined;
}

const violation = (code: LedgerRuleCode, message: string): LedgerRuleViolation => ({
  code,
  message,
});

/** The category a draft will be stored with (a linked refund inherits its expense's). */
export function resolvedCategoryId(draft: TransactionDraft, facts: LedgerFacts): string | null {
  switch (draft.type) {
    case "income":
    case "expense":
      return draft.categoryId;
    case "refund":
      return draft.categoryId ?? facts.refundTarget?.categoryId ?? null;
    default:
      return null;
  }
}

export function checkLedgerRules(
  draft: TransactionDraft,
  facts: LedgerFacts,
): LedgerRuleViolation | null {
  const magnitude = draft.type === "opening_balance" ? draft.balance : draft.amount;
  if (draft.type === "opening_balance" ? magnitude === 0 : magnitude <= 0) {
    return violation("invalid_amount", "The amount must be greater than zero.");
  }
  if (draft.occurredOn > facts.today) {
    return violation("future_date", "Transactions cannot be dated in the future.");
  }

  const account = facts.account;
  if (!account) return violation("account_not_found", "The account does not exist.");
  if (account.archived) return violation("account_archived", "The account is archived.");
  if (account.currency !== facts.ownerCurrency) {
    return violation("currency_mismatch", "The account's currency differs from the base currency.");
  }
  if (draft.occurredOn < account.openedOn) {
    return violation("before_opened_on", "The date is before the account was opened.");
  }

  if (draft.type === "opening_balance" && draft.occurredOn !== account.openedOn) {
    return violation(
      "opening_balance_date",
      "An opening balance must be dated the account's opening date.",
    );
  }

  if (draft.type === "transfer") {
    if (draft.counterAccountId === draft.accountId) {
      return violation("same_account_transfer", "A transfer needs two different accounts.");
    }
    const counter = facts.counterAccount;
    if (!counter)
      return violation("counter_account_not_found", "The destination account does not exist.");
    if (counter.archived)
      return violation("counter_account_archived", "The destination account is archived.");
    if (counter.currency !== facts.ownerCurrency) {
      return violation(
        "currency_mismatch",
        "The destination account's currency differs from the base currency.",
      );
    }
    if (draft.occurredOn < counter.openedOn) {
      return violation(
        "before_opened_on",
        "The date is before the destination account was opened.",
      );
    }
  }

  if (draft.type === "refund" && draft.refundOfId) {
    const target = facts.refundTarget;
    if (!target || target.type !== "expense") {
      return violation("refund_target_invalid", "A linked refund must refer to an active expense.");
    }
    if (draft.categoryId && draft.categoryId !== target.categoryId) {
      return violation(
        "refund_category_mismatch",
        "A linked refund must use the same category as the original expense.",
      );
    }
  }

  const requiredKind = requiredCategoryKind(draft.type);
  if (requiredKind) {
    const category = facts.category;
    if (!category || category.id !== resolvedCategoryId(draft, facts)) {
      return violation("category_not_found", "The category does not exist.");
    }
    if (category.archived) return violation("category_archived", "The category is archived.");
    if (category.kind !== requiredKind) {
      return violation(
        "category_kind_mismatch",
        `This transaction needs an ${requiredKind} category.`,
      );
    }
  }

  return null;
}
