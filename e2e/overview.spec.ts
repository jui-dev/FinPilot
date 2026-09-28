import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { DEMO_TIME_ZONE, seedDemo } from "@/db/seed/demo-seed";
import { clearAllData } from "@/db/seed/reset";
import { systemClock } from "@/server/clock";

import { E2E_DATABASE_PATH } from "../playwright.config";

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

async function resetDemoInPlace() {
  const handle = openDatabase(path.resolve(E2E_DATABASE_PATH));
  try {
    migrateDatabase(handle);
    clearAllData(handle);
    await seedDemo(handle, systemClock(DEMO_TIME_ZONE).today(), { situations: false });
  } finally {
    handle.close();
  }
}

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

/** The Attention list: the region named by its heading. */
const list = (page: Page) => page.getByRole("region", { name: "Attention" });
const rows = (page: Page) => list(page).getByRole("listitem");
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });
const hideButtons = (page: Page) => list(page).getByRole("button", { name: /^Hide/ });
const attentionHeading = (page: Page) => page.getByRole("heading", { level: 2, name: "Attention" });

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
  const more = list(page).getByRole("button", { name: /^Show \d+ more/ });
  if (await more.count()) await more.click();
  while ((await hideButtons(page).count()) > 0) {
    const before = await rows(page).count();
    await expect(async () => {
      await hideButtons(page).first().click();
      await expect(rows(page)).toHaveCount(before - 1, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }
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

test("the logo leads to the Overview: four zones in order, and Overview is current", async ({
  page,
}) => {
  await page.goto("/activity");
  await page.getByRole("link", { name: "FinPilot", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  await expect(page).toHaveTitle(/^Overview · FinPilot$/);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Available now",
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

test("Available leads, with its free share, and opens the Available page", async ({ page }) => {
  await page.goto("/");
  const band = page.getByRole("region", { name: "Available now" });
  await expect(band).toContainText("Before new income");
  await expect(band).toContainText(/Free ৳[\d,]+ of ৳[\d,]+/);
  await expect(band.getByTestId("free-share-ring")).toBeVisible();
  await expect(band).not.toContainText("%");
  await band.getByRole("link", { name: "See how it's worked out" }).click();
  await expect(page).toHaveURL(/\/available$/);
});

test("This month and Where you stand lead to the rows and pages behind them", async ({ page }) => {
  await page.goto("/");
  const month = page.getByRole("region", { name: "This month" });
  await expect(month).toContainText("so far");
  await expect(month).toContainText("Left over");
  await expect(month).not.toContainText("Savings rate");
  await month.getByRole("link", { name: /^Came in, / }).click();
  await expect(page).toHaveURL(/\/activity\?type=income&from=\d{4}-\d{2}-01&to=/);

  await page.goto("/");
  const stand = page.getByRole("region", { name: "Where you stand" });
  await expect(stand).toContainText("Net worth");
  // The demo's Visa owes; Savings is outside Available.
  await expect(stand).toContainText(/Owe\s*৳[\d,]+/);
  await expect(stand).toContainText(/Outside Available ৳[\d,]+ · Savings/);
  await expect(stand.getByTestId("asset-rail")).toBeVisible();
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
  const adjusted = row(page, `${wallet} had an unexplained difference`);
  await expect(adjusted).toContainText("Adjusted");
  await expect(adjusted).toContainText("found ৳350 less than the ledger recorded");
  await expect(page.getByText("1 thing needs a look")).toBeVisible();

  // Its evidence: the adjustment itself, in Activity, on that account and day.
  await adjusted.getByRole("link", { name: /^See the adjustment/ }).click();
  await expect(page).toHaveURL(
    /\/activity\?account=[^&]+&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/,
  );
  await expect(page.getByText("Balance adjustment").first()).toBeVisible();

  // Hiding the last visible item leaves the empty strip; Undo brings it back.
  await page.goto("/");
  await expect(async () => {
    await adjusted
      .getByRole("button", { name: `Hide ${wallet} had an unexplained difference` })
      .click();
    await expect(page.getByRole("status")).toContainText("Hidden.", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(list(page)).toContainText("Nothing needs your attention");
  // Focus returns to the heading, since the row that held it is gone.
  await expect(attentionHeading(page)).toBeFocused();

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(adjusted).toBeVisible();
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
  expect(texts[1]).toContain(`${wallet} had an unexplained difference`);

  const due = row(page, bill);
  await expect(due.getByRole("button", { name: /^Hide/ })).toHaveCount(0);
  await due.getByRole("link", { name: new RegExp(`^Open Commitments: ${bill}`) }).click();
  await expect(page).toHaveURL(/\/commitments$/);
});

test("the first 3 show; Show N more opens the rest in place, and Show fewer closes them", async ({
  page,
}) => {
  await addCommitment(page, unique("OV Water"), "900", 4);
  await addCommitment(page, unique("OV Gas"), "700", 5);

  await page.goto("/");
  await expect(page.getByText("4 things need a look")).toBeVisible();
  await expect(rows(page)).toHaveCount(3);
  const more = list(page).getByRole("button", { name: "Show 1 more" });
  await expect(more).toHaveAttribute("aria-expanded", "false");
  await more.click();

  await expect(page).toHaveURL(/\/$/);
  await expect(rows(page)).toHaveCount(4);
  const fewer = list(page).getByRole("button", { name: "Show fewer" });
  await expect(fewer).toHaveAttribute("aria-expanded", "true");
  await expect(fewer).toBeFocused();
  // Still in priority order: the adjustment comes after every payment due.
  expect((await rows(page).allInnerTexts())[3]).toContain(
    `${wallet} had an unexplained difference`,
  );

  // Hide works from the opened rows, and the next one moves up.
  await expect(async () => {
    await row(page, `${wallet} had an unexplained difference`)
      .getByRole("button", { name: /^Hide/ })
      .click();
    await expect(rows(page)).toHaveCount(3, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(attentionHeading(page)).toBeFocused();
  await expect(list(page).getByRole("button", { name: /^Show/ })).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(list(page).getByRole("button", { name: /^Show/ })).toBeVisible();
  await expect(rows(page)).toHaveCount(4);

  await list(page).getByRole("button", { name: "Show fewer" }).click();
  await expect(rows(page)).toHaveCount(3);
  await expect(list(page).getByRole("button", { name: "Show 1 more" })).toBeVisible();
});

test("a hidden item stays hidden across reloads; what can't be hidden stays", async ({ page }) => {
  await page.goto("/");
  await list(page).getByRole("button", { name: "Show 1 more" }).click();
  const adjusted = row(page, `${wallet} had an unexplained difference`);
  await expect(async () => {
    await adjusted.getByRole("button", { name: /^Hide/ }).click();
    await expect(adjusted).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  await page.reload();
  await expect(adjusted).toHaveCount(0);
  await expect(row(page, bill)).toBeVisible();
  await expect(page.getByText("3 things need a look")).toBeVisible();
  await expect(hideButtons(page)).toHaveCount(0);
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
    await expect(band.getByTestId("free-share-ring")).toBeInViewport();

    // The DOM order is the reading order; on screen, each zone starts after
    // the one before it (below it, or to its right from 1280px).
    const zones = ["Available now", "Attention", "This month", "Where you stand"];
    await expect(page.getByRole("heading", { level: 2 })).toHaveText(zones);
    const boxes = await Promise.all(
      zones.map((name) => page.getByRole("heading", { level: 2, name }).boundingBox()),
    );
    for (let i = 1; i < boxes.length; i++) {
      const [prev, next] = [boxes[i - 1]!, boxes[i]!];
      expect(next.y > prev.y || next.x > prev.x, `${zones[i]} after ${zones[i - 1]}`).toBe(true);
    }
    const attentionBeside = boxes[1]!.x > boxes[0]!.x;
    expect(attentionBeside, "Attention beside the band only from 1280px").toBe(width >= 1280);

    // The first Attention row: its tag stays clear of its figure.
    const first = rows(page).first();
    const tag = await first.locator("span.rounded-full").first().boundingBox();
    const amount = await first
      .getByText(/৳[\d,]+/)
      .first()
      .boundingBox();
    const box = await first.boundingBox();
    expect(tag!.x + tag!.width, "tag runs into the amount").toBeLessThanOrEqual(amount!.x);
    expect(amount!.x + amount!.width).toBeLessThanOrEqual(box!.x + box!.width);

    // The asset rail and its words stay inside the card.
    const stand = page.getByRole("region", { name: "Where you stand" });
    const standBox = await stand.boundingBox();
    const rail = await stand.getByTestId("asset-rail").boundingBox();
    expect(rail!.x + rail!.width).toBeLessThanOrEqual(standBox!.x + standBox!.width);

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
