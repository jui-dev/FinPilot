import { expect, test, type Page } from "@playwright/test";

import { resetDemoInPlace } from "./demo-ledger";

/**
 * Stage 10: the Overview at "/" — Available, Attention, This month and Where
 * you stand. Specs share one database, and earlier ones leave shortfalls,
 * commitments and adjustments behind, so this spec starts from the fresh
 * demo ledger — cleared and reseeded in place, as db:reset does while the
 * server holds the file — and restores it afterwards for the specs that
 * follow. It is the plain ledger, without the demo situations (as in global
 * setup): no commitments, set-aside money or verified balances, so the only
 * thing Attention can raise is a month's spending increase. Every other
 * situation is built here through the UI.
 */

test.describe.configure({ mode: "serial" });
test.beforeAll(resetDemoInPlace);
test.afterAll(resetDemoInPlace);

const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Today in the owner's time zone, as YYYY-MM-DD, shifted by `days`. */
function dhakaDate(days = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function openDialog(page: Page, open: () => Promise<void>) {
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Attention on the Overview: the preview, named by its heading. */
const list = (page: Page) => page.getByRole("region", { name: "Attention" });
const rows = (page: Page) => list(page).getByRole("listitem");
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });
const viewAll = (page: Page) =>
  list(page).getByRole("button", { name: /^(View all \d+|Open Attention)$/ });

/** The complete list, in the View all sheet: where Hide lives. */
const sheet = (page: Page) => page.getByRole("dialog", { name: "Attention" });
const sheetRows = (page: Page) => sheet(page).getByRole("listitem");
const sheetRow = (page: Page, text: string) => sheetRows(page).filter({ hasText: text });
const sheetHeading = (page: Page) => sheet(page).getByRole("heading", { level: 3 });
const openSheet = (page: Page) => openDialog(page, () => viewAll(page).click());

/** The desktop header's navigation, or the phone tab bar (only one is visible at a time). */
const mainNav = (page: Page, width: number) => {
  const navs = page.getByRole("navigation", { name: "Main" });
  return width < 768 ? navs.last() : navs.first();
};

/** P-3: five destinations on desktop; four phone tabs around the +, without Cash flow. */
const DESKTOP = ["Overview", "Activity", "Accounts", "Cash flow", "Available"];
const PHONE = ["Overview", "Activity", "Accounts", "Available"];
const destinations = (width: number) => (width < 768 ? PHONE : DESKTOP);

/** Exactly `current` is marked as the current page among the destinations shown. */
async function expectCurrent(page: Page, width: number, current: string | null) {
  const nav = mainNav(page, width);
  await expect(nav.getByRole("link")).toHaveText(destinations(width));
  for (const name of destinations(width)) {
    const link = nav.getByRole("link", { name, exact: true });
    if (name === current) await expect(link).toHaveAttribute("aria-current", "page");
    else await expect(link).not.toHaveAttribute("aria-current");
  }
}

