import { expect, test, type Page } from "@playwright/test";

/**
 * Categories: the one place they are managed. Create, rename (with what a
 * used rename changes said first), archive and restore, delete only what was
 * never used, and the last active category of a kind stays. Quick Add only
 * selects: archived categories leave it, and it never manages them.
 */

const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** A row's actions, by their names (desktop and tablet: words on the row). */
const action = (page: Page, verb: string, name: string) =>
  page.getByRole("button", { name: `${verb} ${name}`, exact: true });

/** Opens the page and waits until its buttons respond (dev hydrates after paint). */
async function openCategories(page: Page, kind: "expense" | "income" = "expense") {
  await page.goto(kind === "income" ? "/categories?kind=income" : "/categories");
  await expect(page.getByRole("heading", { level: 1, name: "Categories" })).toBeVisible();
}

async function addCategory(page: Page, name: string, title = "New Expense Category") {
  const dialog = page.getByRole("dialog", { name: title });
  await expect(async () => {
    if (!(await dialog.isVisible()))
      await page.getByRole("button", { name: "Add category" }).click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(dialog).toBeHidden();
  await expect(action(page, "Rename", name)).toBeVisible();
}

const openQuickAdd = async (page: Page) => {
  const add = page.getByRole("button", { name: /^Add/ }).first();
  await expect(async () => {
    await add.click();
    await expect(page.getByRole("dialog", { name: "Add a transaction" })).toBeVisible({
      timeout: 1_000,
    });
  }).toPass({ timeout: 20_000 });
  return page.getByRole("dialog", { name: "Add a transaction" });
};

test("Categories sits in the Activity area, one kind at a time", async ({ page }) => {
  await page.goto("/activity");
  await page
    .getByRole("navigation", { name: "Activity" })
    .getByRole("link", { name: "Categories" })
    .click();
  await expect(page).toHaveURL(/\/categories$/);
  await expect(
    page
      .getByRole("navigation", { name: "Main" })
      .first()
      .getByRole("link", { name: "Activity", exact: true }),
  ).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { level: 2, name: "Expense Categories" })).toBeVisible();

  await page
    .getByRole("navigation", { name: "Category kind" })
    .getByRole("link", { name: "Income Categories" })
    .click();
  await expect(page).toHaveURL(/kind=income/);
  await expect(page.getByRole("heading", { level: 2, name: "Income Categories" })).toBeVisible();
  await expect(action(page, "Rename", "Salary")).toBeVisible();
  await expect(action(page, "Rename", "Groceries")).toHaveCount(0);
});

