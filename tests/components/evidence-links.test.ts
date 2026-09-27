import { describe, expect, it } from "vitest";

import { activityHref, cashFlowHref, cashFlowMonthOf } from "@/components/activity/links";
import { inclusiveRange, yearMonth } from "@/domain/calendar-date";

const range = (from: string, to: string) => inclusiveRange(from, to)!;

describe("links to evidence", () => {
  it("carries the range inclusively, with only the filters given", () => {
    expect(activityHref({ range: range("2026-09-01", "2026-09-22") })).toBe(
      "/activity?from=2026-09-01&to=2026-09-22",
    );
    expect(activityHref({ type: "income", range: range("2026-08-01", "2026-08-31") })).toBe(
      "/activity?type=income&from=2026-08-01&to=2026-08-31",
    );
    expect(
      activityHref({ accountId: "a1", categoryId: "c1", range: range("2026-08-01", "2026-09-20") }),
    ).toBe("/activity?account=a1&category=c1&from=2026-08-01&to=2026-09-20");
  });

  it("opens the current month at the bare Cash flow path", () => {
    expect(cashFlowHref(yearMonth(2026, 9), yearMonth(2026, 9))).toBe("/cash-flow");
    expect(cashFlowHref(yearMonth(2026, 8), yearMonth(2026, 9))).toBe("/cash-flow?month=2026-08");
  });

  it("recognises only ranges shaped like a Cash flow period", () => {
    // Month to date, the same days of a month, a whole month.
    expect(cashFlowMonthOf(range("2026-09-01", "2026-09-22"))).toBe("2026-09");
    expect(cashFlowMonthOf(range("2026-08-01", "2026-08-22"))).toBe("2026-08");
    expect(cashFlowMonthOf(range("2026-08-01", "2026-08-31"))).toBe("2026-08");
    // Not starting on the 1st, or crossing into another month.
    expect(cashFlowMonthOf(range("2026-09-02", "2026-09-22"))).toBeNull();
    expect(cashFlowMonthOf(range("2026-08-01", "2026-09-01"))).toBeNull();
    expect(cashFlowMonthOf(range("2026-08-01", "2026-09-20"))).toBeNull();
  });
});
