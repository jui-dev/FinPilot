import { formatMoney, type Money as MoneyValue } from "@/domain/money";

import { cn } from "./cn";

/**
 * A formatted amount: South Asian grouping, whole taka, a true minus sign, the
 * ৳ smaller and quieter than the digits, tabular figures
 * (docs/design-direction.md §3). Colour is the caller's decision.
 */
export function Money({
  amount,
  sign = "negative",
  className,
}: {
  readonly amount: MoneyValue;
  /** "negative": only a minus. "always": + or −. "none": the magnitude only. */
  readonly sign?: "negative" | "always" | "none";
  readonly className?: string;
}) {
  const text = formatMoney(amount);
  const negative = text.startsWith("−");
  const digits = text.replace(/^−?৳/, "");
  const prefix =
    sign === "none" ? "" : negative ? "−" : sign === "always" && amount !== 0 ? "+" : "";
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      {prefix}
      <span className="mr-[0.08em] text-[0.82em] font-medium opacity-70">৳</span>
      {digits}
    </span>
  );
}
