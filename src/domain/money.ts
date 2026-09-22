import { parseError, parsed, type ParseResult } from "./result";

/**
 * An amount of money as an integer count of minor units (poisha for BDT).
 *
 * Money is never a float: every value is a safe integer, and every operation
 * re-checks that invariant. Rounding happens once, at presentation
 * (docs/domain-model.md §3).
 */
declare const moneyBrand: unique symbol;
export type Money = number & { readonly [moneyBrand]: true };

export const MINOR_UNITS_PER_MAJOR = 100;

export const ZERO = 0 as Money;

function checked(value: number, operation: string): Money {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `${operation}: result ${value} is not a safe integer number of minor units`,
    );
  }
  // Normalise -0 so that zero has a single representation.
  return (value === 0 ? 0 : value) as Money;
}

/** Money from an integer count of minor units. */
export function money(minor: number): Money {
  return checked(minor, "money");
}

/** Money from an integer count of major units (whole taka), e.g. `fromMajor(95_000)`. */
export function fromMajor(major: number): Money {
  if (!Number.isSafeInteger(major)) {
    throw new RangeError(`fromMajor: ${major} is not a whole number of major units`);
  }
  return checked(major * MINOR_UNITS_PER_MAJOR, "fromMajor");
}

export const add = (a: Money, b: Money): Money => checked(a + b, "add");

export const subtract = (a: Money, b: Money): Money => checked(a - b, "subtract");

export const negate = (a: Money): Money => checked(0 - a, "negate");

export const abs = (a: Money): Money => checked(Math.abs(a), "abs");

export function sum(values: Iterable<Money>): Money {
  let total = ZERO;
  for (const value of values) total = add(total, value);
  return total;
}

export const compare = (a: Money, b: Money): -1 | 0 | 1 => (a < b ? -1 : a > b ? 1 : 0);

export const sign = (a: Money): -1 | 0 | 1 => compare(a, ZERO);

/**
 * Round to whole major units, half away from zero (so the rounding of -m is the
 * negation of the rounding of m). Used only at presentation.
 */
export function roundToMajor(a: Money): Money {
  const remainder = a % MINOR_UNITS_PER_MAJOR;
  const truncated = a - remainder;
  if (Math.abs(remainder) * 2 < MINOR_UNITS_PER_MAJOR) return checked(truncated, "roundToMajor");
  return checked(truncated + Math.sign(remainder) * MINOR_UNITS_PER_MAJOR, "roundToMajor");
}

// ---------------------------------------------------------------------------
// Presentation: ৳ with South Asian digit grouping (৳1,50,000)
// ---------------------------------------------------------------------------

export const CURRENCY_SYMBOL = "৳";
const MINUS = "−";

export type MoneyPrecision = "major" | "minor";

/** Groups digits South Asian style: last three digits, then pairs (1,50,00,000). */
export function groupSouthAsian(digits: string): string {
  if (digits.length <= 3) return digits;
  const head = digits.slice(0, -3);
  const tail = digits.slice(-3);
  const pairs: string[] = [];
  for (let end = head.length; end > 0; end -= 2)
    pairs.unshift(head.slice(Math.max(0, end - 2), end));
  return `${pairs.join(",")},${tail}`;
}

/**
 * Formats money for display. `major` (the default) rounds to whole taka;
 * `minor` shows exact poisha. Negative amounts use a true minus sign: −৳1,500.
 */
export function formatMoney(amount: Money, precision: MoneyPrecision = "major"): string {
  const value = precision === "major" ? roundToMajor(amount) : amount;
  const magnitude = Math.abs(value);
  const major = Math.trunc(magnitude / MINOR_UNITS_PER_MAJOR);
  const minor = magnitude % MINOR_UNITS_PER_MAJOR;
  const body =
    groupSouthAsian(String(major)) +
    (precision === "minor" ? `.${String(minor).padStart(2, "0")}` : "");
  return `${value < 0 ? MINUS : ""}${CURRENCY_SYMBOL}${body}`;
}

// ---------------------------------------------------------------------------
// Parsing user input
// ---------------------------------------------------------------------------

// Optional sign, optional ৳, digits (plain or comma-grouped), optional 1–2 decimals.
const MONEY_INPUT = /^([+\-−])?\s*৳?\s*(\d+|\d{1,3}(?:,\d{2,3})+)(?:\.(\d{1,2}))?$/;

/**
 * Parses an amount typed by a person: "1500", "1,500.50", "৳1,50,000", "−৳250".
 * Accepts at most two decimal places; never rounds silently.
 */
export function parseMoney(input: string): ParseResult<Money> {
  const match = MONEY_INPUT.exec(input.trim());
  if (!match) return parseError(`"${input}" is not a valid amount`);
  const [, signChar, integerPart = "", fraction = ""] = match;
  const major = Number(integerPart.replaceAll(",", ""));
  const minor = Number(fraction.padEnd(2, "0"));
  const magnitude = major * MINOR_UNITS_PER_MAJOR + minor;
  if (!Number.isSafeInteger(magnitude)) return parseError(`"${input}" is too large`);
  const negative = signChar === "-" || signChar === MINUS;
  return parsed(money(negative ? 0 - magnitude : magnitude));
}
