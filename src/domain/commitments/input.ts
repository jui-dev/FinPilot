import { z } from "zod";

import { date, name, positiveAmount, reference } from "@/domain/ledger/input";

import { COMMITMENT_FREQUENCIES } from "./schedule";

/**
 * Untrusted input → commitment values. Shape only: the rule itself is checked
 * by checkCommitmentRule, and anything that needs the database (the category,
 * the expected account, the ledger rules Pay goes through) is checked inside
 * the repository's write transaction.
 */

/** Empty or missing → null; otherwise a real ISO date. */
const optionalDate = z
  .string()
  .optional()
  .transform((raw) => (raw && raw.trim() !== "" ? raw : undefined))
  .pipe(date.optional())
  .transform((value) => value ?? null);

/** Empty or missing → null. */
const optionalReference = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null));

export const commitmentInputSchema = z.object({
  name: name(40, "Give the commitment a name."),
  categoryId: reference("Choose a category."),
  expectedAmount: positiveAmount(),
  expectedAccountId: optionalReference,
  frequency: z.enum(COMMITMENT_FREQUENCIES, { error: "Choose how often it repeats." }),
  interval: z.coerce
    .number({ error: "Enter how often it repeats." })
    .int("Enter a whole number.")
    .min(1, "Enter 1 or more."),
  /** The first due date; its day of month is the day every later date aims for. */
  anchorOn: date,
  endOn: optionalDate,
});

export type CommitmentInput = z.input<typeof commitmentInputSchema>;
export type CommitmentValues = z.output<typeof commitmentInputSchema>;

/**
 * Paying an occurrence records a real expense. Amount and date are optional:
 * the occurrence's expected amount and today are the defaults. The account is
 * always stated — the commitment's expected account only pre-fills it.
 */
export const payOccurrenceInputSchema = z.object({
  accountId: reference("Choose an account."),
  amount: z
    .string()
    .optional()
    .transform((raw) => (raw && raw.trim() !== "" ? raw : undefined))
    .pipe(positiveAmount().optional()),
  occurredOn: optionalDate,
});

export type PayOccurrenceInput = z.input<typeof payOccurrenceInputSchema>;

export type CommitmentFieldName = keyof CommitmentValues;

/** Where a create/edit rejection belongs, so the form can show it on the right field. */
const COMMITMENT_RULE_FIELDS: Partial<Record<string, CommitmentFieldName>> = {
  invalid_name: "name",
  unsupported_frequency: "frequency",
  invalid_interval: "interval",
  end_before_anchor: "endOn",
  invalid_amount: "expectedAmount",
  category_not_found: "categoryId",
  category_archived: "categoryId",
  category_kind_mismatch: "categoryId",
  account_not_found: "expectedAccountId",
  account_archived: "expectedAccountId",
};

export const commitmentFieldForRule = (code: string): CommitmentFieldName | null =>
  COMMITMENT_RULE_FIELDS[code] ?? null;
