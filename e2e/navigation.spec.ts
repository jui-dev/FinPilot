import { expect, test, type Page } from "@playwright/test";

/**
 * The navigation: every page is reachable from the main navigation, through a
 * section's menu on desktop and the Menu sheet on phones, and inside a section
 * its row of pages sits under the header.
 */

const desktopNav = (page: Page) => page.getByRole("navigation", { name: "Main" }).first();
const phoneBar = (page: Page) => page.getByRole("navigation", { name: "Main" }).last();

test("a section's menu lists its pages with what each answers, and leads to them", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/");
  const toggle = desktopNav(page).getByRole("button", { name: "Insights pages" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const menu = page.locator(`[id="${await toggle.getAttribute("aria-controls")}"]`);
  await expect(menu.getByRole("link")).toHaveText([/^Cash flow/, /^Trends/, /^Calendar/]);
  await expect(menu.getByText("When money moved, day by day")).toBeVisible();

  // Escape closes it and returns focus to the chevron.
  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toBeFocused();

  // A click elsewhere closes it too.
  await toggle.click();
  await page.mouse.click(8, 700);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");

  await toggle.click();
  await desktopNav(page)
    .getByRole("link", { name: /^Trends/ })
    .click();
  await expect(page).toHaveURL(/\/trends$/);
  await expect(page.getByRole("heading", { level: 1, name: "Trends" })).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    desktopNav(page).getByRole("link", { name: "Insights", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  const row = page.getByRole("navigation", { name: "Insights" });
  await expect(row.getByRole("link")).toHaveText(["Cash flow", "Trends", "Calendar"]);
  await expect(row.getByRole("link", { name: "Trends" })).toHaveAttribute("aria-current", "page");
});

test("a section's label leads to its first page, and one-page sections show no row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.goto("/");
  await desktopNav(page).getByRole("link", { name: "Transactions", exact: true }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(page.getByRole("navigation", { name: "Transactions" })).toBeVisible();

  await desktopNav(page).getByRole("link", { name: "Accounts", exact: true }).click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(page.getByRole("navigation", { name: "Accounts" })).toHaveCount(0);
});

test("on a phone the Menu sheet reaches every page, and Menu is current where no tab is", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const menuTab = phoneBar(page).getByRole("button", { name: "Menu" });
  await menuTab.click();

  const sheet = page.getByRole("dialog", { name: "Menu" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("link")).toHaveCount(11);
  await sheet.getByRole("link", { name: /^Calendar/ }).click();

  await expect(page).toHaveURL(/\/calendar$/);
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  // No tab covers Insights: none of the section tabs is current.
  for (const name of ["Overview", "Transactions", "Plan"]) {
    await expect(phoneBar(page).getByRole("link", { name })).not.toHaveAttribute("aria-current");
  }
  // Its row starts with the current page in view.
  const row = page.getByRole("navigation", { name: "Insights" });
  await expect(row.getByRole("link", { name: "Calendar" })).toBeInViewport();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
