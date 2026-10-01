import {
  accounts,
  categories,
  commitmentOccurrences,
  commitments,
  earmarkEntries,
  earmarks,
  protectedMoneyItems,
  reconciliationCheckpoints,
  signalDismissals,
  transactions,
} from "./schema";

/**
 * Every table that holds an owner's data, parents before children: each table
 * references only `owners` and tables earlier in the list. Clearing walks it
 * backwards, copying walks it forwards, so the order is the one thing that
 * keeps both inside the foreign keys.
 *
 * **A new owned table must be added here.** tests/db/owner-data.test.ts fails
 * when a table in the schema is missing.
 */
export const OWNED_TABLES = [
  accounts,
  categories,
  transactions,
  reconciliationCheckpoints,
  commitments,
  commitmentOccurrences,
  protectedMoneyItems,
  earmarks,
  earmarkEntries,
  signalDismissals,
] as const;

export type OwnedTable = (typeof OWNED_TABLES)[number];

/** Children before parents: the order rows can be deleted in. */
export const OWNED_TABLES_CHILDREN_FIRST: readonly OwnedTable[] = [...OWNED_TABLES].reverse();
