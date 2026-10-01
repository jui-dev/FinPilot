import { describe, expect, it } from "vitest";

import {
  ariaCurrent,
  HOME_PATH,
  navState,
  PHONE_TABS,
  PRIMARY_NAV,
} from "@/components/shell/navigation";

/**
 * The global destinations (roadmap §8.5, P-3) and the Available area (§8.3,
 * P-2): the Overview leads; Available leads its area, where Commitments and
 * Set aside are its other pages; Cash flow has no phone tab.
 */
describe("navigation", () => {
  const available = PRIMARY_NAV.find((i) => i.href === "/available")!;
  const current = (path: string, items: readonly (typeof PRIMARY_NAV)[number][]) =>
    items.filter((i) => navState(path, i) !== null).map((i) => i.label);

  it("offers Overview, Activity, Accounts, Cash flow and Available on desktop, in that order", () => {
    expect(PRIMARY_NAV.map((i) => [i.href, i.label])).toEqual([
      ["/", "Overview"],
      ["/activity", "Activity"],
      ["/accounts", "Accounts"],
      ["/cash-flow", "Cash flow"],
      ["/available", "Available"],
    ]);
  });

  it("keeps four phone tabs, Overview · Activity · Accounts · Available, with no Cash flow tab", () => {
    expect(PHONE_TABS.map((i) => i.label)).toEqual([
      "Overview",
      "Activity",
      "Accounts",
      "Available",
    ]);
  });

  it("marks the Overview current on exactly /, where the logo also leads", () => {
    expect(HOME_PATH).toBe("/");
    expect(current("/", PRIMARY_NAV)).toEqual(["Overview"]);
    expect(current("/", PHONE_TABS)).toEqual(["Overview"]);
    for (const path of ["/activity", "/accounts", "/cash-flow", "/available", "/settings"]) {
      expect(navState(path, PRIMARY_NAV[0]!)).toBeNull();
    }
  });

  it("marks exactly one destination on each destination's page", () => {
    expect(current("/activity", PRIMARY_NAV)).toEqual(["Activity"]);
    expect(current("/accounts", PRIMARY_NAV)).toEqual(["Accounts"]);
    expect(current("/cash-flow", PRIMARY_NAV)).toEqual(["Cash flow"]);
    expect(current("/available", PRIMARY_NAV)).toEqual(["Available"]);
    expect(current("/settings", PRIMARY_NAV)).toEqual([]);
  });

  it("marks no phone tab on /cash-flow, which stays its own page", () => {
    expect(current("/cash-flow", PHONE_TABS)).toEqual([]);
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
    for (const path of ["/available", "/commitments", "/set-aside"]) {
      expect(current(path, PRIMARY_NAV)).toEqual(["Available"]);
      expect(current(path, PHONE_TABS)).toEqual(["Available"]);
    }
  });

  it("keeps Cash flow current on Trends, the other page of its area, with no phone tab", () => {
    const cashFlow = PRIMARY_NAV.find((i) => i.href === "/cash-flow")!;
    expect(navState("/cash-flow", cashFlow)).toBe("page");
    expect(navState("/trends", cashFlow)).toBe("area");
    expect(current("/trends", PRIMARY_NAV)).toEqual(["Cash flow"]);
    expect(current("/trends", PHONE_TABS)).toEqual([]);
  });

  it("keeps Activity current on Categories, the other page of its area, phone tab included", () => {
    const activity = PRIMARY_NAV.find((i) => i.href === "/activity")!;
    expect(navState("/activity", activity)).toBe("page");
    expect(navState("/categories", activity)).toBe("area");
    expect(current("/categories", PRIMARY_NAV)).toEqual(["Activity"]);
    expect(current("/categories", PHONE_TABS)).toEqual(["Activity"]);
  });

  it("keeps Cash flow current on Calendar too, with no phone tab", () => {
    expect(current("/calendar", PRIMARY_NAV)).toEqual(["Cash flow"]);
    expect(current("/calendar", PHONE_TABS)).toEqual([]);
  });
});
