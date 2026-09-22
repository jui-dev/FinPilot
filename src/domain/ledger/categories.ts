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
