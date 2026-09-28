import { describe, expect, it } from "vitest";

import { formatPercent } from "@/domain/ledger/analytics";
import { fromMajor, money, ZERO, type Money } from "@/domain/money";
import { backEarmarks, type BackedEarmark } from "@/domain/protected-money/earmarks";
import { checkArchive, checkTarget, itemCover } from "@/domain/protected-money/items";

const t = fromMajor;

const backed = (reserved: Money, covered: Money, itemId = "item"): BackedEarmark => ({
  itemId,
  reserved,
  covered,
  short: money(reserved - covered),
});

describe("checkTarget", () => {
  it("accepts no target or a positive target", () => {
    expect(checkTarget(null)).toBeUndefined();
    expect(checkTarget(money(1))).toBeUndefined();
  });

  it("rejects a zero, negative or fractional target", () => {
    expect(checkTarget(ZERO)?.code).toBe("invalid_target");
    expect(checkTarget(t(-1))?.code).toBe("invalid_target");
    expect(checkTarget(1.5 as Money)?.code).toBe("invalid_target");
  });
});

describe("checkArchive", () => {
  it("archives only when nothing remains reserved", () => {
    expect(checkArchive(ZERO)).toBeUndefined();
    expect(checkArchive(money(1))?.code).toBe("still_reserved");
  });
});

describe("itemCover without a target (reserve-like)", () => {
  it("holds any amount and has no progress, still needed or target reached", () => {
    expect(itemCover(null, [backed(t(50_000), t(50_000))])).toEqual({
      reserved: t(50_000),
      covered: t(50_000),
      short: ZERO,
      target: null,
      stillNeeded: null,
      progress: null,
      targetReached: null,
    });
  });

  it("is valid with nothing set aside", () => {
    expect(itemCover(null, [])).toMatchObject({ reserved: ZERO, covered: ZERO, progress: null });
  });
});

describe("itemCover with a target (goal-like)", () => {
  it("nothing set aside: still needs the whole target, 0% progress", () => {
    const cover = itemCover(t(80_000), []);
    expect(cover).toMatchObject({ covered: ZERO, stillNeeded: t(80_000), targetReached: false });
    expect(formatPercent(cover.progress!, 0)).toBe("0%");
  });

  it("partly covered", () => {
    const cover = itemCover(t(120_000), [backed(t(40_000), t(40_000))]);
    expect(cover).toMatchObject({ stillNeeded: t(80_000), targetReached: false });
    expect(cover.progress).toEqual({ numerator: t(40_000), denominator: t(120_000) });
    expect(formatPercent(cover.progress!, 0)).toBe("33%");
  });

  it("exactly covered: target reached, nothing still needed", () => {
    const cover = itemCover(t(10_000), [backed(t(10_000), t(10_000))]);
    expect(cover).toMatchObject({ stillNeeded: ZERO, targetReached: true });
    expect(formatPercent(cover.progress!, 0)).toBe("100%");
  });

  it("over-covered: still needed stays at zero, progress is not clamped", () => {
    const cover = itemCover(t(10_000), [backed(t(12_000), t(12_000))]);
    expect(cover).toMatchObject({ reserved: t(12_000), stillNeeded: ZERO, targetReached: true });
    expect(formatPercent(cover.progress!, 0)).toBe("120%");
  });

  it("counts only covered money: a shortfall is never counted toward the target", () => {
    const cover = itemCover(t(10_000), [backed(t(10_000), t(7_000))]);
    expect(cover).toMatchObject({
      reserved: t(10_000),
      covered: t(7_000),
      short: t(3_000),
      stillNeeded: t(3_000),
      targetReached: false,
    });
  });

  it("does not report reached one poisha short, even where the percentage rounds to 100%", () => {
    const cover = itemCover(t(1_000), [backed(money(t(1_000) - 1), money(t(1_000) - 1))]);
    expect(cover).toMatchObject({ stillNeeded: money(1), targetReached: false });
    expect(formatPercent(cover.progress!, 0)).toBe("100%");
  });

  it("rejects an invalid target", () => {
    expect(() => itemCover(ZERO, [])).toThrow(RangeError);
  });
});

describe("A-50: Laptop across Savings and Bank on 2026-09-22", () => {
  it("reserved 120,000 · covered 110,000 · short 10,000 · progress 73% · still needed 40,000", () => {
    const [savings] = backEarmarks(t(90_000), [{ itemId: "laptop", reserved: t(100_000) }]);
    const [bank] = backEarmarks(t(133_000), [{ itemId: "laptop", reserved: t(20_000) }]);
    const cover = itemCover(t(150_000), [savings!, bank!]);

    expect(cover).toEqual({
      reserved: t(120_000),
      covered: t(110_000),
      short: t(10_000),
      target: t(150_000),
      stillNeeded: t(40_000),
      progress: { numerator: t(110_000), denominator: t(150_000) },
      targetReached: false,
    });
    expect(savings!.short).toBe(t(10_000));
    expect(bank!.short).toBe(ZERO);
    expect(formatPercent(cover.progress!, 0)).toBe("73%");
  });

  it("is the same whichever order the item's accounts are aggregated in", () => {
    const earmarks = [
      backed(t(100_000), t(90_000), "laptop"),
      backed(t(20_000), t(20_000), "laptop"),
    ];
    expect(itemCover(t(150_000), earmarks)).toEqual(itemCover(t(150_000), [...earmarks].reverse()));
  });
});
