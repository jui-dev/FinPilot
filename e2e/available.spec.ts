import { expect, test, type Page } from "@playwright/test";
import { choose } from "./quick-add-steps";

/**
 * Stage 8: the Available area. Available is the global destination; its area
 * holds three pages — Available, Commitments and Set aside — behind a local
 * switch, and the destination stays current on all three.
 */

const AREA = ["/available", "/commitments", "/set-aside"] as const;
const PAGE_NAME = {
  "/available": "Available",
  "/commitments": "Commitments",
  "/set-aside": "Set aside",
};

const unique = (label: string) =>
  `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

async function openDialog(page: Page, open: () => Promise<void>) {
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** A displayed amount in taka: "৳1,46,163", "−৳6,000", "+৳500", or a deduction read as "minus". */
const toTaka = (text: string) => {
  const digits = Number(text.replace(/[^\d]/g, ""));
  return /−|minus/.test(text) ? -digits : digits;
};

/** The bridge as displayed: each row's label and amount. */
async function bridge(page: Page) {
  const rows = page.getByRole("table", { name: "How Available is worked out" }).locator("tbody tr");
  const out: { label: string; amount: number }[] = [];
  for (const row of await rows.all()) {
    const label = (await row.locator("th").innerText()).split("\n")[0]!.trim();
    out.push({ label, amount: toTaka(await row.locator('td[data-cell="amount"]').innerText()) });
  }
  return out;
}

/** The hero figure: the answer to the page. */
const answer = (page: Page) =>
  page.getByRole("region", { name: "Available now" }).locator("p").first();

async function availableNow(page: Page): Promise<number> {
  await page.goto("/available");
  return toTaka(await answer(page).innerText());
}

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

async function spend(page: Page, account: string, amount: string) {
  await page.goto("/activity");
  await openDialog(page, () => page.getByRole("button", { name: /^Add/ }).first().click());
  const quickAdd = page.getByRole("dialog");
  await quickAdd.getByLabel("Amount in taka").fill(amount);
  await quickAdd.getByRole("radio", { name: "Expense" }).click();
  await choose(quickAdd, "Category", "Food & Dining");
  await choose(quickAdd, "Paid from", account);
  await quickAdd.getByRole("button", { name: /Save expense/ }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

async function setAsideFrom(page: Page, purpose: string, account: string, amount: string) {
  await page.goto("/set-aside");
  await openDialog(page, () =>
    page
      .getByRole("button", { name: /^New purpose/ })
      .first()
      .click(),
  );
  const create = page.getByRole("dialog");
  await create.getByLabel("What is it for?").fill(purpose);
  await create.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await openDialog(page, () =>
    page
      .getByRole("article", { name: purpose })
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

/** The desktop header's navigation, or the phone tab bar (only one is visible at a time). */
const mainNav = (page: Page, width: number) => {
  const navs = page.getByRole("navigation", { name: "Main" });
  return width < 768 ? navs.last() : navs.first();
};

test("the Available destination lands on the Available page", async ({ page }) => {
  await page.goto("/activity");
  await mainNav(page, 1280).getByRole("link", { name: "Available" }).click();
  await expect(page).toHaveURL(/\/available$/);
  await expect(page.getByRole("heading", { level: 1, name: "Available" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Available" }).getByRole("link")).toHaveText([
    "Available",
    "Commitments",
    "Set aside",
  ]);
});

for (const width of [390, 1280]) {
  test(`Available is current across its whole area at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of AREA) {
      await page.goto(path);
      const nav = mainNav(page, width);
      await expect(nav.getByRole("link", { name: "Available" })).toHaveAttribute(
        "aria-current",
        path === "/available" ? "page" : "true",
      );
      // Cash flow has no phone tab (P-3).
      const others = ["Overview", "Activity", "Accounts", ...(width < 768 ? [] : ["Cash flow"])];
      for (const other of others) {
        await expect(nav.getByRole("link", { name: other, exact: true })).not.toHaveAttribute(
          "aria-current",
        );
      }
      const area = page.getByRole("navigation", { name: "Available" });
      for (const [href, name] of Object.entries(PAGE_NAME)) {
        const link = area.getByRole("link", { name });
        if (href === path) await expect(link).toHaveAttribute("aria-current", "page");
        else await expect(link).not.toHaveAttribute("aria-current");
      }
    }
  });
}

test("the phone tab bar keeps four destinations around the centred Add", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/available");
  const bar = mainNav(page, 390);
  const cells = bar.locator(":scope > *");
  await expect(cells).toHaveCount(5);
  await expect(cells.nth(2)).toHaveAttribute("aria-label", "Add a transaction");
  await expect(bar.getByRole("link")).toHaveText(["Overview", "Activity", "Accounts", "Available"]);
});

for (const width of [390, 820, 1024, 1280, 1920]) {
  test(`the Available area fits ${width}px with the switch on one line`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of AREA) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path} at ${width}px`).toBe(0);
      const links = page.getByRole("navigation", { name: "Available" }).getByRole("link");
      const first = await links.first().boundingBox();
      const last = await links.last().boundingBox();
      expect(last!.y, `switch wraps on ${path} at ${width}px`).toBe(first!.y);
      await expect(links.last()).toBeInViewport();
    }
    // The answer is on the first screen at every width.
    await page.goto("/available");
    await expect(answer(page)).toBeInViewport();
  });
}

test("the bridge adds up exactly as displayed, and ends at the answer", async ({ page }) => {
  await page.goto("/available");
  const rows = await bridge(page);
  expect(rows[0]!.label).toBe("In your accounts");
  expect(rows.at(-1)!.label).toBe("Available");
  let running = rows[0]!.amount;
  for (const row of rows.slice(1)) {
    if (/^After |^Available$/.test(row.label)) expect(row.amount, row.label).toBe(running);
    else running += row.amount;
  }
  expect(toTaka(await answer(page).innerText())).toBe(rows.at(-1)!.amount);
  await expect(page.getByText("Before new income", { exact: true })).toBeVisible();
});

test("an expense from a counted account lowers Available by exactly its amount", async ({
  page,
}) => {
  // These cash accounts sort after "Cash": other specs take the first Accounts
  // row mentioning "Cash" (which includes an account's type) as the demo Cash.
  const account = unique("Spend AV");
  await newCashAccount(page, account, "1000");
  const before = await availableNow(page);
  await spend(page, account, "250");
  expect(await availableNow(page)).toBe(before - 250);
});

test("money set aside is deducted only while it is still there", async ({ page }) => {
  const account = unique("Held AV");
  const purpose = unique("AV Purpose");
  await newCashAccount(page, account, "1000");
  await setAsideFrom(page, purpose, account, "600");
  const setAside = await availableNow(page);

  // Spending 700 leaves 300 of the 600 covered: Available falls by 400, not 700.
  await spend(page, account, "700");
  expect(await availableNow(page)).toBe(setAside - 400);
  const line = page.getByRole("listitem").filter({ hasText: purpose });
  await expect(line).toContainText("৳300 short");
  await expect(line).toContainText("not deducted");

  // Its evidence leads to the page that owns it.
  await page.getByRole("link", { name: "Open Set aside" }).click();
  await expect(page).toHaveURL(/\/set-aside$/);
});

test("each part of the evidence opens the page that owns it", async ({ page }) => {
  for (const [name, path] of [
    ["Open Accounts", "/accounts"],
    ["Open Commitments", "/commitments"],
  ] as const) {
    await page.goto("/available");
    await page.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
});
