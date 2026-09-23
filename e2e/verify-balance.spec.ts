import { expect, test, type Page } from "@playwright/test";

/**
 * Roadmap flow 2: verify an account balance.
 *
 * The test builds its own account through the UI and verifies that one, so it
 * proves the flow without depending on any particular demo data existing.
 */

/** A name unique to this run, so repeated runs never collide on the account name. */
const accountName = () =>
  `Verify ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The balance shown for an account on the Accounts page, in taka. */
async function balanceOf(page: Page, account: string): Promise<number> {
  await page.goto("/accounts");
  const row = page.getByRole("listitem").filter({ hasText: account }).first();
  const text = await row.innerText();
  const amounts = [...text.matchAll(/৳\s*([\d,]+)/g)].map((m) => Number(m[1]!.replace(/,/g, "")));
  if (amounts.length === 0) throw new Error(`No balance shown for ${account}: ${text}`);
  return amounts.at(-1)!;
}

/** Creates this test's own cash account with a known starting balance. */
async function createAccount(page: Page, name: string, startingAmount: string) {
  await page.goto("/accounts");
  const add = page.getByRole("button", { name: /^New account/ }).first();
  // In dev the page becomes interactive a moment after it paints.
  await expect(async () => {
    await add.click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("radio", { name: "Cash" }).click();
  await dialog.getByLabel("Balance on that date").fill(startingAmount);
  await dialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function verify(page: Page, name: string, counted: string) {
  await page.goto("/accounts");
  const row = page.getByRole("listitem").filter({ hasText: name }).first();
  await expect(async () => {
    await row.getByRole("button", { name: /^Verify/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("How much is actually there?").fill(counted);
  await dialog.getByRole("button", { name: "Verify balance" }).click();
}

test("verifying a different amount adjusts the balance to what was counted", async ({ page }) => {
  const name = accountName();
  await createAccount(page, name, "5000");
  expect(await balanceOf(page, name)).toBe(5_000);

  await verify(page, name, "4650");

  await expect(page.getByRole("status")).toContainText("adjusted by");
  await expect(page.getByRole("dialog")).toBeHidden();
  expect(await balanceOf(page, name)).toBe(4_650);

  // The correction is visible in Activity as an adjustment, not as spending.
  await page.goto("/activity");
  await expect(page.getByText("Balance adjustment").first()).toBeVisible();
});

test("verifying a matching amount records it and posts nothing", async ({ page }) => {
  const name = accountName();
  await createAccount(page, name, "3200");

  await verify(page, name, "3200");

  await expect(page.getByRole("status")).toContainText("matches what you recorded");
  expect(await balanceOf(page, name)).toBe(3_200);

  // Nothing was posted: the account still shows only its opening balance.
  await page.goto("/activity");
  const rows = page.getByRole("listitem").filter({ hasText: name });
  await expect(rows.filter({ hasText: "Balance adjustment" })).toHaveCount(0);
});
