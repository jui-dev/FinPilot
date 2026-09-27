import { expect, test, type Page } from "@playwright/test";

/**
 * Activity as a workspace: filters that live in the URL, the scope and totals
 * they select, and a transaction opened and closed without losing the view.
 * Assertions are relative to what each test records, so they depend on no
 * particular demo numbers.
 */

/** Records an expense dated today from Cash through Quick Add. */
async function addExpense(page: Page, amount: string, description: string) {
  await page.goto("/activity");
  const add = page.getByRole("button", { name: /^Add/ }).first();
  await expect(async () => {
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in taka").fill(amount);
  await dialog.getByRole("radio", { name: "Expense" }).click();
  await dialog.getByRole("button", { name: "Food & Dining" }).click();
  await dialog.getByRole("button", { name: "Cash", exact: true }).click();
  await dialog.getByLabel("Description").fill(description);
  await dialog.getByRole("button", { name: /Save expense/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** A signed taka amount in some text ("৳1,234", "−৳500"). */
function amountIn(text: string): number {
  const match = /(−?)\s*৳\s*([\d,]+)/.exec(text);
  if (!match) throw new Error(`No amount in: ${text}`);
  const value = Number(match[2]!.replace(/,/g, ""));
  return match[1] ? -value : value;
}

const search = (page: Page) => page.getByRole("searchbox", { name: "Search transactions" });

test("search and filters live in the URL, and Clear resets them all", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByText(/in this view/)).toHaveCount(0);

  // "/" focuses the search field.
  await expect(async () => {
    await page.locator("body").press("/");
    await expect(search(page)).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await search(page).fill("bKash");
  await expect(page).toHaveURL(/\/activity\?q=bKash$/);
  await expect(page.getByText(/in this view/)).toBeVisible();

  await page.getByLabel("Type").selectOption("transfer");
  await expect(page).toHaveURL(/q=bKash&type=transfer$/);
  await page.getByLabel("Account").selectOption({ label: "bKash" });
  await expect(page).toHaveURL(/q=bKash&account=[^&]+&type=transfer$/);
  await expect(page.getByText(/^Showing/)).toContainText("bKash");

  // Reload keeps whatever the URL says.
  await page.reload();
  await expect(search(page)).toHaveValue("bKash");
  await expect(page.getByLabel("Type")).toHaveValue("transfer");

  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(search(page)).toHaveValue("");
  await expect(page.getByLabel("Account")).toHaveValue("");
  await expect(page.getByText(/^Showing all time/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
});

test("a transfer is signed from the filtered account's side", async ({ page }) => {
  await page.goto("/activity");
  await page.getByLabel("Account").selectOption({ label: "bKash" });
  await expect(page).toHaveURL(/account=/);

  const topUp = page.getByRole("link", { name: /^bKash top-up/ }).first();
  const cashOut = page.getByRole("link", { name: /^bKash cash-out/ }).first();
  expect(await topUp.innerText()).toMatch(/\+৳/);
  expect(amountIn(await topUp.innerText())).toBeGreaterThan(0);
  expect(await cashOut.innerText()).toMatch(/−৳/);
  // The fee travels with its transfer, shown apart from the amount.
  await expect(cashOut).toContainText(/\+৳\d+ fee/);
});

test("a view of refunds shows spending as negative", async ({ page }) => {
  await page.goto("/activity?type=refund");
  await expect(page.getByRole("link", { name: /Refund/ }).first()).toBeVisible();
  const spent = amountIn(await page.getByText(/^Spent/).innerText());
  expect(spent).toBeLessThan(0);
  expect(amountIn(await page.getByText(/^Income\s+৳/).innerText())).toBe(0);
});

test("a transaction opens and closes without losing the view, and is marked while open", async ({
  page,
}) => {
  await addExpense(page, "275", "Workspace round trip");
  await page.goto("/activity");
  const month = await page.getByLabel("Period").locator("option").nth(1).getAttribute("value");
  await page.getByLabel("Period").selectOption(month!);
  await search(page).fill("round trip");
  await expect(page).toHaveURL(new RegExp(`\\?q=round\\+trip&month=${month}$`));
  const filters = new URL(page.url()).search;

  // Keyboard: the row is one focusable link; Enter opens it.
  const row = page.getByRole("link", { name: /Workspace round trip/ });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${filters.replace(/[?+]/g, "\\$&")}&tx=`));
  // Behind the modal panel the page is hidden from the accessibility tree.
  await expect(
    page.getByRole("link", { name: /Workspace round trip/, includeHidden: true }),
  ).toHaveAttribute("aria-current", "true");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(new URL(page.url()).search).toBe(filters);
  await expect(row).not.toHaveAttribute("aria-current", "true");
  await expect(search(page)).toHaveValue("round trip");
});

test("a note is searchable and shown under its transaction", async ({ page }) => {
  const note = `Split with Rafi ${Date.now().toString(36)}`;
  await addExpense(page, "640", "Dinner with a note");
  await page.goto("/activity");
  await page
    .getByRole("link", { name: /Dinner with a note/ })
    .first()
    .click();
  const panel = page.getByRole("dialog");
  await panel.getByLabel("Note").fill(note);
  await panel.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await search(page).fill(note);
  await expect(page).toHaveURL(/q=/);
  const row = page.getByRole("link", { name: /Dinner with a note/ });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(note);
  await expect(page.getByText(/^1 entry in this view/)).toBeVisible();

  await search(page).fill(`${note} nothing like it`);
  await expect(page.getByText("Nothing matches these filters")).toBeVisible();
  await expect(page.getByText(/^0 entries in this view/)).toBeVisible();
});
