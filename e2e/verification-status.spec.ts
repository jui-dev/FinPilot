import { expect, test, type Page } from "@playwright/test";

/**
 * Verification status on Accounts: an account reads as verified until something
 * dated on or before the verification changes, then reads as changed.
 *
 * The test builds its own account, so it depends on no particular demo data.
 */

const accountName = () =>
  `Status ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The meta line under an account's name on the Accounts page. */
async function metaOf(page: Page, account: string): Promise<string> {
  await page.goto("/accounts");
  const row = page.getByRole("listitem").filter({ hasText: account }).first();
  await expect(row).toBeVisible();
  return row.innerText();
}

async function openPanel(page: Page, open: () => Promise<void>) {
  // In dev the page becomes interactive a moment after it paints.
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** ISO date `days` before today, in the browser's calendar. */
const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

async function createAccount(page: Page, name: string, startingAmount: string) {
  await page.goto("/accounts");
  await openPanel(page, () =>
    page
      .getByRole("button", { name: /^New account/ })
      .first()
      .click(),
  );
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("radio", { name: "Cash" }).click();
  // Opened well before the backdated entry below: no transaction may predate it.
  await dialog.getByLabel("Opened on").fill(daysAgo(10));
  await dialog.getByLabel("Balance on that date").fill(startingAmount);
  await dialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function verify(page: Page, name: string, counted: string) {
  await page.goto("/accounts");
  const row = page.getByRole("listitem").filter({ hasText: name }).first();
  await openPanel(page, () => row.getByRole("button", { name: /^Verify/ }).click());
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("How much is actually there?").fill(counted);
  await dialog.getByRole("button", { name: "Verify balance" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** Records a backdated expense on the account through Quick Add. */
async function backdatedExpense(page: Page, account: string, amount: string, isoDate: string) {
  await page.goto("/activity");
  await openPanel(page, () => page.getByRole("button", { name: /^Add/ }).first().click());
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in taka").fill(amount);
  await dialog.getByRole("radio", { name: "Expense" }).click();
  await dialog.getByRole("button", { name: "Food & Dining" }).click();
  await dialog.getByRole("button", { name: account, exact: true }).click();
  await dialog.getByLabel("Date").fill(isoDate);
  await dialog.getByRole("button", { name: /Save expense/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("an account reads as verified, then as changed once earlier history moves", async ({
  page,
}) => {
  const name = accountName();
  await createAccount(page, name, "5000");

  // Never verified: the row says nothing about verification.
  const before = await metaOf(page, name);
  expect(before).not.toContain("Verified");
  expect(before).not.toContain("Changed since");

  await verify(page, name, "5000");
  expect(await metaOf(page, name)).toContain("Verified");

  // Something that happened before the verification comes to light.
  await backdatedExpense(page, name, "250", daysAgo(1));

  const after = await metaOf(page, name);
  expect(after).toContain("Changed since");
  expect(after).not.toMatch(/Verified \d/);
  // How far off, and the two amounts compared: never which entry caused it.
  expect(after).toMatch(/৳\s*250 off/);
  expect(after).toMatch(/Recorded ৳\s*4,750 for that day · verified ৳\s*5,000/);

  // The evidence: the account's entries through the checkpoint date, as they stand now.
  const row = page.getByRole("listitem").filter({ hasText: name }).first();
  await row.getByRole("link", { name: /^Review entries through / }).click();
  await expect(page).toHaveURL(
    /\/activity\?account=[^&]+&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/,
  );
  await expect(page.getByText(/^Showing/)).toContainText(name);
  await expect(page.getByRole("link", { name: /in Cash flow$/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Food & Dining/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Opening balance/ })).toBeVisible();

  // Verifying again against the corrected ledger settles it.
  await verify(page, name, "4750");
  expect(await metaOf(page, name)).toContain("Verified");
});