/** Hides every signal that can be hidden, one at a time, as a person would. */
async function hideEverythingHideable(page: Page) {
  await page.goto("/");
  if ((await viewAll(page).count()) === 0) return;
  await openSheet(page);
  const hide = sheet(page).getByRole("button", { name: /^Hide/ });
  while ((await hide.count()) > 0) {
    const before = await sheetRows(page).count();
    await expect(async () => {
      await hide.first().click();
      await expect(sheetRows(page)).toHaveCount(before - 1, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
}

async function addCommitment(page: Page, name: string, amount: string, inDays: number) {
  await page.goto("/commitments");
  await openDialog(page, () =>
    page.getByRole("button", { name: "New commitment" }).first().click(),
  );
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Expected amount").fill(amount);
  await dialog.getByLabel("First due date").fill(dhakaDate(inDays));
  await dialog.getByLabel("Category").selectOption({ label: "Utilities" });
  await dialog.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

let wallet = "";
let bill = "";

test("the logo leads to the Overview: five zones in order, and Overview is current", async ({
  page,
}) => {
  await page.goto("/activity");
  await page.getByRole("link", { name: "FinPilot", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page).toHaveTitle(/^Overview · FinPilot$/);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Available now",
    "Month at a glance",
    "Attention",
    "This month",
    "Where you stand",
  ]);

  await expectCurrent(page, 1280, "Overview");
});

for (const width of [390, 1280]) {
  test(`P-3 navigation at ${width}px: each destination current on its page; none on a phone's Cash flow`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const pages: [string, string | null][] = [
      ["/", "Overview"],
      ["/activity", "Activity"],
      ["/accounts", "Accounts"],
      // Cash flow stays its own page: current on desktop, and with no phone tab, nothing is current there.
      ["/cash-flow", width < 768 ? null : "Cash flow"],
      ["/available", "Available"],
    ];
    for (const [path, current] of pages) {
      await page.goto(path);
      await expectCurrent(page, width, current);
    }

    // The Overview destination and the logo both lead home.
    await page.goto("/activity");
    await mainNav(page, width).getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/accounts");
    await page.getByRole("link", { name: "FinPilot", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await expectCurrent(page, width, "Overview");
  });
}

test("Available leads, with its ring, and opens the Available page", async ({ page }) => {
  await page.goto("/");
  const band = page.getByRole("region", { name: "Available now" });
  await expect(band).toContainText("Before new income");
  await expect(band).toContainText(/Free: ৳[\d,]+ of the ৳[\d,]+ on hand/);
  await expect(band.getByTestId("available-ring")).toBeVisible();
  await expect(band).toContainText(/Available\s*৳[\d,]+/);
  await expect(band).not.toContainText("%");
  await band.getByRole("link", { name: "See how it's worked out" }).click();
  await expect(page).toHaveURL(/\/available$/);
});

test("Month at a glance shows the month at a glance and opens the Calendar", async ({ page }) => {
  await page.goto("/");
  const month = page.getByRole("region", { name: "Month at a glance" });
  await expect(month.getByTestId("month-glance")).toBeVisible();
  await expect(month).toContainText(/Today is \w+day, \d{1,2} \w{3}\./);
  // This month owns Came in and Went out; no day shows an amount.
  await expect(month).not.toContainText(/Came in|Went out/);
  await expect(month.getByTestId("month-glance")).not.toContainText("৳");
  await month.getByRole("link", { name: "Open Calendar" }).click();
  await expect(page).toHaveURL(/\/calendar\?month=\d{4}-\d{2}$/);
});

test("a day in Month at a glance opens its evidence in a panel; Escape returns to the day", async ({
  page,
}) => {
  await page.goto("/");
  const month = page.getByRole("region", { name: "Month at a glance" });
  // By CSS, not role: while the panel is open, the page behind it is hidden from the
  // accessibility tree (a modal), and the day's selected state is still checked there.
  const today = page.locator('section[aria-labelledby="overview-glance"] a[aria-current="date"]');
  // Every day of the month is a link, named by its date.
  const [year, monthNumber] = dhakaDate().split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  await expect(month.locator('a[href^="/?day="]')).toHaveCount(daysInMonth);
  await expect(month.getByRole("link", { name: /^\w+day, \d{1,2} \w{3}/ })).toHaveCount(
    daysInMonth,
  );

  // The Overview's own default day never opens on arrival.
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // By keyboard: Enter on today opens its evidence, named by the URL.
  await today.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/\\?day=${dhakaDate()}$`));
  await expect(panel.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(today).toContainText("shown");

  // Escape closes it, leaves the day out of the URL, and focus returns to the day.
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  await expect(today).toBeFocused();

  // A day money moved on: its figures lead to that day's rows in Activity.
  const moved = month.getByRole("link", { name: /money in or out/ }).first();
  await moved.click();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Came in");
  await expect(panel).toContainText("Went out");
  await panel
    .getByRole("link", { name: /^(This day|Income) in Activity$/ })
    .first()
    .click();
  await expect(page).toHaveURL(
    /\/activity\?(type=income&)?from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/,
  );
});

test("on a phone, a day in Month at a glance opens as a bottom sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const month = page.getByRole("region", { name: "Month at a glance" });
  await month.locator('a[aria-current="date"]').click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  // Once it has slid in: across the width, resting on the bottom edge.
  await expect
    .poll(async () => {
      const box = (await sheet.boundingBox())!;
      return [Math.round(box.y + box.height), Math.round(box.width)];
    })
    .toEqual([844, 390]);
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
});

test("This month and Where you stand lead to the rows and pages behind them", async ({ page }) => {
  await page.goto("/");
  const month = page.getByRole("region", { name: "This month" });
  await expect(month).toContainText("so far");
  await expect(month).toContainText("Left over");
  await expect(month).not.toContainText("Savings rate");
  // Left over, and where it went: each figure leading to its rows.
  await expect(month.getByTestId("month-journey")).toBeVisible();
  await expect(
    month.getByRole("link", { name: /more categories: ৳|^[^,]+: ৳/ }).first(),
  ).toBeVisible();
  await month.getByRole("link", { name: /^Salary: ৳/ }).click();
  await expect(page).toHaveURL(/\/activity\?category=[^&]+&type=income&from=\d{4}-\d{2}-01&to=/);

  await page.goto("/");
  await page
    .getByRole("region", { name: "This month" })
    .getByRole("link", { name: /^Came in, / })
    .click();
  await expect(page).toHaveURL(/\/activity\?type=income&from=\d{4}-\d{2}-01&to=/);

  await page.goto("/");
  const stand = page.getByRole("region", { name: "Where you stand" });
  // Net worth first; then the statement, You own (its accounts) − You owe (its cards) = Net worth.
  // The demo's Visa owes.
  await expect(stand).toContainText(/^Where you stand.*Net worth\s*৳[\d,]+/);
  await expect(stand).toContainText(
    /You own\s*৳[\d,]+.*Savings.*−\s*You owe\s*৳[\d,]+\s*Visa card\s*৳[\d,]+\s*=\s*Net worth\s*৳[\d,]+/,
  );
  // Liquidity is Available's question.
  await expect(stand).not.toContainText("Available");
  await stand.getByRole("link", { name: "Your accounts" }).click();
  await expect(page).toHaveURL(/\/accounts$/);
});

test("with nothing left to raise, Attention is one compact strip", async ({ page }) => {
  // The fresh demo can raise only a month's spending increase, which can be hidden.
  await hideEverythingHideable(page);
  await expect(list(page)).toContainText("Nothing needs your attention");
  await expect(list(page).getByRole("link")).toHaveCount(0);
  await expect(page.getByText(/needs? a look$/)).toHaveCount(0);

  await page.reload();
  await expect(list(page)).toContainText("Nothing needs your attention");
});

test("an unexplained adjustment: its evidence, and Hide → empty → Undo", async ({ page }) => {
  wallet = unique("Wallet OV");
  await page.goto("/accounts");
  await openDialog(page, () =>
    page
      .getByRole("button", { name: /^New account/ })
      .first()
      .click(),
  );
  const create = page.getByRole("dialog");
  await create.getByLabel("Name").fill(wallet);
  await create.getByRole("radio", { name: "Cash" }).click();
  await create.getByLabel("Balance on that date").fill("5000");
  await create.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const account = page.getByRole("listitem").filter({ hasText: wallet }).first();
  await openDialog(page, () => account.getByRole("button", { name: /^Verify/ }).click());
  const verify = page.getByRole("dialog");
  await verify.getByLabel("How much is actually there?").fill("4650");
  await verify.getByRole("button", { name: "Verify balance" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/");
  // The preview is a glance: the tag, the account and the figure; why is in the sheet.
  const adjusted = row(page, wallet);
  await expect(adjusted).toContainText("Adjusted");
  await expect(adjusted).toContainText("৳350");
  await expect(adjusted).not.toContainText("found ৳350 less");
  await expect(page.getByText("1 thing needs a look")).toBeVisible();

  // Its evidence: the adjustment itself, in Activity, on that account and day.
  await adjusted.getByRole("link", { name: /^See the adjustment/ }).click();
  await expect(page).toHaveURL(
    /\/activity\?account=[^&]+&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/,
  );
  await expect(page.getByText("Balance adjustment").first()).toBeVisible();

  // Hide lives in the complete list: it leaves the sheet empty, focus on its
  // heading, and Undo brings the row back without closing the sheet.
  await page.goto("/");
  // Its one signal shows already, but can be hidden: the sheet is where Hide lives.
  await expect(viewAll(page)).toHaveText("Open Attention");
  await openSheet(page);
  const inSheet = sheetRow(page, `${wallet} had an unexplained difference`);
  await expect(async () => {
    await inSheet
      .getByRole("button", { name: `Hide ${wallet} had an unexplained difference` })
      .click();
    await expect(page.getByRole("status")).toContainText("Hidden.", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(sheet(page)).toContainText("Nothing needs your attention");
  await expect(sheetHeading(page)).toBeFocused();

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(inSheet).toBeVisible();
  await expect(sheet(page)).toBeVisible();
  // Closing returns focus to View all, which stays while its sheet is open.
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await expect(viewAll(page)).toBeFocused();
  await page.reload();
  await expect(adjusted).toBeVisible();
});

test("a payment due soon sits above the adjustment and can't be hidden", async ({ page }) => {
  bill = unique("OV Internet");
  await addCommitment(page, bill, "1500", 3);

  await page.goto("/");
  await expect(page.getByText("2 things need a look")).toBeVisible();
  const texts = await rows(page).allInnerTexts();
  expect(texts).toHaveLength(2);
  expect(texts[0]).toContain(bill);
  expect(texts[0]).toContain("In 3 days");
  expect(texts[1]).toContain(wallet);
  expect(texts[1]).toContain("Adjusted");

  // No Hide in the preview; in the complete list, only the adjustment has one.
  await expect(list(page).getByRole("button", { name: /^Hide/ })).toHaveCount(0);
  await openSheet(page);
  await expect(sheetRow(page, bill).getByRole("button", { name: /^Hide/ })).toHaveCount(0);
  await expect(sheet(page).getByRole("button", { name: /^Hide/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();

  await row(page, bill)
    .getByRole("link", { name: new RegExp(`^Open Commitments: ${bill}`) })
    .click();
  await expect(page).toHaveURL(/\/commitments$/);
});

test("the first 3 show; View all opens the complete list in a sheet", async ({ page }) => {
  await addCommitment(page, unique("OV Water"), "900", 4);
  await addCommitment(page, unique("OV Gas"), "700", 5);

  await page.goto("/");
  await expect(page.getByText("4 things need a look")).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  await expect(viewAll(page)).toHaveText("View all 4");
  await openSheet(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(sheetRows(page)).toHaveCount(4);
  await expect(sheetHeading(page)).toHaveText("4 things need a look");
  // Still in priority order: the adjustment comes after every payment due.
  expect((await sheetRows(page).allInnerTexts())[3]).toContain(
    `${wallet} had an unexplained difference`,
  );

  // Hide in the sheet: the next one moves up, focus goes to the sheet's heading.
  await expect(async () => {
    await sheetRow(page, `${wallet} had an unexplained difference`)
      .getByRole("button", { name: /^Hide/ })
      .click();
    await expect(sheetRows(page)).toHaveCount(3, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(sheetHeading(page)).toBeFocused();
  await expect(sheetHeading(page)).toHaveText("3 things need a look");
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(sheetRows(page)).toHaveCount(4);

  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  await expect(viewAll(page)).toBeFocused();
  await expect(rows(page)).toHaveCount(3);
});

test("a hidden item stays hidden across reloads; what can't be hidden stays", async ({ page }) => {
  await page.goto("/");
  await openSheet(page);
  const adjusted = sheetRow(page, `${wallet} had an unexplained difference`);
  await expect(async () => {
    await adjusted.getByRole("button", { name: /^Hide/ }).click();
    await expect(adjusted).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press("Escape");
  // Nothing left to open the sheet for, so focus goes to the Attention heading.
  await expect(viewAll(page)).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: "Attention" })).toBeFocused();

  await page.reload();
  await expect(row(page, wallet)).toHaveCount(0);
  await expect(row(page, bill)).toBeVisible();
  await expect(page.getByText("3 things need a look")).toBeVisible();
  // Three payments due fill the preview, and none can be hidden: no View all.
  await expect(viewAll(page)).toHaveCount(0);
});

for (const width of [390, 768, 820, 1024, 1280, 1920]) {
  test(`the Overview fits ${width}px, in one reading order, with Available in the first view`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);

    const band = page.getByRole("region", { name: "Available now" });
    await expect(band.getByRole("heading", { name: "Available now" })).toBeInViewport();
    await expect(band.getByTestId("available-ring")).toBeInViewport();

    // The DOM order is the reading order; on screen, each zone starts after
    // the one before it (below it, or to its right in the spread from 1024px).
    const zones = [
      "Available now",
      "Month at a glance",
      "Attention",
      "This month",
      "Where you stand",
    ];
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(zones);
    const boxes = await Promise.all(
      zones.map((name) => page.getByRole("heading", { level: 2, name }).boundingBox()),
    );
    for (let i = 1; i < boxes.length; i++) {
      const [prev, next] = [boxes[i - 1]!, boxes[i]!];
      expect(next.y > prev.y || next.x > prev.x, `${zones[i]} after ${zones[i - 1]}`).toBe(true);
    }
    const monthBeside = boxes[1]!.x > boxes[0]!.x + 100;
    expect(monthBeside, "Month at a glance beside Available only from 1024px").toBe(width >= 1024);
    if (width >= 1024) {
      // The top row: Available and Month at a glance share one top edge and one height.
      const [left, right] = await Promise.all([
        band.boundingBox(),
        page.getByRole("region", { name: "Month at a glance" }).boundingBox(),
      ]);
      expect(Math.round(left!.y)).toBe(Math.round(right!.y));
      expect(Math.round(left!.height)).toBe(Math.round(right!.height));
    }

    // Each Attention card holds its tag, subject and figure inside it.
    for (const card of await rows(page).all()) {
      const box = (await card.boundingBox())!;
      for (const part of [
        card.locator("span.inline-flex.rounded-full").first(),
        card.getByText(/৳[\d,]+/).first(),
      ]) {
        const inner = (await part.boundingBox())!;
        expect(inner.x + inner.width, "runs out of its card").toBeLessThanOrEqual(
          box.x + box.width,
        );
      }
    }

    // Net worth and the month stay inside their cards.
    const stand = page.getByRole("region", { name: "Where you stand" });
    const standBox = (await stand.boundingBox())!;
    const worth = (await stand
      .getByText(/^৳[\d,]+$/)
      .first()
      .boundingBox())!;
    expect(worth.x + worth.width).toBeLessThanOrEqual(standBox.x + standBox.width);
    const story = page.getByRole("region", { name: "This month" });
    const storyBox = (await story.boundingBox())!;
    const journey = (await story.getByTestId("month-journey").boundingBox())!;
    expect(journey.x + journey.width).toBeLessThanOrEqual(storyBox.x + storyBox.width);

    // Five destinations on desktop, four phone tabs around the +; Overview is current.
    await expectCurrent(page, width, "Overview");
    const nav = mainNav(page, width);
    if (width >= 768) {
      // Every desktop destination stays on one line ("Cash flow" once wrapped at 820px).
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll("header nav a")]
          .filter((a) => {
            const range = document.createRange();
            range.selectNodeContents(a);
            return range.getClientRects().length > 1;
          })
          .map((a) => a.textContent),
      );
      expect(wrapped, `wrapped destinations at ${width}px`).toEqual([]);
    }
    if (width < 768) {
      const cells = nav.locator(":scope > *");
      await expect(cells).toHaveCount(5);
      await expect(cells.nth(2)).toHaveAttribute("aria-label", "Add a transaction");
    }
  });
}
