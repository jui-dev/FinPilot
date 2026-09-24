import { expect, test, type Page } from "@playwright/test";

/**
 * Cash flow (Stage 5a): the current month to date and complete past months.
 * Assertions are relative (before vs after an entry), so they depend on no
 * particular demo numbers.
 */

/** A figure on the Cash flow page ("Income", "Spending", "Left over"), in taka. */
async function figure(page: Page, term: string): Promise<number> {
  await page.goto("/cash-flow");
  const text = await page
    .locator("dl > div")
    .filter({ has: page.getByRole("term").filter({ hasText: new RegExp(`^${term}$`) }) })
    .getByRole("definition")
    .first()
    .innerText();
  const match = /(−?)\s*৳\s*([\d,]+)/.exec(text);
  if (!match) throw new Error(`No amount shown for ${term}: ${text}`);
  const value = Number(match[2]!.replace(/,/g, ""));
  return match[1] ? -value : value;
}

test("an expense shows up in this month's spending and what was left over", async ({ page }) => {
  const spending = await figure(page, "Spending");
  const leftOver = await figure(page, "Left over");
  await expect(page.getByText(/so far$/)).toBeVisible();

  await page.goto("/activity");
  const add = page.getByRole("button", { name: /^Add/ }).first();
  await expect(async () => {
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in taka").fill("123");
  await dialog.getByRole("radio", { name: "Expense" }).click();
  await dialog.getByRole("button", { name: "Food & Dining" }).click();
  await dialog.getByRole("button", { name: "Cash", exact: true }).click();
  await dialog.getByLabel("Description").fill("Cash flow check");
  await dialog.getByRole("button", { name: /Save expense/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  expect(await figure(page, "Spending")).toBe(spending + 123);
  expect(await figure(page, "Left over")).toBe(leftOver - 123);
  await expect(
    page.getByRole("list", { name: "Spending by category" }).getByText("Food & Dining"),
  ).toBeVisible();
});

test("moves to a complete past month and back", async ({ page }) => {
  await page.goto("/cash-flow");
  await expect(page.getByRole("link", { name: /^Next month/ })).toHaveCount(0);

  await page.getByRole("link", { name: /^Previous month/ }).click();
  await expect(page).toHaveURL(/\/cash-flow\?month=\d{4}-\d{2}$/);
  await expect(page.getByText("Full month")).toBeVisible();

  await page.getByRole("link", { name: /^Next month/ }).click();
  await expect(page).toHaveURL(/\/cash-flow$/);
  await expect(page.getByText(/so far$/)).toBeVisible();
});

test("a month that cannot be selected shows the current month", async ({ page }) => {
  await page.goto("/cash-flow?month=2999-01");
  await expect(page.getByText(/so far$/)).toBeVisible();
});
