import { expect, test, type Page } from "@playwright/test";

/**
 * Stage 7: Set aside, end to end on the real ledger. Each test makes its own
 * uniquely named account and purpose, so it depends on no particular data.
 * Nothing here moves money: setting aside and releasing record no transaction,
 * and a shortfall appears only because a real expense lowered a balance.
 */

const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function openDialog(page: Page, open: () => Promise<void>) {
  // In dev the page becomes interactive a moment after it paints.
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** A new Cash account with a known starting balance. */
async function newCashAccount(page: Page, name: string, balance: string) {
  await page.goto("/accounts");
  await openDialog(page, () =>
    page
      .getByRole("button", { name: /^New account/ })
      .first()
      .click(),
  );
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("radio", { name: "Cash" }).click();
  await dialog.getByLabel("Balance on that date").fill(balance);
  await dialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

/** The balance shown for an account on the Accounts page, in taka. */
async function balanceOf(page: Page, account: string): Promise<number> {
  await page.goto("/accounts");
  const text = await page.getByRole("listitem").filter({ hasText: account }).first().innerText();
  const amounts = [...text.matchAll(/(−?)\s*৳\s*([\d,]+)/g)].map(
    (m) => (m[1] ? -1 : 1) * Number(m[2]!.replace(/,/g, "")),
  );
  return amounts.at(-1)!;
}

async function newPurpose(page: Page, name: string, target: string) {
  await page.goto("/set-aside");
  await openDialog(page, () =>
    page
      .getByRole("button", { name: /^New purpose/ })
      .first()
      .click(),
  );
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What is it for?").fill(name);
  await dialog.getByLabel("Target (optional)").fill(target);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

const item = (page: Page, name: string) => page.getByRole("article", { name });

async function setAside(page: Page, purpose: string, account: string, amount: string) {
  await openDialog(page, () =>
    item(page, purpose)
      .getByRole("button", { name: /^Set (money aside|aside more)/ })
      .click(),
  );
  const dialog = page.getByRole("dialog");
  const from = dialog.getByLabel("From account");
  const value = await from.locator("option", { hasText: `${account} — ` }).getAttribute("value");
  await from.selectOption(value!);
  await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByRole("button", { name: "Set aside", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function release(page: Page, purpose: string, amount: string | "all") {
  await openDialog(page, () =>
    item(page, purpose)
      .getByRole("button", { name: /^Release/ })
      .click(),
  );
  const dialog = page.getByRole("dialog");
  if (amount === "all") await dialog.getByRole("button", { name: "Release all" }).click();
  else await dialog.getByLabel("Amount").fill(amount);
  await dialog.getByRole("button", { name: "Release", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

test("a purpose from creation to archive, with a real shortfall in between", async ({ page }) => {
  const account = unique("SA Cash");
  const purpose = unique("Laptop");
  await newCashAccount(page, account, "1200");

  // Creating a purpose sets nothing aside.
  await newPurpose(page, purpose, "1500");
  const block = item(page, purpose);
  await expect(block).toContainText("Nothing set aside yet.");
  await expect(block).toContainText("৳1,500 still needed");
  await expect(block).toContainText("0%");

  // Setting money aside: one number while it is all covered.
  await setAside(page, purpose, account, "1000");
  await expect(block).toContainText("৳1,000 set aside");
  await expect(block).toContainText("৳500 still needed");
  await expect(block).toContainText("67%");
  await expect(block).not.toContainText("short");
  expect(await balanceOf(page, account)).toBe(1200);

  // A real expense lowers the balance below what is set aside.
  await page.goto("/activity");
  await openDialog(page, () => page.getByRole("button", { name: /^Add/ }).first().click());
  const quickAdd = page.getByRole("dialog");
  await quickAdd.getByLabel("Amount in taka").fill("500");
  await quickAdd.getByRole("radio", { name: "Expense" }).click();
  await quickAdd.getByRole("button", { name: "Food & Dining" }).click();
  await quickAdd.getByRole("button", { name: account, exact: true }).click();
  await quickAdd.getByRole("button", { name: /Save expense/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.goto("/set-aside");
  await expect(block).toContainText("৳700 of ৳1,000 still covered");
  await expect(block).toContainText("৳300 short");
  // Still needed and progress follow what is covered, not what is set aside.
  await expect(block).toContainText("৳800 still needed");
  await expect(block).toContainText("47%");

  // Releasing is explicit, changes only the protection, and records no transaction.
  await release(page, purpose, "100");
  await expect(block).toContainText("৳700 of ৳900 still covered");
  await expect(block).toContainText("৳200 short");
  expect(await balanceOf(page, account)).toBe(700);

  // Archive is refused while money is set aside, and says why.
  await page.goto("/set-aside");
  await openDialog(page, () => block.getByRole("button", { name: /^Edit/ }).click());
  const edit = page.getByRole("dialog");
  await expect(edit).toContainText("is still set aside");
  await expect(edit.getByRole("button", { name: `Archive ${purpose}` })).toBeDisabled();
  await edit.getByRole("button", { name: "Close" }).click();

  // Release everything, then archive: final, and listed under Archived.
  await release(page, purpose, "all");
  await expect(block).toContainText("Nothing set aside yet.");
  await openDialog(page, () => block.getByRole("button", { name: /^Edit/ }).click());
  await page
    .getByRole("dialog")
    .getByRole("button", { name: `Archive ${purpose}` })
    .click();
  await page
    .getByRole("dialog", { name: `Archive ${purpose}?` })
    .getByRole("button", { name: "Archive", exact: true })
    .click();
  await expect(item(page, purpose)).toHaveCount(0);
  await page.getByText(/^Archived \(\d+\)$/).click();
  await expect(page.getByRole("listitem").filter({ hasText: purpose })).toBeVisible();
  expect(await balanceOf(page, account)).toBe(700);
});

test("an archived account is never offered for setting money aside", async ({ page }) => {
  const account = unique("SA Closed");
  const purpose = unique("Travel");
  await newCashAccount(page, account, "");
  const row = page.getByRole("listitem").filter({ hasText: account }).first();
  await expect(async () => {
    await row.getByRole("button", { name: /^Archive/ }).click();
    await expect(page.getByRole("status")).toContainText("archived", { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });

  await newPurpose(page, purpose, "");
  await openDialog(page, () =>
    item(page, purpose)
      .getByRole("button", { name: /^Set money aside/ })
      .click(),
  );
  const options = await page
    .getByRole("dialog")
    .getByLabel("From account")
    .locator("option")
    .allInnerTexts();
  expect(options.some((o) => o.startsWith(account))).toBe(false);
  expect(options.some((o) => o.startsWith("Visa card"))).toBe(false);
});

test("the Available area switches between Available, Commitments and Set aside", async ({
  page,
}) => {
  await page.goto("/commitments");
  const area = page.getByRole("navigation", { name: "Available" });
  const available = page
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Available" });

  await area.getByRole("link", { name: "Set aside" }).click();
  await expect(page).toHaveURL(/\/set-aside$/);
  await expect(page.getByRole("heading", { level: 1, name: "Set aside" })).toBeVisible();
  await expect(area.getByRole("link", { name: "Set aside" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // The global Available destination stays current for its whole area.
  await expect(available).toHaveAttribute("aria-current", "true");

  await area.getByRole("link", { name: "Available" }).click();
  await expect(page).toHaveURL(/\/available$/);
  await expect(available).toHaveAttribute("aria-current", "page");

  await area.getByRole("link", { name: "Commitments" }).click();
  await expect(page).toHaveURL(/\/commitments$/);
  await expect(available).toHaveAttribute("aria-current", "true");
});

test("Set aside fits every width with representative data and no horizontal scroll", async ({
  page,
}) => {
  // Built here, not inherited from earlier tests: a 40-character name, a target
  // with progress, two holdings, and a real shortfall on one of them.
  const account = unique("SA Wide");
  const purpose = unique("Tuition and books for next year").padEnd(40, "s").slice(0, 40);
  expect(purpose).toHaveLength(40);
  await newCashAccount(page, account, "1000");
  await newPurpose(page, purpose, "5000");
  await setAside(page, purpose, account, "600");
  await setAside(page, purpose, "Bank", "400");

  await page.goto("/activity");
  await openDialog(page, () => page.getByRole("button", { name: /^Add/ }).first().click());
  const quickAdd = page.getByRole("dialog");
  await quickAdd.getByLabel("Amount in taka").fill("700");
  await quickAdd.getByRole("radio", { name: "Expense" }).click();
  await quickAdd.getByRole("button", { name: "Food & Dining" }).click();
  await quickAdd.getByRole("button", { name: account, exact: true }).click();
  await quickAdd.getByRole("button", { name: /Save expense/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  for (const width of [390, 820, 1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/set-aside");
    const block = item(page, purpose);
    // The representative state really rendered: shortfall, target and both holdings.
    await expect(block).toContainText("৳700 of ৳1,000 still covered");
    await expect(block).toContainText("৳300 short");
    await expect(block).toContainText("Target ৳5,000");
    await expect(block.getByRole("listitem")).toHaveCount(2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow at ${width}px`).toBe(0);
  }
});
