/** Account types and their derived class (docs/domain-model.md §5). */
export const ACCOUNT_TYPES = ["cash", "bank", "mobile_wallet", "savings", "credit_card"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type AccountClass = "asset" | "liability";

/** Derived, never stored: storing it could let class and type disagree. */
export const accountClass = (type: AccountType): AccountClass =>
  type === "credit_card" ? "liability" : "asset";

/** Default Available eligibility at creation; stored per account afterwards. */
export const defaultIncludedInAvailable = (type: AccountType): boolean => type !== "savings";
