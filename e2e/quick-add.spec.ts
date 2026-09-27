import { expect, test, type Page } from "@playwright/test";

/**
 * Roadmap flow 1: Quick Add an expense → the account balance and the list
 * update; change its type → balances recompute. Nothing is stubbed: the app
 * reads and writes its real SQLite ledger.
 */

/** The balance shown for an account on the Accounts page, in taka. */
async function balanceOf(page: Page, account: string): Promise<number> {
  await page.goto("/accounts");
  const row = page.getByRole("listitem").filter({ hasText: account }).first();
  const text = await row.innerText();
  // The row ends with the balance; ৳ and its digits are separate elements. The
  // sign counts: the date-relative demo Cash can be overdrawn by earlier specs.
  const amounts = [...text.matchAll(/(−?)\s*৳\s*([\d,]+)/g)].map(
    (m) => (m[1] ? -1 : 1) * Number(m[2]!.replace(/,/g, "")),
  );
  if (amounts.length === 0) throw new Error(`No balance shown for ${account}: ${text}`);
  return amounts.at(-1)!;
}

const openQuickAdd = async (page: Page) => {
  await page.goto("/activity");
  const add = page.getByRole("button", { name: /^Add/ }).first();
  // In dev the page is interactive a moment after it paints; retry until the
  // click is handled rather than guessing a delay.
  await expect(async () => {
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
};

test("Quick Add records an expense, then changing its type recomputes balances", async ({
  page,
}) => {
  const before = await balanceOf(page, "Cash");

  await openQuickAdd(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in taka").fill("450");
  await dialog.getByRole("radio", { name: "Expense" }).click();
  await dialog.getByRole("button", { name: "Food & Dining" }).click();
  await dialog.getByRole("button", { name: "Cash", exact: true }).click();
  await dialog.getByLabel("Description").fill("Lunch at Star Kabab");
  await dialog.getByRole("button", { name: /Save expense/ }).click();

  // The saved entry is confirmed with the effect on the account.
  await expect(page.getByRole("status")).toContainText("Cash");
  await expect(page.getByRole("dialog")).toBeHidden();

  // It appears in the list, and the balance has gone down by 450.
  const entry = page.getByRole("link", { name: /Lunch at Star Kabab/ }).first();
  await expect(entry).toBeVisible();
  expect(await balanceOf(page, "Cash")).toBe(before - 450);

  // Editing the same row into income turns the −450 into +450.
  await page.goto("/activity");
  await page
    .getByRole("link", { name: /Lunch at Star Kabab/ })
    .first()
    .click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await panel.getByRole("radio", { name: "Income" }).click();
  await panel.getByLabel("Category").selectOption({ label: "Other Income" });
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  expect(await balanceOf(page, "Cash")).toBe(before + 450);
});

test("a rejected entry explains itself on the field to fix", async ({ page }) => {
  await openQuickAdd(page);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in taka").fill("0");
  await dialog.getByRole("button", { name: /Save expense/ }).click();
  await expect(dialog.getByText("Enter an amount above zero.")).toBeVisible();
});
