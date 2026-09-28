import { describe, expect, it } from "vitest";

import { ariaCurrent, navState, PRIMARY_NAV } from "@/components/shell/navigation";

/**
 * The global destinations, and the Available area (roadmap §8.3, P-2):
 * Available leads, and Commitments and Set aside are pages of its area.
 */
describe("navigation", () => {
  const available = PRIMARY_NAV.find((i) => i.href === "/available")!;

  it("offers Activity, Accounts, Cash flow and Available, in that order", () => {
    expect(PRIMARY_NAV.map((i) => [i.href, i.label])).toEqual([
      ["/activity", "Activity"],
      ["/accounts", "Accounts"],
      ["/cash-flow", "Cash flow"],
      ["/available", "Available"],
    ]);
  });

  it("marks Available as the page on /available and the area on Commitments and Set aside", () => {
    expect(navState("/available", available)).toBe("page");
    expect(navState("/commitments", available)).toBe("area");
    expect(navState("/set-aside", available)).toBe("area");
    expect(navState("/accounts", available)).toBeNull();
    expect([ariaCurrent("page"), ariaCurrent("area"), ariaCurrent(null)]).toEqual([
      "page",
      "true",
      undefined,
    ]);
  });

  it("marks no other destination on any page of the Available area", () => {
    const others = PRIMARY_NAV.filter((i) => i !== available);
    for (const path of ["/available", "/commitments", "/set-aside"]) {
      expect(others.map((i) => navState(path, i))).toEqual([null, null, null]);
    }
  });
});
