import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  abs,
  add,
  compare,
  formatMoney,
  fromMajor,
  groupSouthAsian,
  money,
  negate,
  parseMoney,
  roundToMajor,
  sign,
  subtract,
  sum,
  ZERO,
  type Money,
} from "@/domain/money";

const MAX = Number.MAX_SAFE_INTEGER;
/** Any valid Money value. */
const anyMoney = fc.integer({ min: -MAX, max: MAX }).map(money);
/** Money small enough that sums of a few values stay safe. */
const smallMoney = fc.integer({ min: -(2 ** 40), max: 2 ** 40 }).map(money);

describe("Money construction and guards", () => {
  it("stores integer minor units", () => {
    expect(money(150)).toBe(150);
    expect(fromMajor(95_000)).toBe(9_500_000);
  });

  it.each([1.5, Number.NaN, Infinity, MAX + 1])("rejects non-safe-integer minor units: %s", (v) => {
    expect(() => money(v)).toThrow(RangeError);
  });

  it("rejects fractional or overflowing major units", () => {
    expect(() => fromMajor(10.5)).toThrow(RangeError);
    expect(() => fromMajor(MAX)).toThrow(RangeError);
  });

  it("guards arithmetic overflow", () => {
    expect(() => add(money(MAX), money(1))).toThrow(RangeError);
    expect(() => subtract(money(-MAX), money(1))).toThrow(RangeError);
  });

  it("has a single zero (no -0)", () => {
    expect(Object.is(negate(ZERO), 0)).toBe(true);
    expect(Object.is(money(-0), 0)).toBe(true);
    expect(Object.is(subtract(money(5), money(5)), 0)).toBe(true);
  });
});

describe("Money arithmetic properties", () => {
  it("add is commutative and associative; zero is the identity", () => {
    fc.assert(
      fc.property(smallMoney, smallMoney, smallMoney, (a, b, c) => {
        expect(add(a, b)).toBe(add(b, a));
        expect(add(add(a, b), c)).toBe(add(a, add(b, c)));
        expect(add(a, ZERO)).toBe(a);
      }),
    );
  });

  it("subtract is add of the negation; negate is an involution", () => {
    fc.assert(
      fc.property(smallMoney, smallMoney, (a, b) => {
        expect(subtract(a, b)).toBe(add(a, negate(b)));
        expect(negate(negate(a))).toBe(a);
        expect(add(a, negate(a))).toBe(ZERO);
      }),
    );
  });

  it("sum equals repeated add", () => {
    fc.assert(
      fc.property(fc.array(smallMoney, { maxLength: 50 }), (values) => {
        expect(sum(values)).toBe(values.reduce((acc, v) => add(acc, v), ZERO));
      }),
    );
  });

  it("compare, sign and abs agree", () => {
    fc.assert(
      fc.property(anyMoney, anyMoney, (a, b) => {
        expect(compare(a, b)).toBe(-compare(b, a) || 0);
        expect(sign(a) * abs(a)).toBe(a);
      }),
    );
  });
});

describe("roundToMajor (half away from zero, presentation only)", () => {
  it.each<[number, number]>([
    [149, 100],
    [150, 200],
    [-149, -100],
    [-150, -200],
    [0, 0],
    [99, 100],
    [-49, 0],
  ])("%i poisha → %i", (input, expected) => {
    expect(roundToMajor(money(input))).toBe(expected);
  });

  it("is symmetric, idempotent and moves at most half a unit", () => {
    fc.assert(
      fc.property(fc.integer({ min: -(MAX - 100), max: MAX - 100 }).map(money), (a) => {
        const r = roundToMajor(a);
        expect(r % 100 === 0).toBe(true); // `%` of a negative multiple yields -0
        expect(Object.is(r, -0)).toBe(false);
        expect(roundToMajor(r)).toBe(r);
        expect(roundToMajor(negate(a))).toBe(negate(r));
        expect(Math.abs(r - a)).toBeLessThanOrEqual(50);
      }),
    );
  });
});

describe("formatMoney", () => {
  it.each<[number, string]>([
    [0, "৳0"],
    [100, "৳1"],
    [100_000, "৳1,000"],
    [15_000_000, "৳1,50,000"],
    [23_016_300, "৳2,30,163"],
    [1_000_000_000, "৳1,00,00,000"],
    [-120_000_000, "−৳12,00,000"],
    [8_796_300, "৳87,963"],
    [-40, "৳0"],
  ])("%i poisha → %s", (minor, expected) => {
    expect(formatMoney(money(minor))).toBe(expected);
  });

  it("shows exact poisha in minor precision", () => {
    expect(formatMoney(money(15_000_050), "minor")).toBe("৳1,50,000.50");
    expect(formatMoney(money(-5), "minor")).toBe("−৳0.05");
  });

  it("groups digits South Asian style", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 18n }), (n) => {
        const digits = n.toString();
        const grouped = groupSouthAsian(digits);
        expect(grouped.replaceAll(",", "")).toBe(digits);
        expect(grouped).toMatch(/^(\d{1,3}|\d{1,2}(,\d{2})*,\d{3})$/);
      }),
    );
  });
});

describe("parseMoney", () => {
  it.each<[string, number]>([
    ["1500", 150_000],
    ["1,500", 150_000],
    ["1,50,000", 15_000_000],
    ["150,000", 15_000_000],
    ["৳1,50,000.5", 15_000_050],
    ["  ৳ 450.05 ", 45_005],
    ["-250", -25_000],
    ["−৳250", -25_000],
    ["+12", 1_200],
    ["0", 0],
  ])("%s → %i poisha", (input, expected) => {
    const result = parseMoney(input);
    expect(result).toEqual({ ok: true, value: expected });
  });

  it.each(["", "abc", "1.234", "1,5,000", "15,0000", ",100", "100,", "1..5", "৳", "1e5", "--5"])(
    "rejects %j",
    (input) => {
      expect(parseMoney(input).ok).toBe(false);
    },
  );

  it("rejects amounts beyond the safe range instead of losing precision", () => {
    expect(parseMoney("90071992547410").ok).toBe(false);
    expect(parseMoney("90071992547409.91")).toEqual({ ok: true, value: MAX });
  });

  it("round-trips: parse(format(m, minor)) = m for every Money", () => {
    fc.assert(
      fc.property(anyMoney, (m) => {
        expect(parseMoney(formatMoney(m, "minor"))).toEqual({ ok: true, value: m });
      }),
    );
  });

  it("round-trips at display precision: parse(format(m)) = roundToMajor(m)", () => {
    fc.assert(
      fc.property(fc.integer({ min: -(MAX - 100), max: MAX - 100 }).map(money), (m: Money) => {
        expect(parseMoney(formatMoney(m))).toEqual({ ok: true, value: roundToMajor(m) });
      }),
    );
  });
});
