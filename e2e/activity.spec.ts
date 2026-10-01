import { expect, test, type Page } from "@playwright/test";
import { choose, describeEntry } from "./quick-add-steps";

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
  await choose(dialog, "Category", "Food & Dining");
  await choose(dialog, "Paid from", "Cash");
  await describeEntry(dialog, description);
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

/**
 * Waits until the filters respond: "/" focuses the search field only once the
 * filter bar has hydrated and its effects have run, so its selects' change
 * handlers are attached too. A select changed before then can be lost.
 */
async function filtersReady(page: Page) {
  await expect(async () => {
    await page.locator("body").press("/");
    await expect(search(page)).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test("search and filters live in the URL, and Clear resets them all", async ({ page }) => {
  await page.goto("/activity");
  await expect(page.getByText(/in this view/)).toHaveCount(0);

  // "/" focuses the search field.
  await filtersReady(page);

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

test("a filter chosen while a search is still settling keeps both", async ({ page }) => {
  await page.goto("/activity");
  await filtersReady(page);

  // No wait between the two: the Type change lands before the search's
  // debounce fires, so the two URL updates overlap.
  await search(page).fill("bKash");
  await page.getByLabel("Type").selectOption("transfer");

  await expect(page).toHaveURL(/\/activity\?q=bKash&type=transfer$/);
  await expect(search(page)).toHaveValue("bKash");
  await expect(page.getByLabel("Type")).toHaveValue("transfer");
  await expect(page.getByText(/in this view/)).toBeVisible();
  await expect(page.getByRole("link", { name: /^bKash (top-up|cash-out)/ }).first()).toBeVisible();
});

test("typing on while an earlier search lands keeps every character", async ({ page }) => {
  await page.goto("/activity");
  await filtersReady(page);

  // The navigation for the first debounced search ("round") is held until more
  // has been typed, then answered at once: it lands after the newer input, as
  // on a slow connection. Its response is fetched in the meantime.
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  let started!: () => void;
  const inFlight = new Promise<void>((resolve) => (started = resolve));
  await page.route(
    (url) => url.pathname === "/activity" && url.searchParams.get("q") === "round",
    async (route) => {
      started();
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    },
  );

  await search(page).pressSequentially("round");
  await inFlight;
  await search(page).pressSequentially(" trip");
  release();

  await expect(page).toHaveURL(/\/activity\?q=round\+trip$/);
  await expect(search(page)).toHaveValue("round trip");
});

test("Clear discards a search still being typed", async ({ page }) => {
  await page.goto("/activity?q=bKash");
  await filtersReady(page);

  await search(page).fill("bKash top");
  await page.getByRole("button", { name: "Clear" }).click();

  await expect(page).toHaveURL(/\/activity$/);
  await expect(search(page)).toHaveValue("");
  await expect(page.getByRole("button", { name: "Clear" })).toHaveCount(0);
  // A later filter builds on the cleared search, not on the abandoned text.
  await page.getByLabel("Type").selectOption("transfer");
  await expect(page).toHaveURL(/\/activity\?type=transfer$/);
  await expect(search(page)).toHaveValue("");
});

test("the search field follows the URL when it changes from elsewhere", async ({ page }) => {
  await page.goto("/activity?q=bKash");
  await filtersReady(page);
  await expect(search(page)).toHaveValue("bKash");

  // A link into Activity without a search, then Back and Forward.
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Activity", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(search(page)).toHaveValue("");

  await page.goBack();
  await expect(page).toHaveURL(/\/activity\?q=bKash$/);
  await expect(search(page)).toHaveValue("bKash");

  await page.goForward();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(search(page)).toHaveValue("");
});

test("a transfer is signed from the filtered account's side", async ({ page }) => {
  await page.goto("/activity");
  await filtersReady(page);
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
  // Unique per run, so the row below is this run's even when others exist.
  const description = `Workspace round trip ${Date.now().toString(36)}`;
  await addExpense(page, "275", description);
  await page.goto("/activity");
  await filtersReady(page);
  const month = await page.getByLabel("Period").locator("option").nth(1).getAttribute("value");
  await page.getByLabel("Period").selectOption(month!);
  await search(page).fill("round trip");
  await expect(page).toHaveURL(new RegExp(`\\?q=round\\+trip&month=${month}$`));
  const filters = new URL(page.url()).search;

  // Keyboard: the row is one focusable link; Enter opens it.
  const row = page.getByRole("link", { name: new RegExp(description) });
  await row.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${filters.replace(/[?+]/g, "\\$&")}&tx=`));
  // Behind the modal panel the page is hidden from the accessibility tree.
  await expect(
    page.getByRole("link", { name: new RegExp(description), includeHidden: true }),
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

test("the list pages through its view; a row opens over its page, and a filter starts again at page 1", async ({
  page,
}) => {
  await page.goto("/activity");
  const pages = page.getByRole("navigation", { name: "Pages" });
  await expect(pages).toContainText(/1–25 of \d+ entries/);

  await pages.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/\/activity\?page=2$/);
  await expect(pages).toContainText(/26–50 of \d+ entries/);
  await expect(pages.getByRole("link", { name: "Page 2" })).toHaveAttribute("aria-current", "page");

  // A row opens over the page it is on, and closing it stays there.
  await page.locator('section[aria-labelledby="activity-scope"] ul li a').first().click();
  await expect(page).toHaveURL(/\/activity\?page=2&tx=/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/activity\?page=2$/);

  // A filter changes the view, so the list starts again at its first page.
  await filtersReady(page);
  await page.getByLabel("Type").selectOption("expense");
  await expect(page).toHaveURL(/\/activity\?type=expense$/);
  await expect(pages).toContainText(/^1–/);
});
