import type { CategoryKind } from "./transactions";

/** Default categories seeded for every owner (docs/domain-model.md §6). No "Subscriptions". */
export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; kind: CategoryKind }> = [
  { name: "Salary", kind: "income" },
  { name: "Other Income", kind: "income" },
  { name: "Housing", kind: "expense" },
  { name: "Food & Dining", kind: "expense" },
  { name: "Groceries", kind: "expense" },
  { name: "Transport", kind: "expense" },
  { name: "Shopping", kind: "expense" },
  { name: "Utilities", kind: "expense" },
  { name: "Entertainment", kind: "expense" },
  { name: "Health", kind: "expense" },
  { name: "Fees & Charges", kind: "expense" },
  { name: "Other", kind: "expense" },
];

/** What the product calls each kind: "Expense Category", "Income Category". */
export const CATEGORY_KIND_LABEL: Readonly<Record<CategoryKind, string>> = {
  expense: "Expense Category",
  income: "Income Category",
};

/** Why the last active category of a kind cannot be archived or deleted. */
export const LAST_ACTIVE_CATEGORY_MESSAGE: Readonly<Record<CategoryKind, string>> = {
  expense: "Keep at least one Expense Category active so new expenses can be recorded.",
  income: "Keep at least one Income Category active so new income can be recorded.",
};
