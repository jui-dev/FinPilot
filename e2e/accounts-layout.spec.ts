import { expect, test, type Page } from "@playwright/test";

/**
 * How Accounts presents itself: every balance states its verification, even
 * before the first one, and the page fits phones, tablets and desktops with
 * the position on the first screen.
 *
 * The test builds its own account, so it depends on no particular demo data.
 */

const accountName = () =>
  `Layout ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function openPanel(page: Page, open: () => Promise<void>) {
  // In dev the page becomes interactive a moment after it paints.
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function rowText(page: Page, account: string): Promise<string> {
  await page.goto("/accounts");
  const row = page.getByRole("listitem").filter({ hasText: account }).first();
  await expect(row).toBeVisible();
  return row.innerText();
}

test("a balance never verified says so, until it is verified", async ({ page }) => {
  const name = accountName();
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
  await dialog.getByLabel("Balance on that date").fill("1200");
  await dialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  expect(await rowText(page, name)).toContain("Not verified yet");

  const row = page.getByRole("listitem").filter({ hasText: name }).first();
  await openPanel(page, () => row.getByRole("button", { name: `Verify ${name}` }).click());
  await page.getByRole("dialog").getByLabel("How much is actually there?").fill("1200");
  await page.getByRole("dialog").getByRole("button", { name: "Verify balance" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const after = await rowText(page, name);
  expect(after).toContain("Verified");
  expect(after).not.toContain("Not verified yet");
});

for (const width of [390, 820, 1024, 1280]) {
  test(`fits ${width}px with net worth and New account on the first screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/accounts");

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    // The ledger clips its overflow, so a row pushed too wide hides its actions
    // without scrolling the page: every action must lie inside the ledger.
    const clipped = await page.getByRole("region", { name: "Balances" }).evaluate((ledger) => {
      const edge = ledger.getBoundingClientRect();
      return [...ledger.querySelectorAll("button")]
        .filter((button) => {
          const box = button.getBoundingClientRect();
          return box.left < edge.left || box.right > edge.right;
        })
        .map((button) => button.textContent);
    });
    expect(clipped).toEqual([]);
    await expect(page.getByRole("heading", { name: "Net worth" })).toBeInViewport();
    await expect(page.getByRole("button", { name: /^New account/ })).toBeInViewport();
  });
}
