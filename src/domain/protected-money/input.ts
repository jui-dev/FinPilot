import { z } from "zod";

import { name, positiveAmount, reference } from "@/domain/ledger/input";

/**
 * Untrusted input → protected-money values. Shape only: the invariants that
 * need the database (the account's balance, what is already set aside) are
 * checked inside the repository's write transaction by checkEarmarkEntry.
 */

/** Empty or missing → null (no target); otherwise an amount above zero. */
const optionalTarget = z
  .string()
  .optional()
  .transform((raw) => (raw && raw.trim() !== "" ? raw : undefined))
  .pipe(positiveAmount("Enter a target above zero, or leave it empty.").optional())
  .transform((value) => value ?? null);

export const protectedMoneyItemInputSchema = z.object({
  name: name(40, "Give it a name."),
  target: optionalTarget,
});

export type ProtectedMoneyItemInput = z.input<typeof protectedMoneyItemInputSchema>;
export type ProtectedMoneyItemValues = z.output<typeof protectedMoneyItemInputSchema>;

/** Reserve and Release both state a positive amount; the operation gives its sign. */
export const earmarkInputSchema = z.object({
  accountId: reference("Choose an account."),
  amount: positiveAmount(),
});

export type EarmarkInput = z.input<typeof earmarkInputSchema>;
export type EarmarkValues = z.output<typeof earmarkInputSchema>;

/** Where a rejection belongs, so a form can show it on the right field. */
const PROTECTED_MONEY_RULE_FIELDS: Partial<Record<string, string>> = {
  invalid_name: "name",
  invalid_target: "target",
  invalid_amount: "amount",
  exceeds_balance: "amount",
  exceeds_reserved: "amount",
  account_not_found: "accountId",
  account_not_asset: "accountId",
  account_archived: "accountId",
};

export const protectedMoneyFieldForRule = (code: string): string | null =>
  PROTECTED_MONEY_RULE_FIELDS[code] ?? null;
