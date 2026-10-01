import { expect, test, type Locator, type Page } from "@playwright/test";

import { choose, dateEntry, describeEntry } from "./quick-add-steps";

/**
 * Roadmap flow 1: Quick Add an expense → the account balance and the list
 * update; change its type → balances recompute. Nothing is stubbed: the app
 * reads and writes its real SQLite ledger. Then Quick Add itself: what it
 * previews, how its lists are used by keyboard, transfers, dates and Enter.
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
  return page.getByRole("dialog");
};

/** The preview's figures for one account ("Cash ৳2,980 › ৳2,530"), as numbers. */
async function previewOf(dialog: Locator, account: string): Promise<number[]> {
  const line = dialog
    .locator("p")
    .filter({ hasText: "after this," })
    .filter({ has: dialog.page().getByText(account, { exact: true }) });
  const text = await line.innerText();
  // Signed: the date-relative demo Cash can be overdrawn by earlier specs.
  return [...text.matchAll(/(−?)\s*৳\s*([\d,]+(?:\.\d+)?)/g)].map(
    (m) => (m[1] ? -1 : 1) * Number(m[2]!.replace(/,/g, "")),
  );
}

test("Quick Add records an expense, then changing its type recomputes balances", async ({
  page,
}) => {
  const before = await balanceOf(page, "Cash");

  const dialog = await openQuickAdd(page);
  await dialog.getByLabel("Amount in taka").fill("450");
  await dialog.getByRole("radio", { name: "Expense" }).click();
  await choose(dialog, "Category", "Food & Dining");
  await choose(dialog, "Paid from", "Cash");
  // Before saving, it shows what the expense will do to Cash.
  expect(await previewOf(dialog, "Cash")).toEqual([before, before - 450]);
  await describeEntry(dialog, "Lunch at Star Kabab");
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
  const dialog = await openQuickAdd(page);
  // Nothing is previewed without an amount.
  await expect(dialog.getByText("after this,")).toHaveCount(0);
  await dialog.getByLabel("Amount in taka").fill("0");
  await dialog.getByRole("button", { name: /Save expense/ }).click();
  await expect(dialog.getByText("Enter an amount above zero.")).toBeVisible();
  await expect(dialog.getByLabel("Amount in taka")).toHaveAttribute("aria-invalid", "true");
});

