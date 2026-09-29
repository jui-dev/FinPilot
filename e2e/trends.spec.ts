import { expect, test, type Page } from "@playwright/test";

import { monthLabel } from "@/components/format";
import { DEMO_TIME_ZONE } from "@/db/seed/demo-seed";
import { addMonths, yearMonthOf, type YearMonth } from "@/domain/calendar-date";
import { systemClock } from "@/server/clock";

/**
 * Trends (Stage 12): reached from Cash flow's local switch, complete months
 * only, the latest selected until another month is chosen, the exact record
 * behind the journey, and the rows behind What changed. Built on the plain
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

const journey = (page: Page) => page.getByRole("region", { name: "Came in and went out" });
const months = (page: Page) => journey(page).getByRole("radio");

/** Opens Trends and waits for the journey's months, which appear once the chart is measured. */
async function openTrends(page: Page, path = "/trends") {
  await page.goto(path);
  await expect(journey(page).getByRole("radiogroup")).toBeVisible();
}

/** The statement's Left over for the month it names. */
async function statement(page: Page): Promise<{ month: string; leftOver: number }> {
  const text = await journey(page).locator("[aria-live]").innerText();
  const match = /Left over · (\w+ \d{4})/.exec(text);
  if (!match) throw new Error(`No month in the statement: ${text}`);
  return { month: match[1]!, leftOver: amountIn(text.slice(match.index + match[0].length)) };
}

/** A month's Left over in the Month by month table. */
async function recordedLeftOver(page: Page, month: string): Promise<number> {
  const row = page
    .getByRole("region", { name: "Month by month" })
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader", { name: month }) });
  return amountIn(await row.getByRole("cell").nth(2).innerText());
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

test("shows six complete months by default, the latest selected, never the current month", async ({
  page,
}) => {
  await openTrends(page);
  await expect(months(page)).toHaveCount(6);
  const latest = monthLabel(lastComplete());
  await expect(months(page).last()).toHaveAccessibleName(latest);
  await expect(months(page).last()).toHaveAttribute("aria-checked", "true");
  await expect(
    journey(page).getByRole("radio", { name: monthLabel(yearMonthOf(today())) }),
  ).toHaveCount(0);
  expect((await statement(page)).month).toBe(latest);
  await expect(page.getByRole("link", { name: "6 months" })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("choosing a month by keyboard, click or pointer shows its exact figures", async ({ page }) => {
  await openTrends(page);
  const latest = monthLabel(lastComplete());
  const previous = monthLabel(addMonths(lastComplete(), -1));
  const first = monthLabel(addMonths(lastComplete(), -5));

  // Keyboard: the months are one radio group.
  await months(page).last().focus();
  await page.keyboard.press("ArrowLeft");
  await expect(journey(page).getByRole("radio", { name: previous })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(journey(page).getByRole("radio", { name: previous })).toBeFocused();
  let shown = await statement(page);
  expect(shown.month).toBe(previous);
  expect(shown.leftOver).toBe(await recordedLeftOver(page, previous));
  await page.keyboard.press("Home");
  expect((await statement(page)).month).toBe(first);
  await page.keyboard.press("End");
  expect((await statement(page)).month).toBe(latest);

  // Click (a tap on a phone).
  await journey(page).getByRole("radio", { name: first }).click();
  shown = await statement(page);
  expect(shown.month).toBe(first);
  expect(shown.leftOver).toBe(await recordedLeftOver(page, first));

  // Pointer: hovering a month shows it too.
  await journey(page).getByRole("radio", { name: previous }).hover();
  expect((await statement(page)).month).toBe(previous);
});

test("switches to twelve months and back, each with its own URL", async ({ page }) => {
  await openTrends(page);
  await page.getByRole("link", { name: "12 months" }).click();
  await expect(page).toHaveURL(/\/trends\?range=12$/);
  await expect(months(page)).toHaveCount(12);
  await expect(page.getByRole("link", { name: "12 months" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  expect((await statement(page)).month).toBe(monthLabel(lastComplete()));

  await page.getByRole("link", { name: "6 months" }).click();
  await expect(page).toHaveURL(/\/trends$/);
  await expect(months(page)).toHaveCount(6);
});

test("each month opens its own Cash flow page", async ({ page }) => {
  await openTrends(page);
  const month = addMonths(lastComplete(), -2);
  await page
    .getByRole("region", { name: "Month by month" })
    .getByRole("link", { name: monthLabel(month) })
    .click();
  await expect(page).toHaveURL(new RegExp(`/cash-flow\\?month=${month}$`));
  await expect(page.getByText("Full month")).toBeVisible();

  // The statement leads to the selected month's page as well.
  await openTrends(page);
  await journey(page).getByRole("link", { name: "Open on Cash flow" }).click();
  await expect(page).toHaveURL(new RegExp(`/cash-flow\\?month=${lastComplete()}$`));
});

test("What changed opens the rows behind each half's figure", async ({ page }) => {
  await openTrends(page);
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
  test(`fits ${width}px: the journey, then the exact record ${width < 768 ? "as rows" : "as a table"}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await openTrends(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
    await expect(journey(page).locator("svg[aria-hidden]").last()).toBeVisible();
    const record = page.getByRole("region", { name: "Month by month" });
    if (width < 768) {
      await expect(record.getByRole("table")).toBeHidden();
      await expect(record.getByRole("list", { name: "Months" }).getByRole("listitem")).toHaveCount(
        6,
      );
    } else {
      await expect(record.getByRole("table")).toBeVisible();
      await expect(record.getByRole("list", { name: "Months" })).toBeHidden();
    }
  });
}
