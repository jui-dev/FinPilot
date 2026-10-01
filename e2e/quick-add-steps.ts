import { expect, type Locator } from "@playwright/test";

/**
 * Quick Add's steps, as a person takes them, shared by every flow that records
 * through it. A row (Category, Paid from, Received in, From, To, Fee category)
 * opens its list in place of the form; choosing returns to the form.
 */
export async function choose(dialog: Locator, row: string, option: string) {
  await dialog.getByRole("button", { name: new RegExp(`^${row}\\b`) }).click();
  await dialog.getByRole("option", { name: option, exact: true }).click();
  await expect(dialog.getByRole("listbox")).toBeHidden();
}

/** Fills the description, opening its field first when it is still folded away. */
export async function describeEntry(dialog: Locator, text: string) {
  const add = dialog.getByRole("button", { name: "Add description" });
  if (await add.isVisible()) await add.click();
  await dialog.getByLabel("Description").fill(text);
}

/** Dates the entry: Today and Yesterday are one click; anything earlier goes in the date field. */
export async function dateEntry(dialog: Locator, isoDate: string) {
  await dialog.getByRole("radio", { name: "Earlier" }).click();
  await dialog.getByLabel("Earlier date").fill(isoDate);
}