test("the category list: recent first, searched, chosen and left by keyboard alone", async ({
  page,
}) => {
  const dialog = await openQuickAdd(page);
  await dialog.getByLabel("Amount in taka").fill("120");
  const row = dialog.getByRole("button", { name: /^Category/ });
  await row.click();

  const search = dialog.getByRole("combobox", { name: "Search expense categories" });
  await expect(search).toBeFocused();
  const list = dialog.getByRole("listbox");
  await expect(list.getByRole("group", { name: "Recent" })).toBeVisible();
  // Only expense categories, and nothing that manages them.
  await expect(list.getByRole("option", { name: "Salary" })).toHaveCount(0);
  await expect(dialog.getByRole("link")).toHaveCount(0);

  // ↑ ↓ Home End move the announced highlight; focus never leaves the search field.
  const options = list.getByRole("option");
  const count = await options.count();
  await search.press("End");
  await expect(options.nth(count - 1)).toHaveAttribute("aria-selected", "true");
  await expect(search).toHaveAttribute(
    "aria-activedescendant",
    (await options.nth(count - 1).getAttribute("id"))!,
  );
  await search.press("Home");
  await expect(options.first()).toHaveAttribute("aria-selected", "true");
  await search.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(search).toBeFocused();

  // Searching narrows the list; Enter chooses and returns to the row, without saving.
  await search.fill("zzz");
  await expect(dialog.getByText("No category matches “zzz”.")).toBeVisible();
  await search.fill("groc");
  await expect(options).toHaveCount(1);
  await search.press("Enter");
  await expect(list).toBeHidden();
  await expect(row).toBeFocused();
  await expect(row).toHaveAccessibleName("Category Groceries");
  await expect(page.getByRole("status")).toHaveCount(0);

  // Escape in a list steps back to the form (focus on its row); Escape there closes Quick Add.
  await choose(dialog, "Paid from", "bKash");
  const account = dialog.getByRole("button", { name: /^Paid from/ });
  await account.click();
  await expect(dialog.getByRole("option", { name: "bKash" })).toHaveAttribute(
    "aria-describedby",
    /chosen/,
  );
  await dialog.getByRole("combobox", { name: "Search accounts" }).fill("cash");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(account).toBeFocused();
  await expect(account).toHaveAccessibleName("Paid from bKash");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("a transfer previews both sides, swaps, takes its fee from From, and names a card payment", async ({
  page,
}) => {
  const dialog = await openQuickAdd(page);
  await dialog.getByRole("radio", { name: "Transfer" }).click();
  await dialog.getByLabel("Amount in taka").fill("5,000");
  await choose(dialog, "From", "Bank");
  await choose(dialog, "To", "bKash");
  const [bankBefore, bankAfter] = await previewOf(dialog, "Bank");
  const [bkashBefore, bkashAfter] = await previewOf(dialog, "bKash");
  expect(bankAfter).toBe(bankBefore! - 5_000);
  expect(bkashAfter).toBe(bkashBefore! + 5_000);

  await dialog.getByRole("button", { name: "Swap From and To accounts" }).click();
  await expect(dialog.getByRole("button", { name: /^From/ })).toHaveAccessibleName("From bKash");
  await expect(dialog.getByRole("button", { name: /^To/ })).toHaveAccessibleName("To Bank");
  await dialog.getByRole("button", { name: "Swap From and To accounts" }).click();

  // The fee is its own expense on the From account: Bank pays 5,000 and 18.50.
  await dialog.getByRole("button", { name: "Add a fee" }).click();
  await expect(dialog.getByRole("button", { name: /^Fee category/ })).toContainText(
    "Fees & Charges",
  );
  await dialog.getByLabel("Fee", { exact: true }).fill("18.50");
  expect(await previewOf(dialog, "Bank")).toEqual([bankBefore, bankBefore! - 5_018.5]);
  expect(await previewOf(dialog, "bKash")).toEqual([bkashBefore, bkashAfter]);
  await dialog.getByRole("button", { name: "Remove the fee" }).click();
  expect(await previewOf(dialog, "Bank")).toEqual([bankBefore, bankAfter]);

  // Paying the card: named as such, and its balance read as what is owed.
  await choose(dialog, "To", "Visa card");
  await expect(dialog.getByRole("button", { name: /^To/ })).toContainText("Card payment");
  await expect(dialog.getByRole("button", { name: "Save card payment" })).toBeVisible();
  await expect(
    dialog.locator("p").filter({ hasText: "after this," }).filter({ hasText: "Visa card" }),
  ).toContainText("owed");
});

test("dates: Today and Yesterday in one click, anything earlier in the field, never the future", async ({
  page,
}) => {
  const dialog = await openQuickAdd(page);
  const today = dialog.getByRole("radio", { name: "Today" });
  await expect(today).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("radio", { name: "Yesterday" }).click();
  await expect(dialog.getByRole("radio", { name: "Yesterday" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(dialog.getByLabel("Earlier date")).toHaveCount(0);

  await dialog.getByLabel("Amount in taka").fill("75");
  await choose(dialog, "Paid from", "Cash");
  await dateEntry(dialog, "2999-01-01");
  await dialog.getByRole("button", { name: /Save expense/ }).click();
  await expect(dialog.getByText("Transactions cannot be dated in the future.")).toBeVisible();
  await expect(dialog.getByLabel("Earlier date")).toHaveAttribute("aria-invalid", "true");

  await dateEntry(dialog, "2001-01-01");
  await dialog.getByRole("button", { name: /Save expense/ }).click();
  await expect(dialog.getByText("The date is before the account was opened.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("Enter in the amount saves; Undo takes the entry back", async ({ page }) => {
  const dialog = await openQuickAdd(page);
  await dialog.getByLabel("Amount in taka").fill("33");
  await choose(dialog, "Paid from", "Cash");
  await dialog.getByLabel("Amount in taka").press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("status")).toContainText("Saved");
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Entry removed.");
});

for (const [width, height] of [
  [390, 844],
  [820, 1180],
  [1280, 900],
] as const) {
  test(`at ${width}px Quick Add fits without sideways scrolling, in every state`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    const dialog = await openQuickAdd(page);
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      const box = (await dialog.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
    };
    await dialog.getByLabel("Amount in taka").fill("1,84,500");
    await fits();
    await dialog.getByRole("radio", { name: "Earlier" }).click();
    await dialog.getByRole("button", { name: "Add description" }).click();
    await fits();
    await dialog.getByRole("radio", { name: "Transfer" }).click();
    await dialog.getByRole("button", { name: "Add a fee" }).click();
    await dialog.getByLabel("Fee", { exact: true }).fill("18.50");
    await fits();
    await dialog.getByRole("button", { name: /^From/ }).click();
    await fits();
  });
}
