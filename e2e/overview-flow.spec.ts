import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { openDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { DEMO_TIME_ZONE, seedDemo } from "@/db/seed/demo-seed";
import { clearAllData } from "@/db/seed/reset";
import { formatMoney, money } from "@/domain/money";
import { systemClock } from "@/server/clock";

import { E2E_DATABASE_PATH } from "../playwright.config";

/**
 * Roadmap flow 4: Quick Add → the Overview updates (Available, signals).
 *
 * A freshly verified account records an expense through Quick Add on the
 * Overview, and the Overview re-reads itself: Available and the money on hand
 * drop by the expense, and Attention now says the account no longer matches
 * its verification. Nothing is stubbed and the page is never reloaded.
 *
 * Every date is the app's today: the account opens today, is verified today
 * and the expense takes Quick Add's default date, today. Verification is
 * date-granular, so a same-day expense moves the verified day's balance on any
 * calendar date. The spec starts from the fresh plain ledger (reset in place,
 * as in overview.spec.ts) so no commitment left by an earlier spec can outrank
 * the new signal in Attention's preview, and restores it afterwards.
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

test.beforeAll(resetDemoInPlace);
test.afterAll(resetDemoInPlace);

const EXPENSE = 275;

const accountName = () =>
  `Flow4 ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function openDialog(page: Page, open: () => Promise<void>) {
  // The page becomes interactive a moment after it paints.
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

const band = (page: Page) => page.getByRole("region", { name: "Available now" });
const attention = (page: Page) => page.getByRole("region", { name: "Attention" });

/** Available and the money on hand, in whole taka, from the band's one precise sentence. */
async function readAvailable(page: Page): Promise<{ available: number; onHand: number }> {
  const text = (await band(page).textContent()) ?? "";
  const match = text.match(/Free: (−?)৳([\d,]+) of the ৳([\d,]+) on hand/);
  if (!match) throw new Error(`No free-share sentence in the Available band: ${text}`);
  const taka = (digits: string) => Number(digits.replace(/,/g, ""));
  return { available: (match[1] ? -1 : 1) * taka(match[2]!), onHand: taka(match[3]!) };
}

test("Quick Add on the Overview: Available drops by the expense and Attention flags the verification", async ({
  page,
}) => {
  const name = accountName();

  // A fresh Cash account, verified at exactly its balance: nothing is adjusted.
  await page.goto("/accounts");
  await openDialog(page, () =>
    page
      .getByRole("button", { name: /^New account/ })
      .first()
      .click(),
  );
  const create = page.getByRole("dialog");
  await create.getByLabel("Name").fill(name);
  await create.getByRole("radio", { name: "Cash" }).click();
  await create.getByLabel("Balance on that date").fill("5000");
  await create.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const account = page.getByRole("listitem").filter({ hasText: name }).first();
  await openDialog(page, () => account.getByRole("button", { name: /^Verify/ }).click());
  const verify = page.getByRole("dialog");
  await verify.getByLabel("How much is actually there?").fill("5000");
  await verify.getByRole("button", { name: "Verify balance" }).click();
  await expect(page.getByRole("status")).toContainText("matches what you recorded");
  await expect(page.getByRole("dialog")).toBeHidden();

  // The Overview before: a matching verification raises nothing.
  await page.goto("/");
  await expect(band(page)).toContainText(/Free: −?৳[\d,]+ of the ৳[\d,]+ on hand/);
  const before = await readAvailable(page);
  await expect(attention(page).getByRole("listitem").filter({ hasText: name })).toHaveCount(0);

  // From here on the page is only ever refreshed by the save itself.
  const loads: string[] = [];
  page.on("load", () => loads.push(page.url()));

  // Quick Add from the Overview: an expense from the new account, dated today.
  await openDialog(page, () => page.getByRole("button", { name: /^Add/ }).first().click());
  const quickAdd = page.getByRole("dialog");
  await quickAdd.getByLabel("Amount in taka").fill(String(EXPENSE));
  await quickAdd.getByRole("radio", { name: "Expense" }).click();
  await quickAdd.getByRole("button", { name: "Food & Dining" }).click();
  await quickAdd.getByRole("button", { name, exact: true }).click();
  await expect(quickAdd.getByRole("button", { name: "Today", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await quickAdd.getByRole("button", { name: /Save expense/ }).click();
  await expect(page.getByRole("status")).toContainText(name);
  await expect(page.getByRole("dialog")).toBeHidden();

  // Available and the money on hand each drop by exactly the expense.
  await expect
    .poll(() => readAvailable(page))
    .toEqual({ available: before.available - EXPENSE, onHand: before.onHand - EXPENSE });
  // The headline figure shows the new Available.
  await expect(
    band(page)
      .getByText(formatMoney(money((before.available - EXPENSE) * 100)), { exact: true })
      .first(),
  ).toBeVisible();

  // Attention now flags the account: its verification no longer matches, by the expense.
  const flagged = attention(page)
    .getByRole("listitem")
    .filter({ hasText: new RegExp(`${name} no longer matches its .+ verification`) });
  await expect(flagged).toHaveCount(1);
  await expect(flagged).toContainText("Doesn't match");
  await expect(flagged).toContainText(`${formatMoney(money(EXPENSE * 100))} off`);
  await expect(flagged.getByRole("button", { name: /^Hide/ })).toHaveCount(0);

  expect(page.url()).toMatch(/\/$/);
  expect(loads, "the Overview was reloaded").toEqual([]);

  // Its evidence: this account's entries through the verified day, in Activity.
  await flagged.getByRole("link", { name: /^Review entries through / }).click();
  await expect(page).toHaveURL(
    /\/activity\?account=[^&]+&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/,
  );
  await expect(page.getByText(/^Showing/)).toContainText(name);
  await expect(page.getByRole("link", { name: /Food & Dining/ })).toBeVisible();
});
