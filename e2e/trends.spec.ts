import { expect, test, type Page } from "@playwright/test";

import { monthLabel } from "@/components/format";
import { DEMO_TIME_ZONE } from "@/db/seed/demo-seed";
import { addMonths, yearMonthOf, type YearMonth } from "@/domain/calendar-date";
import { systemClock } from "@/server/clock";

/**
 * Trends (Stage 12): reached from Cash flow's local switch, complete months
 * only, the months added up once, each month's chart and exact figures in one
 * table, and the rows behind What changed. Built on the plain
 * demo ledger (a year of history); assertions compare the page with itself
 * rather than with fixed demo numbers.
 */

const today = () => systemClock(DEMO_TIME_ZONE).today();
const lastComplete = (): YearMonth => addMonths(yearMonthOf(today()), -1);

/** A signed taka amount in some text ("৳1,234", "−৳500"). */
function amountIn(text: string): number {
  const match = /(−?)\s*৳\s*([\d,]+)/.exec(text);
  if (!match) throw new Error(`No amount in: ${text}`);
  const value = Number(match[2]!.replace(/,/g, ""));
  return match[1] ? -value : value;
}

const record = (page: Page) => page.getByRole("region", { name: "Month by month" });
/** The months in the table, oldest first: each column heading is its month's link. */
const months = (page: Page) => record(page).getByRole("columnheader");

/** A figure row of the table ("Came in", "Went out", "Left over"), one amount per month. */
async function figures(page: Page, term: string): Promise<number[]> {
  const row = record(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: term, exact: true }) });
  return (await row.getByRole("cell").allInnerTexts()).map(amountIn);
}

/** A figure in the totals card ("Came in", "Went out", "Left over"). */
async function total(page: Page, term: string): Promise<number> {
  const text = await page
    .getByRole("region", { name: /months$/ })
    .locator("dl > div")
    .filter({ has: page.getByRole("term").filter({ hasText: new RegExp(`^${term}$`) }) })
    .getByRole("definition")
    .first()
    .innerText();
  return amountIn(text);
}

test("Trends sits behind Cash flow's local switch, and Cash flow stays current", async ({
  page,
}) => {
  await page.goto("/cash-flow");
  await page
    .getByRole("navigation", { name: "Cash flow" })
    .getByRole("link", { name: "Trends" })
    .click();
  await expect(page).toHaveURL(/\/trends$/);
  await expect(page.getByRole("heading", { level: 1, name: "Trends" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Cash flow" }),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    page.getByRole("navigation", { name: "Cash flow" }).getByRole("link", { name: "Trends" }),
  ).toHaveAttribute("aria-current", "page");

  // And back: the current month is Cash flow's.
  await page.getByRole("link", { name: /so far is on Cash flow/ }).click();
  await expect(page).toHaveURL(/\/cash-flow$/);
});

test("shows six complete months by default, oldest first, never the current month", async ({
  page,
}) => {
  await page.goto("/trends");
  await expect(months(page)).toHaveCount(6);
  await expect(months(page).last().getByRole("link")).toHaveAccessibleName(
    monthLabel(lastComplete()),
  );
  await expect(months(page).first().getByRole("link")).toHaveAccessibleName(
    monthLabel(addMonths(lastComplete(), -5)),
  );
  await expect(
    record(page).getByRole("link", { name: monthLabel(yearMonthOf(today())) }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "6 months" })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("every month and the whole window add up: came in − went out = left over", async ({
  page,
}) => {
  await page.goto("/trends");
  const [income, spending, leftOver] = await Promise.all([
    figures(page, "Came in"),
    figures(page, "Went out"),
    figures(page, "Left over"),
  ]);
  expect(income).toHaveLength(6);
  income.forEach((inc, i) => expect(leftOver[i]).toBe(inc - spending[i]!));

  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  expect(await total(page, "Came in")).toBe(sum(income));
  expect(await total(page, "Went out")).toBe(sum(spending));
  expect(await total(page, "Left over")).toBe(sum(leftOver));
});

test("switches to twelve months and back, each with its own URL", async ({ page }) => {
  await page.goto("/trends");
  await page.getByRole("link", { name: "12 months" }).click();
  await expect(page).toHaveURL(/\/trends\?range=12$/);
  await expect(months(page)).toHaveCount(12);
  await expect(page.getByRole("link", { name: "12 months" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Twelve months" })).toBeVisible();

  await page.getByRole("link", { name: "6 months" }).click();
  await expect(page).toHaveURL(/\/trends$/);
  await expect(months(page)).toHaveCount(6);
});

test("each month opens its own Cash flow page", async ({ page }) => {
  await page.goto("/trends");
  const month = addMonths(lastComplete(), -2);
  await record(page)
    .getByRole("link", { name: monthLabel(month) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/cash-flow\\?month=${month}$`));
  await expect(page.getByText("Full month")).toBeVisible();
});

test("What changed opens the rows behind each half's figure", async ({ page }) => {
  await page.goto("/trends");
  const panel = page.getByRole("region", { name: "What changed" });
  const drivers = panel.getByRole("list", { name: /Categories that were (higher|lower)/ }).first();
  const recent = drivers.getByRole("listitem").first().getByRole("link").nth(1);
  const figure = amountIn(await recent.innerText());
  await recent.click();
  await expect(page).toHaveURL(/\/activity\?category=.+&from=\d{4}-\d{2}-01&to=\d{4}-\d{2}-\d{2}$/);
  // The recent half ends with last month.
  const to = new URL(page.url()).searchParams.get("to")!;
  expect(to.slice(0, 7)).toBe(lastComplete());
  expect(amountIn(await page.getByText(/^Spent/).innerText())).toBe(figure);
});

for (const width of [390, 820, 1280]) {
  test(`fits ${width}px: the months ${width < 768 ? "as rows" : "as the chart and its table"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/trends");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
    if (width < 768) {
      await expect(record(page).getByRole("table")).toBeHidden();
      await expect(
        record(page).getByRole("list", { name: "Months" }).getByRole("listitem"),
      ).toHaveCount(6);
    } else {
      await expect(record(page).getByRole("table")).toBeVisible();
      await expect(record(page).getByRole("list", { name: "Months" })).toBeHidden();
    }
  });
}
