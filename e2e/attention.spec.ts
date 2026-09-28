import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { DEMO_TIME_ZONE, seedDemo } from "@/db/seed/demo-seed";
import { clearAllData } from "@/db/seed/reset";
import { systemClock } from "@/server/clock";

import { E2E_DATABASE_PATH } from "../playwright.config";

/**
 * Stage 9: Attention at "/". Specs share one database, and earlier ones leave
 * shortfalls, commitments and adjustments behind, so this spec starts from the
 * fresh demo ledger — cleared and reseeded in place, as db:reset does while
 * the server holds the file — and restores it afterwards for the specs that
 * follow. It is the plain ledger, without the demo situations (as in global
 * setup): no commitments, set-aside money or verified balances, so the only
 * thing it can raise is a month's spending increase. Every other situation is
 * built here through the UI.
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

/** The Attention list: the region named by the page's heading. */
const list = (page: Page) => page.getByRole("region", { name: "Attention" });
const rows = (page: Page) => list(page).getByRole("listitem");
const row = (page: Page, text: string) => rows(page).filter({ hasText: text });
const hideButtons = (page: Page) => list(page).getByRole("button", { name: /^Hide/ });

/** The desktop header's navigation, or the phone tab bar (only one is visible at a time). */
const mainNav = (page: Page, width: number) => {
  const navs = page.getByRole("navigation", { name: "Main" });
  return width < 768 ? navs.last() : navs.first();
};

/** Hides every signal that can be hidden, one at a time, as a person would. */
async function hideEverythingHideable(page: Page) {
  await page.goto("/");
  while ((await hideButtons(page).count()) > 0) {
    const before = await rows(page).count();
    await expect(async () => {
      await hideButtons(page).first().click();
      await expect(rows(page)).toHaveCount(before - 1, { timeout: 2_000 });
    }).toPass({ timeout: 20_000 });
  }
}

let wallet = "";
let bill = "";

test("the logo leads to /, which is Attention and not a navigation destination", async ({
  page,
}) => {
  await page.goto("/activity");
  await page.getByRole("link", { name: "FinPilot", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Attention" })).toBeVisible();
  await expect(page).toHaveTitle(/^Attention · FinPilot$/);

  const nav = mainNav(page, 1280);
  await expect(nav.getByRole("link")).toHaveText([
    "Activity",
    "Accounts",
    "Cash flow",
    "Available",
  ]);
  for (const name of ["Activity", "Accounts", "Cash flow", "Available"]) {
    await expect(nav.getByRole("link", { name })).not.toHaveAttribute("aria-current");
  }
  await nav.getByRole("link", { name: "Activity" }).click();
  await expect(page).toHaveURL(/\/activity$/);
  await expect(nav.getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
});

test("with nothing left to raise, it says so and leads on to Available", async ({ page }) => {
  // The fresh demo can raise only a month's spending increase, which can be hidden.
  await hideEverythingHideable(page);
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();
  await expect(page.getByText(/needs? a look$/)).toHaveCount(0);

  await page.reload();
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();
  await list(page).getByRole("link", { name: "See what's available" }).click();
  await expect(page).toHaveURL(/\/available$/);
});

test("an unexplained adjustment: its evidence, and Hide → empty → Undo", async ({ page }) => {
  wallet = unique("Wallet AT");
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

  // Hiding the last visible item leaves the empty state; Undo brings it back.
  await page.goto("/");
  await expect(async () => {
    await adjusted
      .getByRole("button", { name: `Hide ${wallet} had an unexplained difference` })
      .click();
    await expect(page.getByRole("status")).toContainText("Hidden.", { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();
  // Focus returns to the heading, since the row that held it is gone.
  await expect(page.getByRole("heading", { level: 1, name: "Attention" })).toBeFocused();

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(adjusted).toBeVisible();
  await page.reload();
  await expect(adjusted).toBeVisible();
});

test("a payment due soon sits above the adjustment and can't be hidden", async ({ page }) => {
  bill = unique("AT Internet");
  await page.goto("/commitments");
  await openDialog(page, () =>
    page.getByRole("button", { name: "New commitment" }).first().click(),
  );
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(bill);
  await dialog.getByLabel("Expected amount").fill("1500");
  await dialog.getByLabel("First due date").fill(dhakaDate(3));
  await dialog.getByLabel("Category").selectOption({ label: "Utilities" });
  await dialog.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

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

test("a hidden item stays hidden across reloads; what can't be hidden stays", async ({ page }) => {
  await page.goto("/");
  const adjusted = row(page, `${wallet} had an unexplained difference`);
  await expect(async () => {
    await adjusted.getByRole("button", { name: /^Hide/ }).click();
    await expect(adjusted).toHaveCount(0, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  await page.reload();
  await expect(adjusted).toHaveCount(0);
  await expect(row(page, bill)).toBeVisible();
  await expect(page.getByText("1 thing needs a look")).toBeVisible();
  await expect(hideButtons(page)).toHaveCount(0);
});

for (const width of [390, 820, 1024, 1280, 1920]) {
  test(`Attention fits ${width}px, with its figures clear of its labels`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
    await expect(page.getByRole("heading", { level: 1, name: "Attention" })).toBeInViewport();

    const first = rows(page).first();
    const tag = await first.getByText("In 3 days").boundingBox();
    const amount = await first.getByText("1,500").boundingBox();
    const box = await first.boundingBox();
    expect(tag!.x + tag!.width, "tag runs into the amount").toBeLessThanOrEqual(amount!.x);
    expect(amount!.x + amount!.width).toBeLessThanOrEqual(box!.x + box!.width);
    await expect(first.getByRole("link", { name: /^Open Commitments/ })).toBeInViewport();
    // The list stays a readable width on wide screens.
    expect(box!.width).toBeLessThanOrEqual(880);

    // Still four destinations, and none of them is current on "/".
    const nav = mainNav(page, width);
    await expect(nav.getByRole("link")).toHaveText([
      "Activity",
      "Accounts",
      "Cash flow",
      "Available",
    ]);
    for (const name of ["Activity", "Accounts", "Cash flow", "Available"]) {
      await expect(nav.getByRole("link", { name })).not.toHaveAttribute("aria-current");
    }
    if (width < 768) {
      const cells = nav.locator(":scope > *");
      await expect(cells).toHaveCount(5);
      await expect(cells.nth(2)).toHaveAttribute("aria-label", "Add a transaction");
    }
  });
}
