/** Account types and their derived class (docs/domain-model.md §5). */
export const ACCOUNT_TYPES = ["cash", "bank", "mobile_wallet", "savings", "credit_card"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export type AccountClass = "asset" | "liability";

/** Derived, never stored: storing it could let class and type disagree. */
export const accountClass = (type: AccountType): AccountClass =>
  type === "credit_card" ? "liability" : "asset";

/** Default Available eligibility at creation; stored per account afterwards. */
export const defaultIncludedInAvailable = (type: AccountType): boolean => type !== "savings";

export interface AccountRuleViolation {
  readonly code: "liability_excluded";
  readonly message: string;
}

/**
 * The liability invariant (docs/domain-model.md §5): every liability counts in
 * Available, so `included_in_available = false` is invalid for one. Otherwise
 * a preference could hide debt and overstate Available. An asset account may
 * be included or excluded. Every write that sets the type or the flag checks it.
 */
export function checkAvailableEligibility(
  type: AccountType,
  includedInAvailable: boolean,
): AccountRuleViolation | undefined {
  if (accountClass(type) === "liability" && !includedInAvailable) {
    return {
      code: "liability_excluded",
      message: "A credit card always counts toward Available and cannot be excluded.",
    };
  }
  return undefined;
}
