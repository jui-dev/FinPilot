import { expect, test, type Page } from "@playwright/test";

/**
 * Roadmap flow 3: commitments, from an empty page to a payment in the ledger.
 *
 * The demo seed has no commitments, so the first test sees the empty page;
 * every later test creates its own, uniquely named, dated relative to today in
 * the owner's time zone (Asia/Dhaka), so they depend on no particular data.
 */

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
  // In dev the page becomes interactive a moment after it paints.
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function createCommitment(
  page: Page,
  { name, amount, firstDue }: { name: string; amount: string; firstDue: string },
) {
  await page.goto("/commitments");
  await openDialog(page, () =>
    page.getByRole("button", { name: "New commitment" }).first().click(),
  );
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Expected amount").fill(amount);
  await dialog.getByLabel("First due date").fill(firstDue);
  await dialog.getByLabel("Category").selectOption({ label: "Housing" });
  await dialog.getByLabel("Usually paid from (optional)").selectOption({ label: "Bank" });
  await dialog.getByRole("button", { name: "Add commitment" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
}

const section = (page: Page, name: string) => page.getByRole("region", { name });

test("Commitments is reachable through the Plan section and explains itself when empty", async ({
  page,
}) => {
  await page.goto("/activity");
  await page
    .getByRole("navigation", { name: "Main" })
    .first()
    .getByRole("link", { name: "Plan", exact: true })
    .click();
  await expect(page).toHaveURL(/\/available$/);
  await page
    .getByRole("navigation", { name: "Plan" })
    .getByRole("link", { name: "Commitments" })
    .click();
  await expect(page).toHaveURL(/\/commitments$/);
  await expect(page.getByRole("heading", { level: 1, name: "Commitments" })).toBeVisible();
  await expect(page.getByText("No commitments yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "New commitment" })).toBeVisible();
});

test("overdue, due today and upcoming occurrences read as such", async ({ page }) => {
  const overdue = unique("E2E Rent");
  const dueToday = unique("E2E Phone");
  await createCommitment(page, { name: overdue, amount: "12000", firstDue: dhakaDate(-3) });
  await createCommitment(page, { name: dueToday, amount: "900", firstDue: dhakaDate(0) });

  const attention = section(page, "Needs attention");
  await expect(attention.getByRole("listitem").filter({ hasText: overdue })).toContainText(
    "3 days overdue",
  );
  await expect(attention.getByRole("listitem").filter({ hasText: dueToday })).toContainText(
    "Due today",
  );
  // The next month's occurrence of each is coming up, not needing attention.
  await expect(
    section(page, "Coming up").getByRole("listitem").filter({ hasText: overdue }).first(),
  ).toBeVisible();
  // The rules read in plain language.
  await expect(
    section(page, "Your commitments").getByRole("button", { name: `Edit ${overdue}` }),
  ).toContainText("Monthly on the");
});

test("paying records a real expense, and Undo makes it due again", async ({ page }) => {
  const name = unique("E2E Pay");
  await createCommitment(page, { name, amount: "7500", firstDue: dhakaDate(-1) });

  const bankBefore = await bankBalance(page);
  const due = () =>
    section(page, "Needs attention").getByRole("listitem").filter({ hasText: name });
  const pay = async () => {
    await openDialog(page, () =>
      due()
        .getByRole("button", { name: new RegExp(`^Pay ${name}`) })
        .click(),
    );
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Records a real expense");
    // The commitment's usual account, Bank, is pre-selected.
    await expect(dialog.getByLabel("Paid from").locator("option:checked")).toHaveText("Bank");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByRole("status")).toContainText(`Paid ${name}`);
  };

  // Undo removes the expense at once: the obligation is due again.
  await page.goto("/commitments");
  await pay();
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText(`${name} is due again`);
  await expect(due()).toContainText("1 day overdue");
  expect(await bankBalance(page)).toBe(bankBefore);

  // Paid for real: it leaves Needs attention and shows as paid, linked to its expense.
  await page.goto("/commitments");
  await pay();
  await expect(due()).toHaveCount(0);
  const paid = section(page, "Recently paid or skipped")
    .getByRole("listitem")
    .filter({ hasText: name });
  await expect(paid).toContainText("Paid");

  // The expense is real ledger evidence: Activity opens it, and the balance fell by it.
  await paid.getByRole("link").click();
  await expect(page).toHaveURL(/\/activity\?tx=/);
  await expect(page.getByRole("dialog")).toContainText(name);
  await page.goto(`/activity?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("main")).toContainText("৳7,500");
  expect(await bankBalance(page)).toBe(bankBefore - 7_500);
});

/** The Bank balance on Accounts, in taka. */
async function bankBalance(page: Page): Promise<number> {
  await page.goto("/accounts");
  const row = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: "Bank", exact: true }) });
  const text = await row.first().innerText();
  const amounts = [...text.matchAll(/৳\s*([\d,]+)/g)].map((m) => Number(m[1]!.replace(/,/g, "")));
  return amounts[0]!;
}

test("skipping records no expense and marks it skipped", async ({ page }) => {
  const name = unique("E2E Skip");
  await createCommitment(page, { name, amount: "450", firstDue: dhakaDate(0) });

  const row = section(page, "Needs attention").getByRole("listitem").filter({ hasText: name });
  await openDialog(page, () =>
    row.getByRole("button", { name: new RegExp(`^Skip ${name}`) }).click(),
  );
  await expect(page.getByRole("dialog")).toContainText("No expense is recorded");
  await page.getByRole("dialog").getByRole("button", { name: "Skip this payment" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const skipped = section(page, "Recently paid or skipped")
    .getByRole("listitem")
    .filter({ hasText: name });
  await expect(skipped).toContainText("Skipped");
  await expect(skipped).toContainText("No expense recorded");
  await page.goto(`/activity?q=${encodeURIComponent(name)}`);
  await expect(page.getByRole("main")).not.toContainText("৳450");
});

test("editing a commitment changes what is coming, not what already happened", async ({ page }) => {
  const name = unique("E2E Edit");
  await createCommitment(page, { name, amount: "3000", firstDue: dhakaDate(-2) });

  await openDialog(page, () =>
    section(page, "Your commitments")
      .getByRole("button", { name: `Edit ${name}` })
      .click(),
  );
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Name")).toHaveValue(name);
  await dialog.getByLabel("Expected amount").fill("3200");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await expect(
    section(page, "Your commitments").getByRole("button", { name: `Edit ${name}` }),
  ).toContainText("৳3,200");
  // The overdue one keeps what was expected; the next one uses the new amount.
  await expect(
    section(page, "Needs attention").getByRole("listitem").filter({ hasText: name }),
  ).toContainText("৳3,000");
  await expect(
    section(page, "Coming up").getByRole("listitem").filter({ hasText: name }).first(),
  ).toContainText("৳3,200");
});

for (const width of [390, 820, 1024, 1280, 1920]) {
  test(`fits ${width}px with the outcome and New commitment on the first screen`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/commitments");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    await expect(page.getByRole("button", { name: "New commitment" })).toBeInViewport();
    await expect(page.getByRole("heading", { name: "Due now" })).toBeInViewport();
    if (width < 768) {
      // Phones reach it through the Plan tab, current for its whole section.
      const tab = page
        .getByRole("navigation", { name: "Main" })
        .last()
        .getByRole("link", { name: "Plan" });
      await expect(tab).toBeInViewport();
      await expect(tab).toHaveAttribute("aria-current", "true");
    }
  });
}
