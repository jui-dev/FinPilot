import { expect, test, type Locator, type Page } from "@playwright/test";
import { choose, describeEntry } from "./quick-add-steps";

/**
 * The shared overlays (Modal, SidePanel, and both as phone sheets): closing one
 * returns focus to what opened it, a toast never sits over an open overlay's
 * content, and using a toast's Undo never closes the overlay that is open.
 * Entries go to an account made here, so no other spec's balances move.
 */

test.describe.configure({ mode: "serial" });

const account = `Overlay ${Date.now().toString(36)}`;

async function openDialog(page: Page, open: () => Promise<void>) {
  await expect(async () => {
    await open();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

const newAccountButton = (page: Page) => page.getByRole("button", { name: /^New account/ }).first();
const verifyButton = (page: Page) =>
  page
    .getByRole("listitem")
    .filter({ hasText: account })
    .first()
    .getByRole("button", { name: /^Verify/ });
const quickAddButton = (page: Page, width: number) =>
  width < 768
    ? page.getByRole("button", { name: "Add a transaction" })
    : page.locator("header").getByRole("button", { name: /Add/ }).first();

/** A box once the element's own animations (the toast's pop-in, a sheet's slide) have finished. */
const box = async (locator: Locator) => {
  await locator.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return (await locator.boundingBox())!;
};

/** Quick Add an expense of ৳1 from this spec's account. */
async function fillEntry(page: Page, amount = "1") {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount in taka").fill(amount);
  await choose(dialog, "Paid from", account);
}

test("a side panel returns focus to its opener, after Escape and after saving", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/accounts");

  await openDialog(page, () => newAccountButton(page).click());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(newAccountButton(page)).toBeFocused();

  // After a successful save the panel closes and focus goes back to the same button.
  await openDialog(page, () => newAccountButton(page).click());
  const create = page.getByRole("dialog");
  await create.getByLabel("Name").fill(account);
  await create.getByRole("radio", { name: "Cash" }).click();
  await create.getByLabel("Balance on that date").fill("5000");
  await create.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(newAccountButton(page)).toBeFocused();

  // A row's own panel returns focus to that row's button.
  await openDialog(page, () => verifyButton(page).click());
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(verifyButton(page)).toBeFocused();
});

test("a dialog returns focus to its opener, and a phone sheet to its tab", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await openDialog(page, () => quickAddButton(page, 1280).click());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(quickAddButton(page, 1280)).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openDialog(page, () => quickAddButton(page, 390).click());
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(quickAddButton(page, 390)).toBeFocused();
});

test("Undo on the toast keeps Quick Add open with the next entry intact", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/accounts");
  await openDialog(page, () => quickAddButton(page, 1280).click());
  const dialog = page.getByRole("dialog");
  await fillEntry(page, "11");
  // Save & add another: the entry is saved and Quick Add stays open for the next one.
  await dialog.getByLabel("Amount in taka").press("Control+Enter");
  await expect(page.getByRole("status")).toContainText("Saved");
  await expect(dialog).toBeVisible();

  // The next entry, half typed.
  await dialog.getByLabel("Amount in taka").fill("22");
  await describeEntry(dialog, "The next one");

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("status")).toContainText("Entry removed.");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Amount in taka")).toHaveValue("22");
  await expect(dialog.getByLabel("Description")).toHaveValue("The next one");
});

for (const [width, height] of [
  [390, 844],
  [390, 667],
  [820, 1180],
  [1024, 768],
  [1280, 900],
] as const) {
  test(`at ${width}×${height} a toast rests where it did, and stays clear of open overlays`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/accounts");
    const dialog = page.getByRole("dialog");
    const toast = page.getByRole("status");

    // No overlay open: the toast rests above the phone tab bar, or 24px from the bottom.
    await openDialog(page, () => quickAddButton(page, width).click());
    await fillEntry(page);
    await dialog.getByRole("button", { name: /Save expense/ }).click();
    await expect(dialog).toBeHidden();
    // Saving closes Quick Add and returns focus to the control that opened it.
    await expect(quickAddButton(page, width)).toBeFocused();
    await expect(toast).toContainText("Saved");
    const resting = await box(toast);
    expect(Math.round(resting.y + resting.height)).toBe(height - (width < 768 ? 76 : 24));

    // A side panel (a bottom sheet on phones) opened while that toast still shows.
    await openDialog(page, () => verifyButton(page).click());
    const [panel, overPanel] = [await box(dialog), await box(toast)];
    const apart =
      overPanel.y + overPanel.height <= panel.y || overPanel.x + overPanel.width <= panel.x;
    expect(apart, "toast overlaps the side panel").toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // A toast raised while Quick Add stays open (save & add another) sits above its content.
    await openDialog(page, () => quickAddButton(page, width).click());
    await fillEntry(page);
    await dialog.getByLabel("Amount in taka").press("Control+Enter");
    await expect(toast).toContainText("Saved");
    const [overDialog, firstControl] = [
      await box(toast),
      await box(dialog.getByRole("radio").first()),
    ];
    // A full-height phone sheet leaves 8% of the screen free: on a 667px phone a
    // two-line toast reaches into the sheet's top padding, by at most a pixel onto
    // its first control (design-direction.md §7).
    const allowance = height < 700 ? 1 : 0;
    expect(overDialog.y + overDialog.height).toBeLessThanOrEqual(firstControl.y + allowance);
  });
}
