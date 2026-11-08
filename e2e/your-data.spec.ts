import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

/**
 * Settings' Your data: a backup and a spreadsheet, saved by the browser, built
 * from the ledger the page is showing. Downloading changes nothing.
 */

test("Settings downloads a complete backup and the transactions as a spreadsheet", async ({
  page,
}) => {
  await page.goto("/settings");
  const panel = page.getByRole("region", { name: "Your data" });
  await expect(panel).toBeVisible();

  const [backupFile] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("link", { name: /Download backup/ }).click(),
  ]);
  expect(backupFile.suggestedFilename()).toMatch(/^finpilot-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await readFile((await backupFile.path())!, "utf8"));
  expect(backup.format).toBe("finpilot-backup");
  expect(backup.tables.accounts.map((a: { name: string }) => a.name)).toEqual(
    expect.arrayContaining(["Bank", "Cash", "bKash", "Savings", "Visa card"]),
  );
  expect(backup.tables.transactions.length).toBeGreaterThan(100);

  const [csvFile] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("link", { name: /Export transactions/ }).click(),
  ]);
  expect(csvFile.suggestedFilename()).toMatch(/^finpilot-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = (await readFile((await csvFile.path())!, "utf8"))
    .replace(/^﻿/, "")
    .trimEnd()
    .split("\r\n");
  expect(lines[0]).toBe("Date,Type,Amount (BDT),Account,To account,Category,Description,Note");
  // One line per active transaction: the backup also keeps deleted ones.
  const active = backup.tables.transactions.filter(
    (t: { deleted_at: string | null }) => !t.deleted_at,
  );
  expect(lines).toHaveLength(active.length + 1);

  // Nothing changed: the page still reads the same, and stays put.
  await expect(page).toHaveURL(/\/settings$/);
});
