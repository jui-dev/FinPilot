import { describe, expect, it } from "vitest";

import {
  ariaCurrent,
  currentSection,
  HOME_PATH,
  menuTabCurrent,
  navState,
  PHONE_TABS,
  SECTIONS,
  sectionHref,
  type NavSection,
} from "@/components/shell/navigation";

/**
 * The navigation's sections: each named for what it holds, every page listed
 * in one of them, and on the phone three tabs around the + and a Menu tab
 * that is current wherever they are not.
 */
describe("navigation", () => {
  const section = (label: string) => SECTIONS.find((s) => s.label === label)!;
  const current = (path: string, sections: readonly NavSection[]) =>
    sections.filter((s) => navState(path, s) !== null).map((s) => s.label);

  it("offers Overview, Transactions, Accounts, Insights and Plan, in that order", () => {
    expect(SECTIONS.map((s) => [s.label, s.pages.map((p) => p.href)])).toEqual([
      ["Overview", ["/"]],
      ["Transactions", ["/activity", "/categories"]],
      ["Accounts", ["/accounts"]],
      ["Insights", ["/cash-flow", "/trends", "/calendar"]],
      ["Plan", ["/available", "/commitments", "/set-aside"]],
    ]);
  });

  it("names no section after one of its pages unless it has only that page", () => {
    for (const s of SECTIONS) {
      if (s.pages.length > 1) expect(s.pages.map((p) => p.label)).not.toContain(s.label);
    }
  });

  it("gives every page a description, and lists each page once", () => {
    const pages = SECTIONS.flatMap((s) => s.pages);
    expect(new Set(pages.map((p) => p.href)).size).toBe(pages.length);
    for (const page of pages) expect(page.description.length).toBeGreaterThan(0);
  });

  it("leads each section's label to its first page, and the logo to the Overview", () => {
    expect(HOME_PATH).toBe("/");
    expect(SECTIONS.map(sectionHref)).toEqual([
      "/",
      "/activity",
      "/accounts",
      "/cash-flow",
      "/available",
    ]);
  });

  it("marks exactly one section on every page, and none on Settings", () => {
    for (const s of SECTIONS) {
      for (const page of s.pages) {
        expect(current(page.href, SECTIONS)).toEqual([s.label]);
        expect(currentSection(page.href)).toBe(s);
      }
    }
    expect(current("/settings", SECTIONS)).toEqual([]);
    expect(currentSection("/settings")).toBeUndefined();
  });

  it("marks the Overview current on exactly /", () => {
    expect(navState("/", section("Overview"))).toBe("page");
    for (const path of ["/activity", "/accounts", "/trends", "/settings"]) {
      expect(navState(path, section("Overview"))).toBeNull();
    }
  });

  it("marks a section as the page on its first page and as the area on the others", () => {
    const plan = section("Plan");
    expect(navState("/available", plan)).toBe("page");
    expect(navState("/commitments", plan)).toBe("area");
    expect(navState("/set-aside", plan)).toBe("area");
    expect(navState("/trends", section("Insights"))).toBe("area");
    expect(navState("/categories", section("Transactions"))).toBe("area");
    expect([ariaCurrent("page"), ariaCurrent("area"), ariaCurrent(null)]).toEqual([
      "page",
      "true",
      undefined,
    ]);
  });

  it("keeps three phone tabs, Overview · Transactions · Plan, beside the Menu tab", () => {
    expect(PHONE_TABS.map((s) => s.label)).toEqual(["Overview", "Transactions", "Plan"]);
  });

  it("makes the Menu tab current exactly where no other tab is", () => {
    for (const path of ["/accounts", "/cash-flow", "/trends", "/calendar", "/settings"]) {
      expect(current(path, PHONE_TABS)).toEqual([]);
      expect(menuTabCurrent(path)).toBe(true);
    }
    for (const path of ["/", "/activity", "/categories", "/available", "/set-aside"]) {
      expect(current(path, PHONE_TABS)).toHaveLength(1);
      expect(menuTabCurrent(path)).toBe(false);
    }
  });
});