test("a new category can be renamed freely, and deleted after a confirmation", async ({ page }) => {
  const name = unique("Pets");
  await openCategories(page);
  await addCategory(page, name);

  // A duplicate, in any case, is refused in words.
  await page.getByRole("button", { name: "Add category" }).click();
  const dialog = page.getByRole("dialog", { name: "New Expense Category" });
  await dialog.getByLabel("Name").fill("groceries");
  await dialog.getByRole("button", { name: "Add category" }).click();
  await expect(
    dialog.getByText("There is already an Expense Category called Groceries."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  // Unused: renaming says nothing about history.
  await action(page, "Rename", name).click();
  const rename = page.getByRole("dialog", { name: `Rename ${name}` });
  await expect(rename.getByText(/past record/)).toHaveCount(0);
  await rename.getByLabel("Name").fill(`${name} care`);
  await rename.getByRole("button", { name: "Rename category" }).click();
  await expect(rename).toBeHidden();

  await action(page, "Delete", `${name} care`).click();
  const confirm = page.getByRole("dialog", { name: `Delete ${name} care?` });
  await expect(confirm).toContainText("Nothing has been recorded in it, so nothing is lost.");
  await confirm.getByRole("button", { name: "Delete category" }).click();
  await expect(action(page, "Rename", `${name} care`)).toHaveCount(0);
});

test("a used category says what a rename changes, and offers no Delete", async ({ page }) => {
  await openCategories(page);
  await expect(action(page, "Delete", "Groceries")).toHaveCount(0);
  await action(page, "Rename", "Groceries").click();
  const rename = page.getByRole("dialog", { name: "Rename Groceries" });
  await expect(rename).toContainText(/Groceries is used in \d+ past records?\./);
  await expect(rename).toContainText("Amounts and balances won't change.");
  await rename.getByRole("button", { name: "Cancel" }).click();
  await expect(rename).toBeHidden();
  // Focus returns to the button that opened the dialog.
  await expect(action(page, "Rename", "Groceries")).toBeFocused();
});

test("an archived category leaves Quick Add, keeps its records, and comes back", async ({
  page,
}) => {
  await openCategories(page);
  await action(page, "Archive", "Entertainment").click();
  const confirm = page.getByRole("dialog", { name: "Archive Entertainment?" });
  await expect(confirm).toContainText("won't be offered for new expenses");
  await confirm.getByRole("button", { name: "Archive category" }).click();
  await expect(action(page, "Restore", "Entertainment")).toBeVisible();

  const quickAdd = await openQuickAdd(page);
  await quickAdd.getByRole("button", { name: /^Category/ }).click();
  await expect(quickAdd.getByRole("option", { name: "Groceries", exact: true })).toBeVisible();
  await expect(quickAdd.getByRole("option", { name: "Entertainment", exact: true })).toHaveCount(0);
  // Quick Add selects; it never manages.
  await expect(quickAdd.getByRole("link", { name: /categor/i })).toHaveCount(0);
  await quickAdd.getByRole("button", { name: "Close" }).click();

  // Its records still carry it.
  await page.goto("/activity?q=Star%20Cineplex");
  await expect(page.getByRole("link", { name: /Star Cineplex/ }).first()).toContainText(
    "Entertainment",
  );

  await openCategories(page);
  await action(page, "Restore", "Entertainment").click();
  await expect(action(page, "Archive", "Entertainment")).toBeVisible();
});

test("the last active Income Category stays, and says why", async ({ page }) => {
  await openCategories(page, "income");
  // Unused, it archives at once (with Undo); used, it asks first.
  await action(page, "Archive", "Other Income").click();
  const confirm = page.getByRole("dialog", { name: "Archive Other Income?" });
  await expect(action(page, "Restore", "Other Income").or(confirm)).toBeVisible();
  if (await confirm.isVisible()) {
    await confirm.getByRole("button", { name: "Archive category" }).click();
  }
  await expect(action(page, "Restore", "Other Income")).toBeVisible();

  await expect(action(page, "Delete", "Salary")).toHaveCount(0);
  await action(page, "Archive", "Salary").click();
  const why = page.getByRole("dialog", { name: "Salary stays active" });
  await expect(why).toContainText(
    "Keep at least one Income Category active so new income can be recorded.",
  );
  await why.getByRole("button", { name: "OK" }).click();
  await expect(action(page, "Archive", "Salary")).toBeVisible();

  await action(page, "Restore", "Other Income").click();
  await expect(action(page, "Archive", "Other Income")).toBeVisible();
});

test("a transfer fee chooses its category, whatever Fees & Charges is called", async ({ page }) => {
  await openCategories(page);
  const quickAdd = await openQuickAdd(page);
  await quickAdd.getByRole("radio", { name: "Transfer" }).click();
  await quickAdd.getByRole("button", { name: "Add a fee" }).click();
  await expect(quickAdd.getByRole("button", { name: /^Fee category/ })).toHaveAccessibleName(
    "Fee category Fees & Charges",
  );
});

test("Activity's type filter calls expense rows Expenses", async ({ page }) => {
  await page.goto("/activity");
  const type = page.getByLabel("Type");
  await expect(type.locator("option", { hasText: "Expenses" })).toHaveCount(1);
  await expect(type.locator("option", { hasText: "Spending" })).toHaveCount(0);
  await expect(page.getByLabel("Category").locator("optgroup")).toHaveCount(2);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("each row has one Manage button, and its actions open in a sheet", async ({ page }) => {
    await openCategories(page);
    await expect(action(page, "Rename", "Housing")).toBeHidden();
    const manage = page.getByRole("button", { name: "Manage Housing" });
    await expect(async () => {
      await manage.click();
      await expect(page.getByRole("dialog", { name: "Housing" })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    const sheet = page.getByRole("dialog", { name: "Housing" });
    await expect(sheet.getByRole("button", { name: "Rename Housing" })).toBeVisible();
    await sheet.getByRole("button", { name: "Rename Housing" }).click();
    await expect(page.getByRole("dialog", { name: "Rename Housing" })).toContainText(
      "Amounts and balances won't change.",
    );
    await page.keyboard.press("Escape");
    await expect(manage).toBeFocused();

    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});
