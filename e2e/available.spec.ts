import { expect, test, type Page } from "@playwright/test";

/**
 * Stage 8: the Available area. Available is the global destination; its area
 * holds three pages — Available, Commitments and Set aside — behind a local
 * switch, and the destination stays current on all three.
 */

const AREA = ["/available", "/commitments", "/set-aside"] as const;
const PAGE_NAME = {
  "/available": "Available",
  "/commitments": "Commitments",
  "/set-aside": "Set aside",
};

/** The desktop header's navigation, or the phone tab bar (only one is visible at a time). */
const mainNav = (page: Page, width: number) => {
  const navs = page.getByRole("navigation", { name: "Main" });
  return width < 768 ? navs.last() : navs.first();
};

test("the Available destination lands on the Available page", async ({ page }) => {
  await page.goto("/activity");
  await mainNav(page, 1280).getByRole("link", { name: "Available" }).click();
  await expect(page).toHaveURL(/\/available$/);
  await expect(page.getByRole("heading", { level: 1, name: "Available" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Available" }).getByRole("link")).toHaveText([
    "Available",
    "Commitments",
    "Set aside",
  ]);
});

for (const width of [390, 1280]) {
  test(`Available is current across its whole area at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of AREA) {
      await page.goto(path);
      const nav = mainNav(page, width);
      await expect(nav.getByRole("link", { name: "Available" })).toHaveAttribute(
        "aria-current",
        path === "/available" ? "page" : "true",
      );
      for (const other of ["Activity", "Accounts", "Cash flow"]) {
        await expect(nav.getByRole("link", { name: other })).not.toHaveAttribute("aria-current");
      }
      const area = page.getByRole("navigation", { name: "Available" });
      for (const [href, name] of Object.entries(PAGE_NAME)) {
        const link = area.getByRole("link", { name });
        if (href === path) await expect(link).toHaveAttribute("aria-current", "page");
        else await expect(link).not.toHaveAttribute("aria-current");
      }
    }
  });
}

test("the phone tab bar keeps four destinations around the centred Add", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/available");
  const bar = mainNav(page, 390);
  const cells = bar.locator(":scope > *");
  await expect(cells).toHaveCount(5);
  await expect(cells.nth(2)).toHaveAttribute("aria-label", "Add a transaction");
  await expect(bar.getByRole("link")).toHaveText([
    "Activity",
    "Accounts",
    "Cash flow",
    "Available",
  ]);
});

for (const width of [390, 820, 1024, 1280, 1920]) {
  test(`the Available area fits ${width}px with the switch on one line`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of AREA) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path} at ${width}px`).toBe(0);
      const links = page.getByRole("navigation", { name: "Available" }).getByRole("link");
      const first = await links.first().boundingBox();
      const last = await links.last().boundingBox();
      expect(last!.y, `switch wraps on ${path} at ${width}px`).toBe(first!.y);
      await expect(links.last()).toBeInViewport();
    }
  });
}
