import { expect, test, type Page } from "@playwright/test";

/**
 * Cash flow (Stages 5a–5c): the current month to date and complete past
 * months, how spending changed against the comparison period, and the
 * transactions behind each category figure.
 * Assertions are relative (before vs after an entry), so they depend on no
 * particular demo numbers.
 */

/** A figure on the Cash flow page ("Came in", "Went out", "Left over"), in taka. */
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

/** Records a Food & Dining expense from Cash, dated today, through Quick Add. */
async function addCashExpense(page: Page, amount: string, description: string) {
  await addExpense(page, amount, description, "Food & Dining", "Cash");
}

/** Records an expense dated today through Quick Add. */
async function addExpense(
  page: Page,
  amount: string,
  description: string,
  category: string,
  account: string,
) {
  await page.goto("/activity");
  const add = page.getByRole("button", { name: /^Add/ }).first();
  await expect(async () => {
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in taka").fill(amount);
  await dialog.getByRole("radio", { name: "Expense" }).click();
  const categoryButton = dialog.getByRole("button", { name: category, exact: true });
  if (!(await categoryButton.isVisible())) {
    await dialog.getByRole("button", { name: /^\+\d+ more$/ }).click();
  }
  await categoryButton.click();
  await dialog.getByRole("button", { name: account, exact: true }).click();
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

/** Activity's "Spent" total for the rows shown, signed, in taka. */
async function activitySpent(page: Page): Promise<number> {
  return amountIn(await page.getByText(/^Spent/).innerText());
}

/** The inclusive range an Activity URL carries. */
function rangeOf(url: string): { from: string; to: string } {
  const params = new URL(url).searchParams;
  return { from: params.get("from") ?? "", to: params.get("to") ?? "" };
}

/** The "What changed" panel. */
const whatChanged = (page: Page) => page.getByRole("region", { name: "What changed" });

/** The change in spending the headline states, signed, in taka. */
async function spendingChange(page: Page): Promise<number> {
  await page.goto("/cash-flow");
  const text = await whatChanged(page)
    .getByText(/^Spending/)
    .innerText();
  if (/unchanged/.test(text)) return 0;
  const match = /৳\s*([\d,]+)\s*(higher|lower)/.exec(text);
  if (!match) throw new Error(`No change stated: ${text}`);
  const value = Number(match[1]!.replace(/,/g, ""));
  return match[2] === "lower" ? -value : value;
}

test("an expense shows up in this month's spending and what was left over", async ({ page }) => {
  const spending = await figure(page, "Went out");
  const leftOver = await figure(page, "Left over");
  await expect(page.getByText(/so far$/)).toBeVisible();

  await addCashExpense(page, "123", "Cash flow check");

  expect(await figure(page, "Went out")).toBe(spending + 123);
  expect(await figure(page, "Left over")).toBe(leftOver - 123);
  await expect(
    page.getByRole("list", { name: "Spending by category" }).getByText("Food & Dining"),
  ).toBeVisible();
});

test("moves to a complete past month and back", async ({ page }) => {
  await page.goto("/cash-flow");
  await expect(page.getByRole("link", { name: /^Next month/ })).toHaveCount(0);

  // The chevron keeps its 16px size: conflicting padding once squeezed it to 8px.
  const previous = page.getByRole("link", { name: /^Previous month/ });
  const chevron = await previous.locator("svg").boundingBox();
  expect(chevron?.width).toBeGreaterThanOrEqual(16);
  expect(chevron?.height).toBeGreaterThanOrEqual(16);

  await previous.click();
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

test("explains the change against the same days of the previous month", async ({ page }) => {
  const before = await spendingChange(page);
  await expect(whatChanged(page).getByText(/^vs \d+(–\d+)? [A-Z][a-z]{2}/)).toBeVisible();

  await addCashExpense(page, "600", "Month-over-month check");
  expect(await spendingChange(page)).toBe(before + 600);
});

test("a complete month compares with the whole previous month; the first has none", async ({
  page,
}) => {
  await page.goto("/cash-flow");
  await page.getByRole("link", { name: /^Previous month/ }).click();
  await expect(page.getByText("Full month")).toBeVisible();

  // Every complete month with an earlier one names it; walk back to the first.
  const previous = page.getByRole("link", { name: /^Previous month/ });
  const heading = page.locator("#cash-flow-period");
  for (let i = 0; i < 36 && (await previous.count()) > 0; i++) {
    await expect(whatChanged(page).getByText(/^vs [A-Z][a-z]+ \d{4}$/)).toBeVisible();
    const label = await heading.innerText();
    await previous.click();
    await expect(heading).not.toHaveText(label);
  }
  await expect(whatChanged(page).getByText("No earlier month to compare with")).toBeVisible();
});

test("a category's spending opens the transactions behind it", async ({ page }) => {
  await addCashExpense(page, "321", "Evidence of where it went");
  await page.goto("/cash-flow");
  const row = page
    .getByRole("list", { name: "Spending by category" })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: "Food & Dining", exact: true }) });
  const figure = amountIn(await row.innerText());

  await row.getByRole("link", { name: "Food & Dining", exact: true }).click();
  await expect(page).toHaveURL(
    /\/activity\?category=[^&]+&from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/,
  );
  expect(page.url()).not.toContain("month=");
  await expect(page.getByRole("link", { name: /Evidence of where it went/ })).toBeVisible();
  expect(await activitySpent(page)).toBe(figure);

  const period = page.getByLabel("Period");
  await expect(period).toHaveValue("range");
  await expect(period.locator("option:checked")).toHaveText(/^(1–)?\d+ [A-Z][a-z]{2} \d{4}$/);
});

test("both sides of a change open their own period's transactions", async ({ page }) => {
  await addExpense(page, "5000", "Evidence of a change", "Health", "Bank");
  await page.goto("/cash-flow");
  const row = whatChanged(page)
    .getByRole("list", { name: "Categories that were higher" })
    .getByRole("listitem")
    .filter({ hasText: "Health" });
  const [previous, current] = [
    row.getByRole("link", { name: /^Health, / }).first(),
    row.getByRole("link", { name: /^Health, / }).last(),
  ];
  const previousFigure = amountIn(await previous.innerText());
  const currentFigure = amountIn(await current.innerText());

  await current.click();
  await expect(page).toHaveURL(/\/activity\?category=/);
  const currentRange = rangeOf(page.url());
  expect(currentRange.from).toMatch(/-01$/);
  await expect(page.getByRole("link", { name: /Evidence of a change/ })).toBeVisible();
  expect(await activitySpent(page)).toBe(currentFigure);

  await page.goBack();
  await previous.click();
  await expect(page).toHaveURL(/\/activity\?category=/);
  const previousRange = rangeOf(page.url());
  // The comparison window: from the 1st of the previous month, ending before this period.
  expect(previousRange.from).toMatch(/-01$/);
  expect(previousRange.to < currentRange.from).toBe(true);
  await expect(page.getByText(/in this view/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Evidence of a change/ })).toHaveCount(0);
  expect(await activitySpent(page)).toBe(previousFigure);
});

