/**
 * Schema drift check: fails if src/db/schema.ts has changes that no committed
 * migration captures. Runs drizzle-kit against a scratch copy of the
 * migrations folder, so the repository's migrations are never modified.
 *
 * drizzle-kit quirks handled here (0.31.x):
 * - `--out` is joined onto the working directory even when absolute, so the
 *   scratch copy lives inside the project (.cache/, git-ignored);
 * - it can exit 0 after an internal error, so success requires its explicit
 *   "No schema changes" message, not just the absence of new files.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";

const scratch = path.join(".cache", `drift-check-${process.pid}`);
const copy = path.join(scratch, "migrations");

try {
  mkdirSync(scratch, { recursive: true });
  cpSync("src/db/migrations", copy, { recursive: true });
  const before = readdirSync(copy);
  const run = spawnSync(
    process.execPath,
    [
      "node_modules/drizzle-kit/bin.cjs",
      "generate",
      "--dialect=sqlite",
      "--schema=./src/db/schema.ts",
      `--out=./${copy.replaceAll("\\", "/")}`,
      "--name=drift_probe",
    ],
    { encoding: "utf8" },
  );
  const output = `${run.stdout}\n${run.stderr}`;
  const added = readdirSync(copy).filter((f) => !before.includes(f));

  if (run.status === 0 && added.length === 0 && /No schema changes/i.test(output)) {
    console.log("Schema and migrations are in sync.");
  } else if (added.length > 0) {
    console.error(`Schema drift: schema.ts has changes without a migration (${added.join(", ")}).`);
    console.error("Run `npm run db:generate` and commit the reviewed SQL.");
    process.exitCode = 1;
  } else {
    console.error("Drift check could not run drizzle-kit reliably:\n" + output);
    process.exitCode = 1;
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
