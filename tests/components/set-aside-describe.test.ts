import { describe, expect, it } from "vitest";

import { formatShare } from "@/domain/ledger/analytics";
import { fromMajor, money, ZERO, type Money } from "@/domain/money";
import { backEarmarks } from "@/domain/protected-money/earmarks";
import { itemCover, type ItemCover } from "@/domain/protected-money/items";
import {
  backing,
  barShares,
  progressLabel,
  summary,
  targetView,
} from "@/components/set-aside/describe";
import { ariaCurrent, navState, PRIMARY_NAV } from "@/components/shell/navigation";

const t = fromMajor;

/** An item's cover from (reserved, balance) pairs on separate accounts, as the service derives it. */
const cover = (target: number | null, ...accounts: [reserved: number, balance: number][]) =>
  itemCover(
    target === null ? null : t(target),
    accounts.flatMap(([reserved, balance]) =>
      backEarmarks(t(balance), [{ itemId: "i", reserved: t(reserved) }]),
    ),
  );

describe("backing: one number unless part of it is short", () => {
  it("nothing set aside", () => {
    expect(backing(cover(80_000))).toEqual({ kind: "empty" });
  });

  it("fully covered shows only what is set aside", () => {
    expect(backing(cover(null, [50_000, 60_000]))).toEqual({
      kind: "covered",
      setAside: t(50_000),
    });
  });

  it("short shows covered of set aside, and the shortfall", () => {
    expect(backing(cover(150_000, [100_000, 90_000], [20_000, 133_000]))).toEqual({
      kind: "short",
      covered: t(110_000),
      setAside: t(120_000),
      short: t(10_000),
    });
  });
});

describe("targetView: only when there is a target", () => {
  it("no target: no progress, still needed or reached state", () => {
    expect(targetView(cover(null, [50_000, 60_000]))).toBeNull();
  });

  it("zero set aside: the whole target is still needed, 0%", () => {
    const view = targetView(cover(80_000))!;
    expect(view).toMatchObject({ stillNeeded: t(80_000), reached: false });
    expect(formatShare(view.progress)).toBe("0%");
  });

  it("A-50: progress and still needed come from covered, not from what is set aside", () => {
    const view = targetView(cover(150_000, [100_000, 90_000], [20_000, 133_000]))!;
    expect(view).toMatchObject({ stillNeeded: t(40_000), reached: false });
    expect(formatShare(view.progress)).toBe("73%");
  });

  it("reached and exceeded", () => {
    expect(targetView(cover(10_000, [10_000, 20_000]))).toMatchObject({
      stillNeeded: ZERO,
      reached: true,
    });
    const over = targetView(cover(10_000, [12_000, 20_000]))!;
    expect(over).toMatchObject({ stillNeeded: ZERO, reached: true });
    expect(formatShare(over.progress)).toBe("120%");
  });
});

describe("progressLabel: display rounding never contradicts the exact result", () => {
  it("reads 99% while a target is not reached, even where rounding would say 100%", () => {
    // 999.50 of 1,000 covered: 99.95% rounds to 100%, but a poisha short is not reached.
    const view = targetView(
      itemCover(t(1_000), backEarmarks(money(99_950), [{ itemId: "i", reserved: money(99_950) }])),
    )!;
    expect(view.reached).toBe(false);
    expect(formatShare(view.progress)).toBe("100%");
    expect(progressLabel(view)).toBe("99%");
  });

  it("reads 100% when reached, above 100% when exceeded, and otherwise as rounded", () => {
    expect(progressLabel(targetView(cover(10_000, [10_000, 20_000]))!)).toBe("100%");
    expect(progressLabel(targetView(cover(10_000, [12_000, 20_000]))!)).toBe("120%");
    expect(progressLabel(targetView(cover(150_000, [100_000, 90_000], [20_000, 133_000]))!)).toBe(
      "73%",
    );
    expect(progressLabel(targetView(cover(80_000))!)).toBe("0%");
  });
});

describe("barShares", () => {
  it("has no bar without a target", () => {
    expect(barShares(cover(null, [1_000, 1_000]))).toBeNull();
  });

  it("fills covered and outlines the shortfall, both as shares of the target", () => {
    expect(barShares(cover(150_000, [100_000, 90_000], [20_000, 133_000]))).toEqual({
      covered: 110_000 / 150_000,
      short: 10_000 / 150_000,
    });
  });

  it("stays within the bar when money beyond the target is set aside or short", () => {
    expect(barShares(cover(10_000, [12_000, 20_000]))).toEqual({ covered: 1, short: 0 });
    const shares = barShares(cover(10_000, [15_000, 8_000]))!;
    expect(shares.covered).toBe(0.8);
    expect(shares.covered + shares.short).toBeCloseTo(1);
  });
});

describe("summary across items", () => {
  const covers: ItemCover[] = [cover(null, [5_000, 5_000]), cover(null, [3_000, 1_000])];
  it("totals what is set aside and names any shortfall", () => {
    expect(summary(covers)).toEqual({
      kind: "short",
      covered: t(6_000),
      setAside: t(8_000),
      short: t(2_000),
    });
    expect(summary([covers[0]!])).toEqual({ kind: "covered", setAside: t(5_000) as Money });
    expect(summary([cover(null)])).toEqual({ kind: "empty" });
  });
});

describe("interim navigation: Set aside belongs to the Commitments destination", () => {
  const commitments = PRIMARY_NAV.find((i) => i.href === "/commitments")!;
  it("is the page on /commitments and the area on /set-aside", () => {
    expect(navState("/commitments", commitments)).toBe("page");
    expect(navState("/set-aside", commitments)).toBe("area");
    expect(navState("/accounts", commitments)).toBeNull();
    expect([ariaCurrent("page"), ariaCurrent("area"), ariaCurrent(null)]).toEqual([
      "page",
      "true",
      undefined,
    ]);
  });

  it("marks no other destination on /set-aside", () => {
    expect(
      PRIMARY_NAV.filter((i) => i.href !== "/commitments").map((i) => navState("/set-aside", i)),
    ).toEqual([null, null, null]);
  });
});
