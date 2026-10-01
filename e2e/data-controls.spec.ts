import { expect, test, type Page } from "@playwright/test";

import { resetDemoInPlace } from "./demo-ledger";

/**
 * Settings → Data & demo: Clear all data needs CLEAR typed exactly and leaves
 * a usable fresh start on every screen; Reset to demo data is confirmed and
 * brings the demo back, as often as it is used, without duplicating anything.
 * The server's own checks (the flag, the exact confirmation, rollback) are in
 * tests/db/owner-data.test.ts.
 *
 * Specs share one database, so this one starts from and restores the plain demo
 * ledger, as the Overview specs do.
 */

test.describe.configure({ mode: "serial" });
test.beforeAll(resetDemoInPlace);
test.afterAll(resetDemoInPlace);

const DEMO_ACCOUNTS = ["Bank", "Cash", "bKash", "Savings", "Visa card"];

const balances = (page: Page) =>
  page.getByRole("region", { name: "Balances" }).getByRole("listitem");

test("Clear all data stays disabled until CLEAR is typed exactly", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Clear all data" }).click();
  const dialog = page.getByRole("dialog", { name: "Clear all data?" });
  const confirm = dialog.getByRole("button", { name: "Clear all data" });
  const field = dialog.getByLabel("Type CLEAR to confirm");

  for (const almost of ["", "clear", "Clear", "CLEA", "CLEAR ", " CLEAR"]) {
    await field.fill(almost);
    await expect(confirm, JSON.stringify(almost)).toBeDisabled();
    // Enter in the field cannot submit it either.
    await field.press("Enter");
    await expect(dialog).toBeVisible();
  }

  // Cancelling clears nothing, and forgets what was typed.
  await field.fill("CLEAR");
  await expect(confirm).toBeEnabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/accounts");
  await expect(balances(page)).toHaveCount(DEMO_ACCOUNTS.length);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Clear all data" }).click();
  await expect(page.getByLabel("Type CLEAR to confirm")).toHaveValue("");
});

test("clearing leaves a fresh start on every screen", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Clear all data" }).click();
  const dialog = page.getByRole("dialog", { name: "Clear all data?" });
  await dialog.getByLabel("Type CLEAR to confirm").fill("CLEAR");
  await dialog.getByRole("button", { name: "Clear all data" }).click();
  await expect(page.getByText("All data cleared.")).toBeVisible();
  await expect(dialog).toBeHidden();

  // Settings re-reads itself: the twelve default categories, none in use.
  await expect(page.getByText("Not used yet")).toHaveCount(12);

  // Quick Add (loaded by the layout) no longer offers the old accounts.
  await page.getByRole("button", { name: /^Add/ }).first().click();
  const quickAdd = page.getByRole("dialog");
  await expect(
    quickAdd.getByText("Nothing can be recorded until there is an account."),
  ).toBeVisible();
  await expect(quickAdd.getByRole("button", { name: "Bank" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/");
  await expect(page.getByText("Nothing on hand")).toBeVisible();
  await expect(page.getByText("Nothing needs your attention")).toBeVisible();
  await page.goto("/accounts");
  await expect(page.getByText("No accounts yet")).toBeVisible();
  await page.goto("/activity");
  await expect(page.getByText("No transactions yet")).toBeVisible();
  await page.goto("/commitments");
  await expect(page.getByText("No commitments yet")).toBeVisible();
  await page.goto("/set-aside");
  await expect(page.getByText("Nothing set aside yet")).toBeVisible();
});

test("Reset to demo data is confirmed, and brings the demo back without duplicates", async ({
  page,
}) => {
  await page.goto("/settings");
  const open = page.getByRole("button", { name: "Reset to demo data" });
  const dialog = page.getByRole("dialog", { name: "Reset to demo data?" });

  // Cancelling resets nothing.
  await open.click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await page.goto("/accounts");
  await expect(page.getByText("No accounts yet")).toBeVisible();

  for (let run = 1; run <= 2; run++) {
    await page.goto("/settings");
    await open.click();
    await dialog.getByRole("button", { name: "Reset to demo data" }).click();
    await expect(page.getByText("Demo data restored.")).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toBeHidden();

    await page.goto("/accounts");
    await expect(balances(page)).toHaveCount(DEMO_ACCOUNTS.length);
    for (const name of DEMO_ACCOUNTS) {
      await expect(balances(page).filter({ hasText: name }), `${name}, run ${run}`).toHaveCount(1);
    }
  }

  await page.goto("/");
  await expect(page.getByText("Nothing on hand")).toHaveCount(0);
});
