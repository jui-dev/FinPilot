import { expect, test, type Page } from "@playwright/test";

import { DEMO_TIME_ZONE } from "@/db/seed/demo-seed";
import { addDays, addMonths, yearMonthOf } from "@/domain/calendar-date";
import { systemClock } from "@/server/clock";

/**
 * Calendar: reached from Cash flow's local switch; the month's figures are
 * Cash flow's; a day is chosen through the URL (back and reload keep it);
 * future months show only what falls due; a day's figure opens its Activity
 * rows; phones get the agenda and a sheet. Built on the plain demo ledger;
 * assertions compare the page with Cash flow and Activity, not fixed numbers.
 */

const today = () => systemClock(DEMO_TIME_ZONE).today();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayMonth = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** A signed taka amount in some text ("৳1,234", "−৳500", "+৳95,000"). */
function amountIn(text: string): number {
  const match = /([−+]?)\s*৳\s*([\d,]+)/.exec(text);
  if (!match) throw new Error(`No amount in: ${text}`);
  const value = Number(match[2]!.replace(/,/g, ""));
  return match[1] === "−" ? -value : value;
}

/** The month's summary card ("September so far", or the month's name). */
const monthLine = (page: Page) => page.locator('section[aria-labelledby="calendar-summary"]');
/** A chosen day's drawer (a bottom sheet on phones). */
const drawer = (page: Page) => page.getByRole("dialog");

async function lineFigure(page: Page, term: string): Promise<number> {
  return amountIn(
    await monthLine(page)
      .locator("dl > div")
      .filter({ has: page.getByRole("term").filter({ hasText: new RegExp(`^${term}$`) }) })
      .getByRole("definition")
      .innerText(),
  );
}

test("Calendar sits in the Cash flow area, and its month is Cash flow's", async ({ page }) => {
  await page.goto("/cash-flow");
  await page
    .getByRole("navigation", { name: "Cash flow" })
    .getByRole("link", { name: "Calendar" })
    .click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(page.getByRole("heading", { level: 1, name: "Calendar" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Cash flow" }),
  ).toHaveAttribute("aria-current", "true");

  const cameIn = await lineFigure(page, "Came in");
  const wentOut = await lineFigure(page, "Went out");
  await monthLine(page).getByRole("link", { name: "Open in Cash flow" }).click();
  await expect(page).toHaveURL(/\/cash-flow$/);
  const fact = async (term: string) =>
    amountIn(
      await page
        .locator("dl > div")
        .filter({ has: page.getByRole("term").filter({ hasText: new RegExp(`^${term}$`) }) })
        .getByRole("definition")
        .first()
        .innerText(),
    );
  expect(await fact("Came in")).toBe(cameIn);
  expect(await fact("Went out")).toBe(wentOut);
});

test("no day opens on arrival; a clicked day opens its drawer, kept in the URL through reload and back", async ({
  page,
}) => {
  await page.goto("/calendar");
  const t = today();
  await expect(page.getByRole("table").locator("a[aria-current=date]")).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);

  const earlier = addDays(t, -1) >= `${yearMonthOf(t)}-01` ? addDays(t, -1) : t;
  await page
    .getByRole("table")
    .getByRole("link", { name: new RegExp(`, ${dayMonth(earlier)}\\b`) })
    .click();
  await expect(page).toHaveURL(new RegExp(`day=${earlier}`));
  await expect(drawer(page).getByRole("heading", { level: 3 })).toContainText(dayMonth(earlier));

  await page.reload();
  await expect(drawer(page).getByRole("heading", { level: 3 })).toContainText(dayMonth(earlier));
  await page.goBack();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(drawer(page)).toHaveCount(0);

  // Closing the drawer leaves the day out of the URL.
  await page
    .getByRole("table")
    .getByRole("link", { name: new RegExp(`, ${dayMonth(earlier)}\\b`) })
    .click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();
  await expect(page).not.toHaveURL(/day=/);
});

test("a day's Went out opens exactly its Activity rows", async ({ page }) => {
  // The 1st always holds the salary and spending in the demo.
  const first = `${yearMonthOf(today())}-01`;
  await page.goto(`/calendar?month=${yearMonthOf(today())}&day=${first}`);
  const figure = amountIn(
    await drawer(page)
      .locator("dl > div")
      .filter({ hasText: "Went out" })
      .getByRole("definition")
      .first()
      .innerText(),
  );
  await drawer(page).getByRole("link", { name: "This day in Activity" }).click();
  await expect(page).toHaveURL(new RegExp(`/activity\\?from=${first}&to=${first}$`));
  expect(amountIn(await page.getByText(/^Spent/).innerText())).toBe(figure);
});

test("an earlier month opens with no day chosen; the next month has no money", async ({ page }) => {
  const previous = addMonths(yearMonthOf(today()), -1);
  await page.goto(`/calendar?month=${previous}`);
  await expect(drawer(page)).toHaveCount(0);

  await page.goto("/calendar");
  await page.getByRole("link", { name: /^Next month/ }).click();
  await expect(page).toHaveURL(new RegExp(`month=${addMonths(yearMonthOf(today()), 1)}`));
  await expect(monthLine(page).getByText("Nothing has come in or gone out yet")).toBeVisible();
  await expect(page.getByRole("table")).not.toContainText("৳");
});

test("on a phone: the strip and the agenda, and a chosen day as a sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");
  await expect(page.getByRole("table")).toBeHidden();
  await expect(page.getByRole("navigation", { name: "Days of the month" })).toBeVisible();
  // Arriving never pops the sheet, even though today is the default day.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  const first = `${yearMonthOf(today())}-01`;
  const agenda = page.getByRole("region", { name: "The month, week by week" });
  await agenda
    .getByRole("link")
    .filter({ hasText: dayMonth(first) })
    .first()
    .click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole("heading", { name: new RegExp(dayMonth(first)) }).last(),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`day=${first}`));

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page).not.toHaveURL(/day=/);
});

for (const width of [390, 820, 1280]) {
  test(`fits ${width}px with no horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/calendar");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
    if (width >= 1024) await expect(page.getByRole("table")).toBeVisible();
    else await expect(page.getByRole("region", { name: "The month, week by week" })).toBeVisible();
  });
}
