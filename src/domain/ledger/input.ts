import { z } from "zod";

import { parseCalendarDate, type CalendarDate } from "@/domain/calendar-date";
import { negate, parseMoney, type Money } from "@/domain/money";

import { ACCOUNT_TYPES, accountClass, type AccountType } from "./accounts";
import type { LedgerRuleCode } from "./rules";
import { CATEGORY_KINDS, type TransactionDraft } from "./transactions";

/**
 * Untrusted input → domain values. One schema per input, shared by the UI
 * forms and the server actions (and later the ingestion API): amounts arrive as
 * text a person typed, dates as ISO strings, and every rule that needs the
 * database is left to the ledger rules.
 */

// ---------------------------------------------------------------------------
// Field schemas
// ---------------------------------------------------------------------------

const positiveAmount = (message = "Enter an amount above zero.") =>
  z.string().transform((raw, ctx): Money => {
    const result = parseMoney(raw);
    if (!result.ok || result.value <= 0) {
      ctx.addIssue({ code: "custom", message });
      return z.NEVER;
    }
    return result.value;
  });

/** Zero or more, e.g. an account's starting balance. Empty means zero. */
const nonNegativeAmount = z.string().transform((raw, ctx): Money => {
  const result = parseMoney(raw.trim() === "" ? "0" : raw);
  if (!result.ok || result.value < 0) {
    ctx.addIssue({ code: "custom", message: "Enter an amount of zero or more." });
    return z.NEVER;
  }
  return result.value;
});

const date = z.string().transform((raw, ctx): CalendarDate => {
  const result = parseCalendarDate(raw);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: "Enter a valid date." });
    return z.NEVER;
  }
  return result.value;
});

const reference = (message: string) => z.string({ error: message }).trim().min(1, message);

/** Optional free text: trimmed, empty → null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep it under ${max} characters.`)
    .optional()
    .transform((v) => (v ? v : null));

const name = (max: number, message: string) =>
  z.string().trim().min(1, message).max(max, `Keep it under ${max} characters.`);

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

const common = {
  amount: positiveAmount(),
  accountId: reference("Choose an account."),
  occurredOn: date,
  description: optionalText(120),
  note: optionalText(500),
};

export const transactionInputSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["expense", "income"]),
    ...common,
    categoryId: reference("Choose a category."),
  }),
  z.object({
    type: z.literal("refund"),
    ...common,
    categoryId: z.string().trim().optional(),
    refundOfId: z.string().trim().optional(),
  }),
  z
    .object({
      type: z.literal("transfer"),
      ...common,
      counterAccountId: reference("Choose where the money goes."),
      fee: z.string().optional(),
      feeCategoryId: z.string().trim().optional(),
    })
    .superRefine((input, ctx) => {
      if (input.counterAccountId === input.accountId) {
        ctx.addIssue({
          code: "custom",
          path: ["counterAccountId"],
          message: "A transfer needs two different accounts.",
        });
      }
      if (input.fee && input.fee.trim() !== "") {
        const fee = parseMoney(input.fee);
        if (!fee.ok || fee.value <= 0) {
          ctx.addIssue({ code: "custom", path: ["fee"], message: "Enter a fee above zero." });
        } else if (!input.feeCategoryId) {
          ctx.addIssue({
            code: "custom",
            path: ["feeCategoryId"],
            message: "Choose a category for the fee.",
          });
        }
      }
    }),
]);

export type TransactionInput = z.input<typeof transactionInputSchema>;
export type TransactionFieldName =
  | "type"
  | "amount"
  | "accountId"
  | "counterAccountId"
  | "categoryId"
  | "occurredOn"
  | "description"
  | "note"
  | "fee"
  | "feeCategoryId";

/** A parsed entry: one draft, plus a fee when a transfer carries one. */
export interface TransactionEntry {
  readonly draft: TransactionDraft;
  readonly fee: { readonly amount: Money; readonly categoryId: string } | null;
}

export function toTransactionEntry(
  input: z.output<typeof transactionInputSchema>,
): TransactionEntry {
  const base = {
    occurredOn: input.occurredOn,
    description: input.description,
    note: input.note,
  };
  switch (input.type) {
    case "income":
    case "expense":
      return {
        draft: {
          ...base,
          type: input.type,
          amount: input.amount,
          accountId: input.accountId,
          categoryId: input.categoryId,
        },
        fee: null,
      };
    case "refund":
      return {
        draft: {
          ...base,
          type: "refund",
          amount: input.amount,
          accountId: input.accountId,
          categoryId: input.categoryId || null,
          refundOfId: input.refundOfId || null,
        },
        fee: null,
      };
    case "transfer": {
      const fee = input.fee && input.fee.trim() !== "" ? parseMoney(input.fee) : null;
      return {
        draft: {
          ...base,
          type: "transfer",
          amount: input.amount,
          accountId: input.accountId,
          counterAccountId: input.counterAccountId,
        },
        fee:
          fee && fee.ok && input.feeCategoryId
            ? { amount: fee.value, categoryId: input.feeCategoryId }
            : null,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Accounts and categories
// ---------------------------------------------------------------------------

export const accountInputSchema = z.object({
  name: name(40, "Give the account a name."),
  type: z.enum(ACCOUNT_TYPES, { error: "Choose an account type." }),
  openedOn: date,
  /** What the account held (or, for a card, what was owed) on the opening date. */
  startingAmount: nonNegativeAmount,
});

export type AccountInput = z.input<typeof accountInputSchema>;

/**
 * The signed opening balance for an account type: a card's starting amount is
 * money owed, so it is stored negative (docs/domain-model.md §5).
 */
export const signedOpeningBalance = (type: AccountType, startingAmount: Money): Money =>
  accountClass(type) === "liability" && startingAmount !== 0
    ? negate(startingAmount)
    : startingAmount;

export const categoryInputSchema = z.object({
  name: name(40, "Give the category a name."),
  kind: z.enum(CATEGORY_KINDS),
});

export const categoryNameSchema = name(40, "Give the category a name.");

/** An opening balance edit: the magnitude a person types, signed by the account type. */
export const openingBalanceInputSchema = z.object({
  startingAmount: positiveAmount("Enter an amount above zero, or delete the account instead."),
});

// ---------------------------------------------------------------------------
// Mapping rule rejections to the field a person should fix
// ---------------------------------------------------------------------------

const RULE_FIELDS: Partial<Record<LedgerRuleCode | string, TransactionFieldName | "name">> = {
  invalid_amount: "amount",
  future_date: "occurredOn",
  before_opened_on: "occurredOn",
  opening_balance_date: "occurredOn",
  account_not_found: "accountId",
  account_archived: "accountId",
  currency_mismatch: "accountId",
  counter_account_not_found: "counterAccountId",
  counter_account_archived: "counterAccountId",
  same_account_transfer: "counterAccountId",
  category_not_found: "categoryId",
  category_archived: "categoryId",
  category_kind_mismatch: "categoryId",
  refund_category_mismatch: "categoryId",
  duplicate_name: "name",
  invalid_name: "name",
};

/** The input field a rule rejection belongs to, or null for a form-level message. */
export const fieldForRule = (code: string): TransactionFieldName | "name" | null =>
  RULE_FIELDS[code] ?? null;
