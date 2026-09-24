import { subtract, type Money } from "@/domain/money";

/** An exact ratio. Derived maths stays exact until presentation (docs/domain-model.md §3). */
export interface Ratio {
  readonly numerator: number;
  readonly denominator: number;
}

/**
 * Savings rate = (income − spending) / income (docs/domain-model.md §11).
 * Undefined (null) when there is no income. Transfers, opening balances and
 * adjustments are never part of income or spending.
 */
export function savingsRate(income: Money, spending: Money): Ratio | null {
  if (income <= 0) return null;
  return { numerator: subtract(income, spending), denominator: income };
}

/**
 * Formats a ratio as a percentage with `decimals` places, rounding once,
 * half away from zero, using exact integer arithmetic (e.g. 28,513 / 95,000 → "30.0%").
 */
export function formatPercent(ratio: Ratio, decimals = 1): string {
  const scale = 10n ** BigInt(decimals);
  const numerator = BigInt(ratio.numerator) * 100n * scale;
  let denominator = BigInt(ratio.denominator);
  let n = numerator;
  if (denominator < 0n) {
    denominator = -denominator;
    n = -n;
  }
  const quotient = n / denominator;
  const remainder = n % denominator;
  const absRemainder = remainder < 0n ? -remainder : remainder;
  const rounded = absRemainder * 2n >= denominator ? quotient + (n < 0n ? -1n : 1n) : quotient;
  const negative = rounded < 0n;
  const digits = (negative ? -rounded : rounded).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals > 0 ? `.${digits.slice(-decimals)}` : "";
  return `${negative ? "−" : ""}${whole}${fraction}%`;
}

/**
 * A share as a whole percentage. A positive share too small to round to 1%
 * reads "<1%", never "0%"; only a share that really is zero reads "0%".
 */
export function formatShare(ratio: Ratio): string {
  const text = formatPercent(ratio, 0);
  const positive = ratio.numerator !== 0 && ratio.numerator > 0 === ratio.denominator > 0;
  return text === "0%" && positive ? "<1%" : text;
}