test("Activity keeps a date range through a transaction, and a month replaces it", async ({
  page,
}) => {
  await addCashExpense(page, "222", "Evidence kept in range");
  await page.goto("/cash-flow");
  await page
    .getByRole("list", { name: "Spending by category" })
    .getByRole("link", { name: "Food & Dining", exact: true })
    .click();
  await expect(page).toHaveURL(/from=/);
  const { from, to } = rangeOf(page.url());

  await page
    .getByRole("link", { name: /Evidence kept in range/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}&tx=`));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`from=${from}&to=${to}$`));

  const month = from.slice(0, 7);
  await page.getByLabel("Period").selectOption(month);
  await expect(page).toHaveURL(new RegExp(`month=${month}$`));
  expect(page.url()).not.toContain("from=");
  await expect(page.getByLabel("Period")).toHaveValue(month);

  // Reload keeps whatever the URL says.
  await page.reload();
  await expect(page.getByLabel("Period")).toHaveValue(month);
});

test("an invalid date range falls back to the month, then to all time", async ({ page }) => {
  await page.goto("/activity");
  const month = await page.getByLabel("Period").locator("option").nth(1).getAttribute("value");

  await page.goto(`/activity?from=2026-02-30&to=2026-03-01&month=${month}`);
  await expect(page.getByLabel("Period")).toHaveValue(month!);

  await page.goto("/activity?from=2026-09-22&to=2026-09-01");
  await expect(page.getByLabel("Period")).toHaveValue("");
  await expect(page.getByText(/in this view/)).toHaveCount(0);

  await page.goto("/activity?from=2026-09-01");
  await expect(page.getByLabel("Period")).toHaveValue("");
});

/** Activity's "Income" total for the rows shown, in taka. */
async function activityIncome(page: Page): Promise<number> {
  return amountIn(await page.getByText(/^Income\s+৳/).innerText());
}

test("Spending and Income open the transactions behind them, and lead back", async ({ page }) => {
  await addCashExpense(page, "432", "Evidence of spending");
  const spending = await figure(page, "Went out");
  const income = await figure(page, "Came in");

  await page.getByRole("link", { name: /^Spending, / }).click();
  await expect(page).toHaveURL(/\/activity\?from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
  await expect(page.getByRole("link", { name: /Evidence of spending/ })).toBeVisible();
  expect(await activitySpent(page)).toBe(spending);
  await expect(page.getByText(/^Showing/)).toContainText(/\d+ [A-Z][a-z]{2} \d{4}/);

  // The range has a Cash flow period's shape: it opens that month again.
  await page.getByRole("link", { name: /^Open [A-Z][a-z]+ \d{4} in Cash flow$/ }).click();
  await expect(page).toHaveURL(/\/cash-flow$/);

  if (income > 0) {
    await page.getByRole("link", { name: /^Income, / }).click();
    await expect(page).toHaveURL(/\/activity\?type=income&from=/);
    expect(await activityIncome(page)).toBe(income);
  } else {
    await expect(page.getByRole("link", { name: /^Income, / })).toHaveCount(0);
  }
});

test("a complete month's Spending leads back to that month", async ({ page }) => {
  await page.goto("/cash-flow");
  await page.getByRole("link", { name: /^Previous month/ }).click();
  await expect(page.getByText("Full month")).toBeVisible();
  const month = new URL(page.url()).searchParams.get("month")!;
  const spending = await page
    .getByRole("link", { name: /^Spending, / })
    .innerText()
    .then(amountIn);

  await page.getByRole("link", { name: /^Spending, / }).click();
  await expect(page).toHaveURL(/\/activity\?from=/);
  expect(await activitySpent(page)).toBe(spending);
  await page.getByRole("link", { name: /in Cash flow$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/cash-flow\\?month=${month}$`));
  await expect(page.getByText("Full month")).toBeVisible();
});

test("smaller changes open, and each one leads to its transactions", async ({ page }) => {
  // A category nobody has used: ৳10 in it is a change, but never a material one.
  const name = `Small ${Date.now().toString(36)}`;
  await page.goto("/settings");
  const input = page.getByLabel("New expense category");
  await expect(async () => {
    await input.fill(name);
    await input.press("Enter");
    await expect(page.getByText(name, { exact: true })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await addExpense(page, "10", "Evidence of a smaller change", name, "Cash");

  await page.goto("/cash-flow");
  const smaller = whatChanged(page).getByText(/^\d+ smaller changes?$/);
  const list = whatChanged(page).getByRole("list", { name: "Smaller changes" });
  await expect(list).toBeHidden();
  await smaller.click();
  const row = list.getByRole("listitem").filter({ hasText: name });
  await expect(row).toBeVisible();
  expect(amountIn(await row.locator('[data-cell="change"]').innerText())).toBe(10);

  await row
    .getByRole("link", { name: new RegExp(`^${name}, `) })
    .last()
    .click();
  await expect(page).toHaveURL(/\/activity\?category=/);
  await expect(page.getByRole("link", { name: /Evidence of a smaller change/ })).toBeVisible();
  expect(await activitySpent(page)).toBe(10);
});
