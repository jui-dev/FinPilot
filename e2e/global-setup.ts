import { spawnSync } from "node:child_process";

import { E2E_DATABASE_PATH } from "../playwright.config";

/** A fresh demo ledger for every end-to-end run. */
export default function globalSetup() {
  // Node + tsx directly (not the npm shim), so this behaves the same on every platform.
  const result = spawnSync(
    process.execPath,
    ["node_modules/tsx/dist/cli.mjs", "scripts/db-reset.ts"],
    {
      stdio: "inherit",
      env: { ...process.env, DATABASE_PATH: E2E_DATABASE_PATH },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Could not prepare the end-to-end database.");
}
